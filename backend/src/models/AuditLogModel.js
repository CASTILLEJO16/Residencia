'use strict';
const { query } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');

/**
 * Escribe una entrada de auditoria. Nunca lanza: un fallo al auditar
 * no debe tumbar la peticion del usuario, pero si debe quedar en el log.
 */
async function write(entry) {
  try {
    await query(
      `INSERT INTO audit_logs
         (user_id, username, action, entity_type, entity_id, http_method,
          endpoint, status_code, ip_address, user_agent, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.userId ?? null,
        entry.username ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.method ?? null,
        entry.endpoint ?? null,
        entry.statusCode ?? null,
        entry.ipAddress ?? null,
        (entry.userAgent || '').slice(0, 255) || null,
        toJson(entry.oldValues),
        toJson(entry.newValues),
      ]
    );
  } catch (err) {
    console.error('[audit] no se pudo escribir el registro:', err.message);
  }
}

function toJson(value) {
  if (value === null || value === undefined) return null;
  try { return JSON.stringify(value); } catch { return null; }
}

async function list(queryParams) {
  const { page, limit, offset } = parsePagination(queryParams, { defaultLimit: 50 });
  const params = [
    queryParams.userId ? parseInt(queryParams.userId, 10) : null,
    queryParams.action || null,
    queryParams.entityType || null,
    queryParams.from ? new Date(queryParams.from) : null,
    queryParams.to ? new Date(queryParams.to) : null,
    offset,
    limit,
  ];

  const where = `
    WHERE ($1 IS NULL OR a.user_id = $1)
      AND ($2 IS NULL OR a.action = $2)
      AND ($3 IS NULL OR a.entity_type = $3)
      AND ($4 IS NULL OR a.created_at >= $4)
      AND ($5 IS NULL OR a.created_at <= $5)`;

  const rows = await query(
    `SELECT a.id, a.user_id, a.username, a.action, a.entity_type, a.entity_id,
            a.http_method, a.endpoint, a.status_code, a.ip_address,
            a.old_values, a.new_values, a.created_at
     FROM audit_logs a ${where}
     ORDER BY a.created_at DESC
     LIMIT $7 OFFSET $6`,
    params
  );

  const count = await query(
    `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
    params.slice(0, 5)
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

module.exports = { write, list };
