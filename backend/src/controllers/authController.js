'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const { signAccessToken, generateRefreshToken, hashToken } = require('../config/jwt');
const UserModel = require('../models/UserModel');
const ldapService = require('../services/ldapService');
const RefreshTokenModel = require('../models/RefreshTokenModel');
const AuditLogModel = require('../models/AuditLogModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const password = require('../utils/password');
const { audit, clientIp } = require('../middleware/auditMiddleware');
const { query } = require('../config/database');

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

/**
 * El refresh token viaja SOLO en una cookie httpOnly (no accesible desde
 * JavaScript), limitada a /api/auth y con SameSite=Strict. El access token
 * se devuelve en el cuerpo y el frontend lo guarda solo en memoria.
 */
const REFRESH_COOKIE = 'sio_rt';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/auth',
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: config.jwt.refreshDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

function readRefreshToken(req) {
  const token = req.cookies?.[REFRESH_COOKIE];
  return typeof token === 'string' && /^[a-f0-9]{96}$/.test(token) ? token : null;
}

async function issueSession(user, req, res) {
  const accessToken = signAccessToken(user);
  const { token, hash } = generateRefreshToken();

  const id = await RefreshTokenModel.save({
    userId: user.id,
    tokenHash: hash,
    expiresAt: refreshExpiry(),
    ipAddress: clientIp(req),
    userAgent: (req.headers['user-agent'] || '').slice(0, 255),
  });

  setRefreshCookie(res, token);
  return { accessToken, refreshTokenId: id };
}

/**
 * Busca el id del rol del SIO correspondiente a los grupos de Active Directory.
 *
 * Los roles de la base se llaman SIO_Admin, SIO_Analistas, SIO_Auditoria y
 * SIO_Consulta; ldapService.resolveRole traduce los grupos de AD (cuyo nombre
 * real se configura con AD_GROUP_*) al de mayor privilegio.
 */
async function getRoleIdFromADGroups(groups = []) {
  const roleName = ldapService.resolveRole(groups);
  if (!roleName) return null;

  const result = await query(
    'SELECT id FROM roles WHERE name = ? LIMIT 1',
    [roleName]
  );

  return result.recordset[0]?.id || null;
}

/** Solo los fallos de conexion con el directorio permiten caer al login local. */
function isDirectoryUnavailable(err) {
  if (err instanceof AppError) {
    return err.code === 'AD_UNAVAILABLE' || err.code === 'AD_TLS';
  }
  return true; // error inesperado de red/libreria
}

/**
 * POST /api/auth/login
 *
 * Si LDAP/AD está configurado:
 *   1. Valida usuario y contraseña contra Active Directory.
 *   2. Obtiene sus grupos.
 *   3. Convierte el grupo AD en un rol de SQLite.
 *   4. Crea o sincroniza el usuario en SQLite.
 *   5. Mantiene las sesiones, JWT y refresh tokens en SQLite.
 *
 * Si LDAP no está configurado:
 *   utiliza el login local original.
 */
const login = asyncHandler(async (req, res) => {
  const { username, password: plain } = req.body;

  const genericError = AppError.unauthorized(
    'Usuario o contrasena incorrectos'
  );

  // ============================================================
  // LOGIN ACTIVE DIRECTORY
  // ============================================================

  if (config.ldap.url) {
    let directoryUser = null;
    try {
      directoryUser = await ldapService.authenticate(username, plain);
      if (!directoryUser) throw genericError;
    } catch (err) {
      // Credenciales incorrectas, cuenta deshabilitada/bloqueada en AD, etc.:
      // se responde tal cual, sin intentar el login local.
      if (!isDirectoryUnavailable(err)) throw err;

      // El directorio no responde. Solo se cae al login local si
      // LDAP_FALLBACK_LOCAL lo permite (por defecto: si en desarrollo, no en
      // produccion), para que un corte del controlador de dominio no reabra
      // las cuentas locales en produccion.
      if (!config.ldap.fallbackLocal) {
        console.error('[AUTH AD] LDAP no disponible:', err.message);
        throw new AppError(
          'El servicio de directorio no esta disponible. Intente mas tarde',
          503,
          'AD_UNAVAILABLE'
        );
      }
      console.warn('[AUTH AD] LDAP no disponible, usando autenticacion local:', err.message);
    }

    if (directoryUser) {
      // Obtener rol desde los grupos de AD
      const roleId = await getRoleIdFromADGroups(
        directoryUser.groups || []
      );

      if (!roleId) {
        console.warn(
          `[AUTH AD] ${directoryUser.username} no tiene un grupo del SIO. ` +
          `Grupos que devolvio AD: ${(directoryUser.groups || []).join(', ') || '(ninguno)'}. ` +
          `Se esperaba alguno de: ${Object.values(config.ldap.groups).join(', ')}`
        );
        await AuditLogModel.write({
          action: 'auth.login_failed',
          entityType: 'user',
          username: directoryUser.username,
          method: req.method,
          endpoint: req.originalUrl,
          statusCode: 403,
          ipAddress: clientIp(req),
          userAgent: req.headers['user-agent'],
          newValues: {
            reason: 'sin_grupo_sio',
            groups: directoryUser.groups || [],
          },
        });

        throw AppError.forbidden(
          'El usuario no tiene un grupo autorizado en SIO'
        );
      }

      // Buscar si el usuario AD ya existe en SQLite
      let user = await UserModel.findByUsername(
        directoryUser.username
      );

      if (user) {
        // Actualizar información proveniente de AD
        user = await UserModel.syncDirectoryUser(user.id, {
          email: directoryUser.email,
          fullName: directoryUser.fullName,
          roleId,
        });
      } else {
        // Crear usuario AD en SQLite.
        // La contraseña almacenada aquí NO se utiliza para
        // autenticar al usuario AD.
        const temporaryPassword = crypto.randomBytes(48).toString('base64');

        const passwordHash = await password.hash(
          temporaryPassword
        );

        user = await UserModel.create({
          username: directoryUser.username,
          email: directoryUser.email,
          fullName: directoryUser.fullName,
          passwordHash,
          roleId,
          mustChangePassword: false,
        });
      }

      if (!user) {
        throw AppError.internal(
          'No fue posible crear o sincronizar el usuario'
        );
      }

      if (!user.is_active) {
        throw AppError.forbidden(
          'La cuenta esta desactivada. Contacte al administrador'
        );
      }

      // Registrar acceso exitoso en SQLite
      await UserModel.registerSuccessfulLogin(user.id);

      // Crear sesión normal de SQLite/JWT
      const { accessToken } = await issueSession(user, req, res);

      audit(res, {
        userId: user.id,
        username: user.username,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        newValues: {
          authSource: 'ad',
          groups: directoryUser.groups || [],
        },
      });

      return res.json({
        success: true,
        data: {
          user: publicUser(user),
          accessToken,
          expiresIn: config.jwt.accessTtl,
        },
      });
    }
  }

  // ============================================================
  // LOGIN LOCAL
  // ============================================================

  const user = await UserModel.findByUsernameWithSecret(username);

  if (!user) {
    // Comparación ficticia para evitar diferencias de tiempo
    // entre usuario existente y usuario inexistente.
    await password.verify(
      plain,
      '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
    );

    await AuditLogModel.write({
      action: 'auth.login_failed',
      entityType: 'user',
      username,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: 401,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      newValues: {
        reason: 'usuario_inexistente',
      },
    });

    throw genericError;
  }

  if (
    user.locked_until &&
    new Date(user.locked_until) > new Date()
  ) {
    const minutes = Math.ceil(
      (new Date(user.locked_until) - Date.now()) / 60000
    );

    throw AppError.locked(
      `Cuenta bloqueada. Intente de nuevo en ${minutes} minuto(s)`
    );
  }

  if (!user.is_active) {
    throw AppError.forbidden(
      'La cuenta esta desactivada. Contacte al administrador'
    );
  }

  const valid = await password.verify(
    plain,
    user.password_hash
  );

  if (!valid) {
    const state = await UserModel.registerFailedLogin(
      user.id,
      config.security.maxFailedAttempts,
      config.security.lockoutMinutes
    );

    await AuditLogModel.write({
      userId: user.id,
      username: user.username,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      method: req.method,
      endpoint: req.originalUrl,
      statusCode: 401,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
      newValues: {
        attempts: state?.failed_login_attempts,
        locked: Boolean(state?.locked_until),
      },
    });

    throw genericError;
  }

  await UserModel.registerSuccessfulLogin(user.id);

  const { accessToken } = await issueSession(user, req, res);

  audit(res, {
    userId: user.id,
    username: user.username,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
  });

  res.json({
    success: true,
    data: {
      user: publicUser(user),
      accessToken,
      expiresIn: config.jwt.accessTtl,
    },
  });
});

/**
 * POST /api/auth/refresh
 *
 * Rotacion estricta: cada refresh consume el token anterior.
 * Si llega un token revocado hace tiempo (posible robo y reuso) se cierran
 * todas las sesiones del usuario. Un reuso de pocos segundos se trata como
 * una carrera normal (dos pestanas renovando a la vez) y solo se rechaza.
 */
const REUSE_GRACE_SECONDS = 30;

const refresh = asyncHandler(async (req, res) => {
  const incoming = readRefreshToken(req);
  if (!incoming) {
    throw AppError.unauthorized('Sesion no iniciada');
  }
  const incomingHash = hashToken(incoming);

  const stored = await RefreshTokenModel.findByHash(incomingHash);

  if (!stored || stored.expired) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Refresh token invalido o expirado');
  }

  if (stored.revoked_at) {
    if (stored.revoked_seconds_ago > REUSE_GRACE_SECONDS) {
      const count = await RefreshTokenModel.revokeAllForUser(stored.user_id);
      await AuditLogModel.write({
        userId: stored.user_id,
        action: 'auth.refresh_reuse',
        entityType: 'user',
        entityId: stored.user_id,
        method: req.method,
        endpoint: req.originalUrl,
        statusCode: 401,
        ipAddress: clientIp(req),
        userAgent: req.headers['user-agent'],
        newValues: { sessionsRevoked: count },
      });
      clearRefreshCookie(res);
    }
    throw AppError.unauthorized('Refresh token invalido o expirado');
  }

  const user = await UserModel.findById(stored.user_id);

  if (!user || !user.is_active) {
    await RefreshTokenModel.revokeAllForUser(stored.user_id);
    clearRefreshCookie(res);
    throw AppError.forbidden('La cuenta no esta disponible');
  }

  // Se consume el token de forma atomica: si otra peticion lo uso en
  // paralelo, esta pierde la carrera y no se emite una sesion nueva.
  const consumed = await RefreshTokenModel.revoke(incomingHash);
  if (!consumed) {
    throw AppError.unauthorized('Refresh token invalido o expirado');
  }

  const { accessToken, refreshTokenId } = await issueSession(user, req, res);
  await RefreshTokenModel.linkReplacement(incomingHash, refreshTokenId);

  res.json({
    success: true,
    data: {
      user: publicUser(user),
      accessToken,
      expiresIn: config.jwt.accessTtl,
    },
  });
});

