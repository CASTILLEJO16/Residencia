'use strict';
const { query } = require('../config/database');
const { parsePagination, buildMeta, safeSort } = require('../utils/pagination');

const FIELDS = `
  k.id, k.name, k.description, k.sql_query, k.data_source, k.refresh_interval,
  k.max_rows, k.timeout_seconds, k.widget_type, k.value_column, k.label_column,
  k.is_active, k.created_by, u.full_name AS created_by_name,
  k.created_at, k.updated_at`;

const SORTABLE = ['name', 'created_at', 'updated_at', 'widget_type'];

async function findById(id) {
  const result = await query(
    `SELECT ${FIELDS} FROM kpis k
     LEFT JOIN users u ON u.id = k.created_by
     WHERE k.id = $1`,
    [id]
  );
  return result.recordset[0] || null;
}

/** KPIs activos: los que el monitor debe evaluar. */
async function findActive() {
  const result = await query(
    `SELECT ${FIELDS} FROM kpis k
     LEFT JOIN users u ON u.id = k.created_by
     WHERE k.is_active = true ORDER BY k.id`
  );
  return result.recordset;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const { column, direction } = safeSort(params.sort, SORTABLE, 'name');
  const args = [
    params.search ? `%${params.search}%` : null,
    params.widgetType || null,
    params.isActive === undefined || params.isActive === '' ? null : params.isActive === 'true',
    offset,
    limit,
  ];
  const where = `
    WHERE ($1 IS NULL OR k.name LIKE $1 OR k.description LIKE $1)
      AND ($2 IS NULL OR k.widget_type = $2)
      AND ($3 IS NULL OR k.is_active = $3)`;

  const rows = await query(
    `SELECT ${FIELDS} FROM kpis k
     LEFT JOIN users u ON u.id = k.created_by
     ${where} ORDER BY k.${column} ${direction}
     LIMIT $5 OFFSET $4`, args);

  const count = await query(
    `SELECT COUNT(*) AS total FROM kpis k ${where}`, args.slice(0, 3));

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO kpis
       (name, description, sql_query, data_source, refresh_interval, max_rows,
        timeout_seconds, widget_type, value_column, label_column, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [data.name, data.description ?? null, data.sqlQuery, data.dataSource ?? null, data.refreshInterval ?? 300, data.maxRows ?? 1000, data.timeoutSeconds ?? 15, data.widgetType, data.valueColumn ?? null, data.labelColumn ?? null, data.isActive ?? true, userId]
  );
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE kpis SET
       name             = COALESCE($2, name),
       description      = COALESCE($3, description),
       sql_query        = COALESCE($4, sql_query),
       data_source      = COALESCE($5, data_source),
       refresh_interval = COALESCE($6, refresh_interval),
       max_rows         = COALESCE($7, max_rows),
       timeout_seconds  = COALESCE($8, timeout_seconds),
       widget_type      = COALESCE($9, widget_type),
       value_column     = COALESCE($10, value_column),
       label_column     = COALESCE($11, label_column),
       is_active        = COALESCE($12, is_active)
     WHERE id = $1`,
    [id, data.name ?? null, data.description ?? null, data.sqlQuery ?? null, data.dataSource ?? null, data.refreshInterval ?? null, data.maxRows ?? null, data.timeoutSeconds ?? null, data.widgetType ?? null, data.valueColumn ?? null, data.labelColumn ?? null, data.isActive ?? null]
  );
  return findById(id);
}

/** Un KPI con umbrales o historicos no se borra: se desactiva. */
async function countDependencies(id) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM thresholds WHERE kpi_id = $1) AS thresholds,
       (SELECT COUNT(*) FROM alerts     WHERE kpi_id = $1) AS alerts`,
    [id]
  );
  return result.recordset[0];
}

async function remove(id) {
  await query(`DELETE FROM kpi_history   WHERE kpi_id = $1`, [id]);
  await query(`DELETE FROM kpi_snapshots WHERE kpi_id = $1`, [id]);
  const result = await query(`DELETE FROM kpis WHERE id = $1`, [id]);
  return result.rowsAffected > 0;
}

/* ---------- historico ---------- */

async function saveScalar(kpiId, value) {
  await query(
    `INSERT INTO kpi_history (kpi_id, value) VALUES ($1, $2)`,
    [kpiId, value]
  );
}

async function saveSnapshot(kpiId, payload, rowCount, durationMs) {
  await query(
    `INSERT INTO kpi_snapshots (kpi_id, payload, row_count, duration_ms)
     VALUES ($1, $2, $3, $4)`,
    [kpiId, JSON.stringify(payload), rowCount, durationMs]
  );
}

/** Ultimo snapshot, para servir del cache sin volver a golpear el origen. */
async function latestSnapshot(kpiId, maxAgeSeconds) {
  const result = await query(
    `SELECT payload, row_count, duration_ms, captured_at
     FROM kpi_snapshots
     WHERE kpi_id = $1
       AND captured_at > NOW() - INTERVAL '1 second' * $2
     ORDER BY captured_at DESC
     LIMIT 1`,
    [kpiId, maxAgeSeconds]
  );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    ...JSON.parse(row.payload),
    rowCount: row.row_count,
    durationMs: row.duration_ms,
    capturedAt: row.captured_at,
    fromCache: true,
  };
}

async function history(kpiId, { from, to, limit = 500 }) {
  const result = await query(
    `SELECT recorded_at, value
     FROM kpi_history
     WHERE kpi_id = $1
       AND ($2 IS NULL OR recorded_at >= $2)
       AND ($3 IS NULL OR recorded_at <= $3)
     ORDER BY recorded_at DESC
     LIMIT $4`,
    [kpiId, from ? new Date(from) : null, to ? new Date(to) : null, Math.min(Number(limit) || 500, 5000)]
  );
  return result.recordset.reverse();
}

module.exports = {
  findById, findActive, list, create, update, remove, countDependencies,
  saveScalar, saveSnapshot, latestSnapshot, history,
};
