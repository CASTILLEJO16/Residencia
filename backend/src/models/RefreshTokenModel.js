'use strict';
const { sql, query } = require('../config/database');

async function save({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
  await query(
    `INSERT INTO dbo.refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (@userId, @tokenHash, @expiresAt, @ip, @ua)`,
    [
      { name: 'userId', type: sql.Int, value: userId },
      { name: 'tokenHash', type: sql.Char(64), value: tokenHash },
      { name: 'expiresAt', type: sql.DateTime2, value: expiresAt },
      { name: 'ip', type: sql.NVarChar(45), value: ipAddress },
      { name: 'ua', type: sql.NVarChar(255), value: userAgent },
    ]
  );
}

/** Devuelve el token solo si existe, no esta revocado y no ha expirado. */
async function findValid(tokenHash) {
  const result = await query(
    `SELECT id, user_id, token_hash, expires_at, revoked_at
     FROM dbo.refresh_tokens
     WHERE token_hash = @hash AND revoked_at IS NULL AND expires_at > SYSUTCDATETIME()`,
    [{ name: 'hash', type: sql.Char(64), value: tokenHash }]
  );
  return result.recordset[0] || null;
}

/** Marca el token como usado y encadena el reemplazo (rotacion). */
async function revoke(tokenHash, replacedBy = null) {
  const result = await query(
    `UPDATE dbo.refresh_tokens
     SET revoked_at = SYSUTCDATETIME(), replaced_by = @replacedBy
     WHERE token_hash = @hash AND revoked_at IS NULL`,
    [
      { name: 'hash', type: sql.Char(64), value: tokenHash },
      { name: 'replacedBy', type: sql.Char(64), value: replacedBy },
    ]
  );
  return result.rowsAffected[0] > 0;
}

/** Cierra todas las sesiones del usuario (logout global, cambio de contrasena, baja). */
async function revokeAllForUser(userId) {
  const result = await query(
    `UPDATE dbo.refresh_tokens
     SET revoked_at = SYSUTCDATETIME()
     WHERE user_id = @userId AND revoked_at IS NULL`,
    [{ name: 'userId', type: sql.Int, value: userId }]
  );
  return result.rowsAffected[0];
}

async function purgeExpired() {
  const result = await query(
    `DELETE FROM dbo.refresh_tokens WHERE expires_at < DATEADD(DAY, -7, SYSUTCDATETIME())`
  );
  return result.rowsAffected[0];
}

module.exports = { save, findValid, revoke, revokeAllForUser, purgeExpired };
