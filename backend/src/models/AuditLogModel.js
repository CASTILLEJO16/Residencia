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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    WHERE (? IS NULL OR a.user_id = ?)
      AND (? IS NULL OR a.action = ?)
      AND (? IS NULL OR a.entity_type = ?)
      AND (? IS NULL OR a.created_at >= ?)
      AND (? IS NULL OR a.created_at <= ?)`;

  const rows = await query(
    `SELECT a.id, a.user_id, a.username, a.action, a.entity_type, a.entity_id,
            a.http_method, a.endpoint, a.status_code, a.ip_address,
            a.old_values, a.new_values, a.created_at
     FROM audit_logs a ${where}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [params[0], params[0], params[1], params[1], params[2], params[2], params[3], params[3], params[4], params[4], params[5], params[6]]
  );

  const count = await query(
    `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
    [params[0], params[0], params[1], params[1], params[2], params[2], params[3], params[3], params[4], params[4]]
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

module.exports = { write, list };
