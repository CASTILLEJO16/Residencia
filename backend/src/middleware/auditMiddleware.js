'use strict';
const AuditLogModel = require('../models/AuditLogModel');

/** IP real detras de un proxy inverso. */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Se instala desde la Fase 1 para no tener que reescribir los controladores
 * mas adelante. El controlador declara que quiere auditar con res.locals.audit
 * y aqui se escribe una vez que la respuesta se cerro, ya con el codigo HTTP.
 *
 *   res.locals.audit = { action: 'user.create', entityType: 'user',
 *                        entityId: 12, newValues: {...} };
 */
function auditMiddleware(req, res, next) {
  res.locals.audit = null;

  res.on('finish', () => {
    const entry = res.locals.audit;
    if (!entry) return;
    // Por defecto no se audita lo que fallo, salvo que se pida explicitamente.
    if (res.statusCode >= 400 && !entry.logFailures) return;

    AuditLogModel.write({
      ...entry,
      userId: entry.userId ?? req.user?.id ?? null,
      username: entry.username ?? req.user?.username ?? null,
      method: req.method,
      endpoint: req.originalUrl.split('?')[0],
      statusCode: res.statusCode,
      ipAddress: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}

/** Azucar sintactico para usar dentro de un controlador. */
function audit(res, entry) {
  res.locals.audit = entry;
}

module.exports = { auditMiddleware, audit, clientIp };
