'use strict';
const { query } = require('../config/database');

async function save({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, ipAddress, userAgent]
  );
}

/** Devuelve el token solo si existe, no esta revocado y no ha expirado. */
async function findValid(tokenHash) {
  const result = await query(
    `SELECT id, user_id, token, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash]
  );
  return result.recordset[0] || null;
}

/** Marca el token como usado y encadena el reemplazo (rotacion). */
async function revoke(tokenHash, replacedBy = null) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), replaced_by = $2
     WHERE token = $1 AND revoked_at IS NULL`,
    [tokenHash, replacedBy]
  );
  return result.rowsAffected > 0;
}

/** Cierra todas las sesiones del usuario (logout global, cambio de contrasena, baja). */
async function revokeAllForUser(userId) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return result.rowsAffected;
}

async function purgeExpired() {
  const result = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`
  );
  return result.rowsAffected;
}

module.exports = { save, findValid, revoke, revokeAllForUser, purgeExpired };
