'use strict';

/** Error con codigo HTTP, para distinguir fallos esperados de bugs. */
class AppError extends Error {
  constructor(message, statusCode = 400, code = null, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg, details)  { return new AppError(msg, 400, 'BAD_REQUEST', details); }
  static unauthorized(msg = 'No autenticado') { return new AppError(msg, 401, 'UNAUTHORIZED'); }
  static forbidden(msg = 'No autorizado')     { return new AppError(msg, 403, 'FORBIDDEN'); }
  static notFound(msg = 'Recurso no encontrado') { return new AppError(msg, 404, 'NOT_FOUND'); }
  static conflict(msg)  { return new AppError(msg, 409, 'CONFLICT'); }
  static locked(msg)    { return new AppError(msg, 423, 'LOCKED'); }
}

module.exports = AppError;
