'use strict';
const { query, getLastInsertId } = require('../config/database');
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
     WHERE k.id = ?`,
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
    WHERE (? IS NULL OR k.name LIKE ? OR k.description LIKE ?)
      AND (? IS NULL OR k.widget_type = ?)
      AND (? IS NULL OR k.is_active = ?)`;

  const rows = await query(
    `SELECT ${FIELDS} FROM kpis k
     LEFT JOIN users u ON u.id = k.created_by
     ${where} ORDER BY k.${column} ${direction}
     LIMIT ? OFFSET ?`,
    [args[0], args[0], args[0], args[1], args[1], args[2], args[2], args[3], args[4]]);

  const count = await query(
    `SELECT COUNT(*) AS total FROM kpis k ${where}`,
    [args[0], args[0], args[0], args[1], args[1], args[2], args[2]]);

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  await query(
    `INSERT INTO kpis
       (name, description, sql_query, data_source, refresh_interval, max_rows,
        timeout_seconds, widget_type, value_column, label_column, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.description ?? null, data.sqlQuery, data.dataSource ?? null, data.refreshInterval ?? 300, data.maxRows ?? 1000, data.timeoutSeconds ?? 15, data.widgetType, data.valueColumn ?? null, data.labelColumn ?? null, data.isActive ?? true, userId]
  );
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, data) {
  await query(
    `UPDATE kpis SET
       name             = COALESCE(?, name),
       description      = COALESCE(?, description),
       sql_query        = COALESCE(?, sql_query),
       data_source      = COALESCE(?, data_source),
       refresh_interval = COALESCE(?, refresh_interval),
       max_rows         = COALESCE(?, max_rows),
       timeout_seconds  = COALESCE(?, timeout_seconds),
       widget_type      = COALESCE(?, widget_type),
       value_column     = COALESCE(?, value_column),
       label_column     = COALESCE(?, label_column),
       is_active        = COALESCE(?, is_active)
     WHERE id = ?`,
    [data.name ?? null, data.description ?? null, data.sqlQuery ?? null, data.dataSource ?? null, data.refreshInterval ?? null, data.maxRows ?? null, data.timeoutSeconds ?? null, data.widgetType ?? null, data.valueColumn ?? null, data.labelColumn ?? null, data.isActive ?? null, id]
  );
  return findById(id);
}

/** Un KPI con umbrales o historicos no se borra: se desactiva. */
async function countDependencies(id) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM thresholds WHERE kpi_id = ?) AS thresholds,
       (SELECT COUNT(*) FROM alerts     WHERE kpi_id = ?) AS alerts`,
    [id]
  );
  return result.recordset[0];
}

async function remove(id) {
  await query(`DELETE FROM kpi_history   WHERE kpi_id = ?`, [id]);
  await query(`DELETE FROM kpi_snapshots WHERE kpi_id = ?`, [id]);
  const result = await query(`DELETE FROM kpis WHERE id = ?`, [id]);
  return result.rowsAffected > 0;
}

/* ---------- historico ---------- */

async function saveScalar(kpiId, value) {
  await query(
    `INSERT INTO kpi_history (kpi_id, value) VALUES (?, ?)`,
    [kpiId, value]
  );
}

async function saveSnapshot(kpiId, payload, rowCount, durationMs) {
  await query(
    `INSERT INTO kpi_snapshots (kpi_id, payload, row_count, duration_ms)
     VALUES (?, ?, ?, ?)`,
    [kpiId, JSON.stringify(payload), rowCount, durationMs]
  );
}

/** Ultimo snapshot, para servir del cache sin volver a golpear el origen. */
async function latestSnapshot(kpiId, maxAgeSeconds) {
  const result = await query(
    `SELECT payload, row_count, duration_ms, captured_at
     FROM kpi_snapshots
     WHERE kpi_id = ?
       AND captured_at > datetime('now', '-' || ? || ' seconds')
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
     WHERE kpi_id = ?
       AND (? IS NULL OR recorded_at >= ?)
       AND (? IS NULL OR recorded_at <= ?)
     ORDER BY recorded_at DESC
     LIMIT ?`,
    [kpiId, from ? new Date(from) : null, from ? new Date(from) : null, to ? new Date(to) : null, to ? new Date(to) : null, Math.min(Number(limit) || 500, 5000)]
  );
  return result.recordset.reverse();
}

module.exports = {
  findById, findActive, list, create, update, remove, countDependencies,
  saveScalar, saveSnapshot, latestSnapshot, history,
};
