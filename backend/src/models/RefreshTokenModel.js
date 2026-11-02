'use strict';
const { query } = require('../config/database');

/** Guarda el hash del token y devuelve el id del registro. */
async function save({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenHash, expiresAt, ipAddress, userAgent]
  );
  return result.lastInsertId;
}

/** Busca el token por su hash, este o no revocado/expirado. */
async function findByHash(tokenHash) {
  const result = await query(
    `SELECT id, user_id, token, expires_at, revoked_at,
            CASE WHEN expires_at > datetime('now') THEN 0 ELSE 1 END AS expired,
            CAST((julianday('now') - julianday(revoked_at)) * 86400 AS INTEGER) AS revoked_seconds_ago
     FROM refresh_tokens
     WHERE token = ?`,
    [tokenHash]
  );
  return result.recordset[0] || null;
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

/**
 * Marca el token como usado y encadena el reemplazo (rotacion).
 * replacedById es el id (no el hash) del token nuevo.
 * Devuelve false si el token ya estaba revocado (otra peticion lo consumio).
 */
async function revoke(tokenHash, replacedById = null) {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked_at = datetime('now'), replaced_by = ?
     WHERE token = ? AND revoked_at IS NULL`,
    [replacedById, tokenHash]
  );
  return result.rowsAffected > 0;
}

/** Registra que token reemplazo al consumido (trazabilidad de la rotacion). */
async function linkReplacement(tokenHash, replacedById) {
  await query(
    `UPDATE refresh_tokens SET replaced_by = ? WHERE token = ?`,
    [replacedById, tokenHash]
  );
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
  // Primero se rompe la cadena replaced_by que apunta a los que se van a borrar.
  await query(
    `UPDATE refresh_tokens SET replaced_by = NULL
     WHERE replaced_by IN (SELECT id FROM refresh_tokens WHERE expires_at < datetime('now', '-7 days'))`
  );
  const result = await query(
    `DELETE FROM refresh_tokens WHERE expires_at < datetime('now', '-7 days')`
  );
  return result.rowsAffected;
}

module.exports = { save, findByHash, findValid, revoke, linkReplacement, revokeAllForUser, purgeExpired };
