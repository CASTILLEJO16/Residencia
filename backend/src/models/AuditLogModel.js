'use strict';
const { sql, query } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');

/**
 * Escribe una entrada de auditoria. Nunca lanza: un fallo al auditar
 * no debe tumbar la peticion del usuario, pero si debe quedar en el log.
 */
async function write(entry) {
  try {
    await query(
      `INSERT INTO dbo.audit_logs
         (user_id, username, action, entity_type, entity_id, http_method,
          endpoint, status_code, ip_address, user_agent, old_values, new_values)
       VALUES (@userId, @username, @action, @entityType, @entityId, @method,
               @endpoint, @statusCode, @ip, @ua, @oldValues, @newValues)`,
      [
        { name: 'userId', type: sql.Int, value: entry.userId ?? null },
        { name: 'username', type: sql.NVarChar(50), value: entry.username ?? null },
        { name: 'action', type: sql.NVarChar(100), value: entry.action },
        { name: 'entityType', type: sql.NVarChar(50), value: entry.entityType ?? null },
        { name: 'entityId', type: sql.NVarChar(50), value: entry.entityId != null ? String(entry.entityId) : null },
        { name: 'method', type: sql.NVarChar(10), value: entry.method ?? null },
        { name: 'endpoint', type: sql.NVarChar(255), value: entry.endpoint ?? null },
        { name: 'statusCode', type: sql.Int, value: entry.statusCode ?? null },
        { name: 'ip', type: sql.NVarChar(45), value: entry.ipAddress ?? null },
        { name: 'ua', type: sql.NVarChar(255), value: (entry.userAgent || '').slice(0, 255) || null },
        { name: 'oldValues', type: sql.NVarChar(sql.MAX), value: toJson(entry.oldValues) },
        { name: 'newValues', type: sql.NVarChar(sql.MAX), value: toJson(entry.newValues) },
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
    { name: 'userId', type: sql.Int, value: queryParams.userId ? parseInt(queryParams.userId, 10) : null },
    { name: 'action', type: sql.NVarChar(100), value: queryParams.action || null },
    { name: 'entityType', type: sql.NVarChar(50), value: queryParams.entityType || null },
    { name: 'from', type: sql.DateTime2, value: queryParams.from ? new Date(queryParams.from) : null },
    { name: 'to', type: sql.DateTime2, value: queryParams.to ? new Date(queryParams.to) : null },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ];

  const where = `
    WHERE (@userId IS NULL OR a.user_id = @userId)
      AND (@action IS NULL OR a.action = @action)
      AND (@entityType IS NULL OR a.entity_type = @entityType)
      AND (@from IS NULL OR a.created_at >= @from)
      AND (@to IS NULL OR a.created_at <= @to)`;

  const rows = await query(
    `SELECT a.id, a.user_id, a.username, a.action, a.entity_type, a.entity_id,
            a.http_method, a.endpoint, a.status_code, a.ip_address,
            a.old_values, a.new_values, a.created_at
     FROM dbo.audit_logs a ${where}
     ORDER BY a.created_at DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params
  );

  const count = await query(
    `SELECT COUNT(*) AS total FROM dbo.audit_logs a ${where}`,
    params.slice(0, 5)
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

module.exports = { write, list };
