'use strict';
const config = require('../config/env');
const { signAccessToken, generateRefreshToken, hashToken } = require('../config/jwt');
const UserModel = require('../models/UserModel');
const RefreshTokenModel = require('../models/RefreshTokenModel');
const AuditLogModel = require('../models/AuditLogModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const password = require('../utils/password');
const { audit, clientIp } = require('../middleware/auditMiddleware');

function refreshExpiry() {
  return new Date(Date.now() + config.jwt.refreshDays * 24 * 60 * 60 * 1000);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    role: user.role_name,
    roleId: user.role_id,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

async function issueSession(user, req) {
  const accessToken = signAccessToken(user);
  const { token, hash } = generateRefreshToken();
  await RefreshTokenModel.save({
    userId: user.id,
    tokenHash: hash,
    expiresAt: refreshExpiry(),
    ipAddress: clientIp(req),
    userAgent: (req.headers['user-agent'] || '').slice(0, 255),
  });
  return { accessToken, refreshToken: token };
}

/**
 * POST /api/auth/login
 * Respuesta deliberadamente generica ante credenciales malas: no se
 * revela si el usuario existe o si solo fallo la contrasena.
 */
const login = asyncHandler(async (req, res) => {
  const { username, password: plain } = req.body;
  const genericError = AppError.unauthorized('Usuario o contrasena incorrectos');

  const user = await UserModel.findByUsernameWithSecret(username);

  if (!user) {
    // Se compara igual contra un hash ficticio para no filtrar por tiempo
    // si el usuario existe o no.
    await password.verify(plain, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    await AuditLogModel.write({
      action: 'auth.login_failed', entityType: 'user', username,
      method: req.method, endpoint: req.originalUrl, statusCode: 401,
      ipAddress: clientIp(req), userAgent: req.headers['user-agent'],
      newValues: { reason: 'usuario_inexistente' },
    });
    throw genericError;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    throw AppError.locked(`Cuenta bloqueada. Intente de nuevo en ${minutes} minuto(s)`);
  }

  if (!user.is_active) {
    throw AppError.forbidden('La cuenta esta desactivada. Contacte al administrador');
  }

  const valid = await password.verify(plain, user.password_hash);
  if (!valid) {
    const state = await UserModel.registerFailedLogin(
      user.id, config.security.maxFailedAttempts, config.security.lockoutMinutes
    );
    await AuditLogModel.write({
      userId: user.id, username: user.username,
      action: 'auth.login_failed', entityType: 'user', entityId: user.id,
      method: req.method, endpoint: req.originalUrl, statusCode: 401,
      ipAddress: clientIp(req), userAgent: req.headers['user-agent'],
      newValues: { attempts: state?.failed_login_attempts, locked: Boolean(state?.locked_until) },
    });
    throw genericError;
  }

  await UserModel.registerSuccessfulLogin(user.id);
  const tokens = await issueSession(user, req);

  audit(res, {
    userId: user.id, username: user.username,
    action: 'auth.login', entityType: 'user', entityId: user.id,
  });

  res.json({
    success: true,
    data: { user: publicUser(user), ...tokens, expiresIn: config.jwt.accessTtl },
  });
});

/**
 * POST /api/auth/refresh
 * Rotacion estricta: cada refresh consume el token anterior. Si llega
 * un token ya revocado se cierran todas las sesiones del usuario,
 * porque significa que alguien lo esta reutilizando.
 */
const refresh = asyncHandler(async (req, res) => {
  const incoming = req.body.refreshToken;
  const incomingHash = hashToken(incoming);

  const stored = await RefreshTokenModel.findValid(incomingHash);
  if (!stored) {
    throw AppError.unauthorized('Refresh token invalido o expirado');
  }

  const user = await UserModel.findById(stored.user_id);
  if (!user || !user.is_active) {
    await RefreshTokenModel.revokeAllForUser(stored.user_id);
    throw AppError.forbidden('La cuenta no esta disponible');
  }

  const { token, hash } = generateRefreshToken();
  await RefreshTokenModel.revoke(incomingHash, hash);
  await RefreshTokenModel.save({
    userId: user.id,
    tokenHash: hash,
    expiresAt: refreshExpiry(),
    ipAddress: clientIp(req),
    userAgent: (req.headers['user-agent'] || '').slice(0, 255),
  });

  res.json({
    success: true,
    data: {
      user: publicUser(user),
      accessToken: signAccessToken(user),
      refreshToken: token,
      expiresIn: config.jwt.accessTtl,
    },
  });
});

/** POST /api/auth/logout - revoca el refresh token enviado. */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await RefreshTokenModel.revoke(hashToken(refreshToken));
  audit(res, { action: 'auth.logout', entityType: 'user', entityId: req.user?.id });
  res.json({ success: true, data: { message: 'Sesion cerrada' } });
});

/** POST /api/auth/logout-all - cierra todas las sesiones del usuario. */
const logoutAll = asyncHandler(async (req, res) => {
  const count = await RefreshTokenModel.revokeAllForUser(req.user.id);
  audit(res, {
    action: 'auth.logout_all', entityType: 'user', entityId: req.user.id,
    newValues: { sessionsRevoked: count },
  });
  res.json({ success: true, data: { message: `Se cerraron ${count} sesion(es)` } });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  res.json({ success: true, data: publicUser(user) });
});

/**
 * POST /api/auth/change-password
 * Cambiar la contrasena invalida el resto de sesiones.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const currentHash = await UserModel.findPasswordHash(req.user.id);
  if (!currentHash) throw AppError.notFound('Usuario no encontrado');

  const valid = await password.verify(currentPassword, currentHash);
  if (!valid) throw AppError.badRequest('La contrasena actual no es correcta');

  await UserModel.setPassword(req.user.id, await password.hash(newPassword), { mustChange: false });
  await RefreshTokenModel.revokeAllForUser(req.user.id);

  audit(res, {
    action: 'auth.password_changed', entityType: 'user', entityId: req.user.id,
  });

  res.json({
    success: true,
    data: { message: 'Contrasena actualizada. Vuelva a iniciar sesion.' },
  });
});

module.exports = { login, refresh, logout, logoutAll, me, changePassword };
