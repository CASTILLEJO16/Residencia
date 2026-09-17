'use strict';
const AppError = require('../utils/AppError');

const ROLES = {
  ADMIN: 'SIO_Admin',
  ANALISTA: 'SIO_Analistas',
  CONSULTA: 'SIO_Consulta',
  AUDITORIA: 'SIO_Auditoria',
};

/** Permite el paso solo a los roles indicados. */
function requireRole(...allowed) {
  const list = allowed.flat();
  return (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!list.includes(req.user.role)) {
      return next(AppError.forbidden(
        `Se requiere uno de los siguientes roles: ${list.join(', ')}`
      ));
    }
    next();
  };
}

/** Permite la accion si el usuario es admin o es el dueno del recurso. */
function requireSelfOrAdmin(paramName = 'id') {
  return (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    const targetId = parseInt(req.params[paramName], 10);
    if (req.user.role === ROLES.ADMIN || req.user.id === targetId) return next();
    next(AppError.forbidden('Solo puede acceder a su propia informacion'));
  };
}

module.exports = { ROLES, requireRole, requireSelfOrAdmin };
