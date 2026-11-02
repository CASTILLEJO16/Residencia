'use strict';

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

  return {
    accessToken,
    refreshToken: token,
  };
}

/**
 * Busca el rol de SQLite correspondiente a un grupo de Active Directory.
 */
async function getRoleIdFromADGroups(groups = []) {
  const roleMap = {
    SIO_Admin: 'admin',
    SIO_Analistas: 'analista',
    SIO_Consulta: 'viewer',
    SIO_Auditoria: 'viewer',
  };

  let roleName = null;

  for (const group of groups) {
    if (roleMap[group]) {
      roleName = roleMap[group];
      break;
    }
  }

  if (!roleName) {
    return null;
  }

  const result = await query(
    'SELECT id FROM roles WHERE name = ? LIMIT 1',
    [roleName]
  );

  return result.recordset[0]?.id || null;
}

/**
 * POST /api/auth/login
 *
 * Si LDAP/AD estÃ¡ configurado:
 *   1. Valida usuario y contraseÃ±a contra Active Directory.
 *   2. Obtiene sus grupos.
 *   3. Convierte el grupo AD en un rol de SQLite.
 *   4. Crea o sincroniza el usuario en SQLite.
 *   5. Mantiene las sesiones, JWT y refresh tokens en SQLite.
 *
 * Si LDAP no estÃ¡ configurado:
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

  if (config.ldap?.url) {
    try {
      const directoryUser = await ldapService.authenticate(
        username,
        plain
      );

      if (!directoryUser) {
        throw genericError;
      }

      // Obtener rol desde los grupos de AD
      const roleId = await getRoleIdFromADGroups(
        directoryUser.groups || []
      );

      if (!roleId) {
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
        // Actualizar informaciÃ³n proveniente de AD
        user = await UserModel.syncDirectoryUser(user.id, {
          email: directoryUser.email,
          fullName: directoryUser.fullName,
          roleId,
        });
      } else {
        // Crear usuario AD en SQLite.
        // La contraseÃ±a almacenada aquÃ­ NO se utiliza para
        // autenticar al usuario AD.
        const temporaryPassword = [
          'AD',
          Date.now(),
          Math.random(),
          directoryUser.username,
        ].join('-');

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

      // Crear sesiÃ³n normal de SQLite/JWT
      const tokens = await issueSession(user, req);

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
          ...tokens,
          expiresIn: config.jwt.accessTtl,
        },
      });

    } catch (err) {
      // Errores de autenticaciÃ³n/autorizaciÃ³n conocidos
      if (
        err?.statusCode === 401 ||
        err?.statusCode === 403 ||
        err?.code === 'AD_MUST_CHANGE'
      ) {
        throw err;
      }

      // Si LDAP no estÃ¡ disponible (timeout, connection error, etc.),
      // hacer fallback a autenticaciÃ³n local para desarrollo
      console.warn('[AUTH AD] LDAP no disponible, usando autenticaciÃ³n local:', err.message);
      // Continuar al login local (no throw)
    }
  }

  // ============================================================
  // LOGIN LOCAL
  // ============================================================

  const user = await UserModel.findByUsernameWithSecret(username);

  if (!user) {
    // ComparaciÃ³n ficticia para evitar diferencias de tiempo
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

  const tokens = await issueSession(user, req);

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
      ...tokens,
      expiresIn: config.jwt.accessTtl,
    },
  });
});

/**
 * POST /api/auth/refresh
 *
 * Rotacion estricta: cada refresh consume el token anterior.
 * Si llega un token ya revocado se cierran todas las sesiones
 * del usuario.
 */
const refresh = asyncHandler(async (req, res) => {
  const incoming = req.body.refreshToken;
  const incomingHash = hashToken(incoming);

  const stored = await RefreshTokenModel.findValid(incomingHash);

  if (!stored) {
    throw AppError.unauthorized(
      'Refresh token invalido o expirado'
    );
  }

  const user = await UserModel.findById(stored.user_id);

  if (!user || !user.is_active) {
    await RefreshTokenModel.revokeAllForUser(
      stored.user_id
    );

    throw AppError.forbidden(
      'La cuenta no esta disponible'
    );
  }

  const { token, hash } = generateRefreshToken();

  await RefreshTokenModel.revoke(
    incomingHash,
    hash
  );

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

/**
 * POST /api/auth/logout
 *
 * Revoca el refresh token enviado.
 */
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await RefreshTokenModel.revoke(
      hashToken(refreshToken)
    );
  }

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
  login,
  refresh,
  logout,
  logoutAll,
  me,
  changePassword,
};