/**
 * POST /api/auth/logout
 *
 * Revoca el refresh token de la cookie y la borra.
 */
const logout = asyncHandler(async (req, res) => {
  const refreshToken = readRefreshToken(req);

  if (refreshToken) {
    await RefreshTokenModel.revoke(hashToken(refreshToken));
  }
  clearRefreshCookie(res);

  audit(res, {
    action: 'auth.logout',
    entityType: 'user',
    entityId: req.user?.id,
  });

  res.json({
    success: true,
    data: {
      message: 'Sesion cerrada',
    },
  });
});

/**
 * POST /api/auth/logout-all
 *
 * Cierra todas las sesiones del usuario.
 */
const logoutAll = asyncHandler(async (req, res) => {
  const count = await RefreshTokenModel.revokeAllForUser(
    req.user.id
  );
  clearRefreshCookie(res);

  audit(res, {
    action: 'auth.logout_all',
    entityType: 'user',
    entityId: req.user.id,
    newValues: {
      sessionsRevoked: count,
    },
  });

  res.json({
    success: true,
    data: {
      message: `Se cerraron ${count} sesion(es)`,
    },
  });
});

/**
 * GET /api/auth/me
 */
const me = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.user.id);

  if (!user) {
    throw AppError.notFound(
      'Usuario no encontrado'
    );
  }

  res.json({
    success: true,
    data: publicUser(user),
  });
});

/**
 * POST /api/auth/change-password
 *
 * Cambiar la contrasena invalida el resto de sesiones.
 *
 * Nota:
 * Los usuarios AD se autentican contra Active Directory.
 * Esta ruta conserva el comportamiento original para cuentas locales.
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const currentHash = await UserModel.findPasswordHash(
    req.user.id
  );

  if (!currentHash) {
    throw AppError.notFound(
      'Usuario no encontrado'
    );
  }

  const valid = await password.verify(
    currentPassword,
    currentHash
  );

  if (!valid) {
    throw AppError.badRequest(
      'La contrasena actual no es correcta'
    );
  }

  await UserModel.setPassword(
    req.user.id,
    await password.hash(newPassword),
    {
      mustChange: false,
    }
  );

  await RefreshTokenModel.revokeAllForUser(
    req.user.id
  );
  clearRefreshCookie(res);

  audit(res, {
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: req.user.id,
  });

  res.json({
    success: true,
    data: {
      message: 'Contrasena actualizada. Vuelva a iniciar sesion.',
    },
  });
});

module.exports = {
  _internal: { getRoleIdFromADGroups, isDirectoryUnavailable },
  login,
  refresh,
  logout,
  logoutAll,
  me,
  changePassword,
};
