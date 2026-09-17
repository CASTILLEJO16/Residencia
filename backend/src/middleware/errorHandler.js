'use strict';
const AppError = require('../utils/AppError');
const config = require('../config/env');

/** 404 para rutas no registradas. */
function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/** Traduce los errores nativos de SQL Server a respuestas entendibles. */
function translateSqlError(err) {
  if (err.number === 2627 || err.number === 2601) {
    return AppError.conflict('Ya existe un registro con esos valores unicos');
  }
  if (err.number === 547) {
    return AppError.conflict('La operacion viola una restriccion de integridad referencial');
  }
  if (err.code === 'ETIMEOUT' || err.code === 'ESOCKET') {
    return new AppError('No hay conexion con la base de datos', 503, 'DB_UNAVAILABLE');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof AppError)) {
    const translated = translateSqlError(err);
    error = translated || new AppError('Error interno del servidor', 500, 'INTERNAL_ERROR');
  }

  if (error.statusCode >= 500) {
    console.error('[error]', req.method, req.originalUrl, '-', err.message, '\n', err.stack);
  }

  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
      ...(config.isProd ? {} : { stack: err.stack }),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
