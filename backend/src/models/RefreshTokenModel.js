'use strict';
const { query } = require('../config/database');

async function save({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenHash, expiresAt, ipAddress, userAgent]
  );
}

/** Devuelve el token solo si existe, no esta revocado y no ha expirado. */
async function findValid(tokenHash) {
  const result = await query(
    `SELECT id, user_id, token, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')`,
    [tokenHash]
  );
  return result.recordset[0] || null;
}

/** Marca el token como usado y encadena el reemplazo (rotacion). */
async function revoke(tokenHash, replacedBy = null) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = datetime('now'), replaced_by = ?
     WHERE token = ? AND revoked_at IS NULL`,
    [replacedBy, tokenHash]
  );
  return result.rowsAffected > 0;
}

/** Cierra todas las sesiones del usuario (logout global, cambio de contrasena, baja). */
async function revokeAllForUser(userId) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = datetime('now')
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  return result.rowsAffected;
}

async function purgeExpired() {
  const result = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < datetime('now', '-7 days')`
  );
  return result.rowsAffected;
}

module.exports = { save, findValid, revoke, revokeAllForUser, purgeExpired };
