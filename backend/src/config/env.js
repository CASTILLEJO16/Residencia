'use strict';
require('dotenv').config();

/**
 * Valida la configuracion al arrancar. Es preferible fallar de inmediato
 * que descubrir a media operacion que falta el JWT_SECRET.
 */
function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value.trim();
}

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`${name} debe ser numerico`);
  return parsed;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() === 'true';
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num('PORT', 4000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',').map((s) => s.trim()),

  db: {
    server: required('DB_SERVER'),
    port: num('DB_PORT', 1433),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    encrypt: bool('DB_ENCRYPT', true),
    trustServerCertificate: bool('DB_TRUST_CERT', true),
  },

  // Conexion de solo lectura para el ejecutor de KPIs (Fase 2)
  dbReadOnly: {
    server: process.env.DB_RO_SERVER || null,
    port: num('DB_RO_PORT', 1433),
    database: process.env.DB_RO_NAME || null,
    user: process.env.DB_RO_USER || null,
    password: process.env.DB_RO_PASSWORD || null,
    encrypt: bool('DB_ENCRYPT', true),
    trustServerCertificate: bool('DB_TRUST_CERT', true),
  },

  jwt: {
    secret: jwtSecret,
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshDays: num('REFRESH_TOKEN_DAYS', 7),
    issuer: 'sio-api',
    audience: 'sio-web',
  },

  mail: {
    enabled: bool('MAIL_ENABLED', false),
    host: process.env.MAIL_HOST || 'localhost',
    port: num('MAIL_PORT', 587),
    secure: bool('MAIL_SECURE', false),
    user: process.env.MAIL_USER || null,
    password: process.env.MAIL_PASSWORD || null,
    from: process.env.MAIL_FROM || 'SIO <no-reply@localhost>',
  },

  monitor: {
    enabled: bool('MONITOR_ENABLED', true),
    cron: process.env.MONITOR_CRON || '*/1 * * * *',
    purgeCron: process.env.PURGE_CRON || '0 3 * * *',
  },

  security: {
    bcryptRounds: num('BCRYPT_ROUNDS', 12),
    maxFailedAttempts: num('MAX_FAILED_ATTEMPTS', 5),
    lockoutMinutes: num('LOCKOUT_MINUTES', 15),
    passwordMinLength: 10,
  },
};
