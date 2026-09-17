'use strict';
const { verifyAccessToken } = require('../config/jwt');
const UserModel = require('../models/UserModel');
const AppError = require('../utils/AppError');

/**
 * Verifica el JWT y ademas consulta el estado actual del usuario.
 * La consulta extra es intencional: sin ella, desactivar una cuenta
 * no surte efecto hasta que expire el token.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw AppError.unauthorized('Token no proporcionado');
    }

    let payload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Token expirado', 401, 'TOKEN_EXPIRED');
      }
      throw AppError.unauthorized('Token invalido');
    }

    const user = await UserModel.getAuthState(payload.sub);
    if (!user) throw AppError.unauthorized('El usuario ya no existe');
    if (!user.is_active) throw AppError.forbidden('La cuenta esta desactivada');

    req.user = {
      id: user.id,
      username: user.username,
      roleId: user.role_id,
      role: user.role_name,
      mustChangePassword: user.must_change_password,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Bloquea el resto de la API mientras el usuario tenga una contrasena
 * temporal pendiente de cambio.
 */
function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword) {
    return next(new AppError(
      'Debe cambiar su contrasena antes de continuar', 403, 'PASSWORD_CHANGE_REQUIRED'
    ));
  }
  next();
}

module.exports = { authenticate, requirePasswordChanged };
