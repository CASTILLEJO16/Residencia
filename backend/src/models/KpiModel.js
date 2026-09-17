'use strict';
const { sql, query } = require('../config/database');
const { parsePagination, buildMeta, safeSort } = require('../utils/pagination');

const FIELDS = `
  k.id, k.name, k.description, k.sql_query, k.data_source, k.refresh_interval,
  k.max_rows, k.timeout_seconds, k.widget_type, k.value_column, k.label_column,
  k.is_active, k.created_by, u.full_name AS created_by_name,
  k.created_at, k.updated_at`;

const SORTABLE = ['name', 'created_at', 'updated_at', 'widget_type'];

async function findById(id) {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.kpis k
     LEFT JOIN dbo.users u ON u.id = k.created_by
     WHERE k.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

/** KPIs activos: los que el monitor debe evaluar. */
async function findActive() {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.kpis k
     LEFT JOIN dbo.users u ON u.id = k.created_by
     WHERE k.is_active = 1 ORDER BY k.id`
  );
  return result.recordset;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const { column, direction } = safeSort(params.sort, SORTABLE, 'name');
  const args = [
    { name: 'search', type: sql.NVarChar(200), value: params.search ? `%${params.search}%` : null },
    { name: 'widgetType', type: sql.NVarChar(20), value: params.widgetType || null },
    { name: 'isActive', type: sql.Bit,
      value: params.isActive === undefined || params.isActive === '' ? null : params.isActive === 'true' },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ];
  const where = `
    WHERE (@search IS NULL OR k.name LIKE @search OR k.description LIKE @search)
      AND (@widgetType IS NULL OR k.widget_type = @widgetType)
      AND (@isActive IS NULL OR k.is_active = @isActive)`;

  const rows = await query(
    `SELECT ${FIELDS} FROM dbo.kpis k
     LEFT JOIN dbo.users u ON u.id = k.created_by
     ${where} ORDER BY k.${column} ${direction}
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, args);

  const count = await query(
    `SELECT COUNT(*) AS total FROM dbo.kpis k ${where}`, args.slice(0, 3));

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO dbo.kpis
       (name, description, sql_query, data_source, refresh_interval, max_rows,
        timeout_seconds, widget_type, value_column, label_column, is_active, created_by)
     OUTPUT INSERTED.id
     VALUES (@name, @description, @sqlQuery, @dataSource, @refreshInterval, @maxRows,
             @timeoutSeconds, @widgetType, @valueColumn, @labelColumn, @isActive, @createdBy)`,
    [
      { name: 'name', type: sql.NVarChar(100), value: data.name },
      { name: 'description', type: sql.NVarChar(255), value: data.description ?? null },
      { name: 'sqlQuery', type: sql.NVarChar(sql.MAX), value: data.sqlQuery },
      { name: 'dataSource', type: sql.NVarChar(100), value: data.dataSource ?? null },
      { name: 'refreshInterval', type: sql.Int, value: data.refreshInterval ?? 300 },
      { name: 'maxRows', type: sql.Int, value: data.maxRows ?? 1000 },
      { name: 'timeoutSeconds', type: sql.Int, value: data.timeoutSeconds ?? 15 },
      { name: 'widgetType', type: sql.NVarChar(20), value: data.widgetType },
      { name: 'valueColumn', type: sql.NVarChar(100), value: data.valueColumn ?? null },
      { name: 'labelColumn', type: sql.NVarChar(100), value: data.labelColumn ?? null },
      { name: 'isActive', type: sql.Bit, value: data.isActive ?? true },
      { name: 'createdBy', type: sql.Int, value: userId },
    ]
  );
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE dbo.kpis SET
       name             = COALESCE(@name, name),
       description      = COALESCE(@description, description),
       sql_query        = COALESCE(@sqlQuery, sql_query),
       data_source      = COALESCE(@dataSource, data_source),
       refresh_interval = COALESCE(@refreshInterval, refresh_interval),
       max_rows         = COALESCE(@maxRows, max_rows),
       timeout_seconds  = COALESCE(@timeoutSeconds, timeout_seconds),
       widget_type      = COALESCE(@widgetType, widget_type),
       value_column     = COALESCE(@valueColumn, value_column),
       label_column     = COALESCE(@labelColumn, label_column),
       is_active        = COALESCE(@isActive, is_active)
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'name', type: sql.NVarChar(100), value: data.name ?? null },
      { name: 'description', type: sql.NVarChar(255), value: data.description ?? null },
      { name: 'sqlQuery', type: sql.NVarChar(sql.MAX), value: data.sqlQuery ?? null },
      { name: 'dataSource', type: sql.NVarChar(100), value: data.dataSource ?? null },
      { name: 'refreshInterval', type: sql.Int, value: data.refreshInterval ?? null },
      { name: 'maxRows', type: sql.Int, value: data.maxRows ?? null },
      { name: 'timeoutSeconds', type: sql.Int, value: data.timeoutSeconds ?? null },
      { name: 'widgetType', type: sql.NVarChar(20), value: data.widgetType ?? null },
      { name: 'valueColumn', type: sql.NVarChar(100), value: data.valueColumn ?? null },
      { name: 'labelColumn', type: sql.NVarChar(100), value: data.labelColumn ?? null },
      { name: 'isActive', type: sql.Bit, value: data.isActive ?? null },
    ]
  );
  return findById(id);
}

/** Un KPI con umbrales o historico no se borra: se desactiva. */
async function countDependencies(id) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM dbo.thresholds WHERE kpi_id = @id) AS thresholds,
       (SELECT COUNT(*) FROM dbo.alerts     WHERE kpi_id = @id) AS alerts`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0];
}

async function remove(id) {
  await query(`DELETE FROM dbo.kpi_history   WHERE kpi_id = @id`, [{ name: 'id', type: sql.Int, value: id }]);
  await query(`DELETE FROM dbo.kpi_snapshots WHERE kpi_id = @id`, [{ name: 'id', type: sql.Int, value: id }]);
  const result = await query(`DELETE FROM dbo.kpis WHERE id = @id`, [{ name: 'id', type: sql.Int, value: id }]);
  return result.rowsAffected[0] > 0;
}

/* ---------- historico ---------- */

async function saveScalar(kpiId, value) {
  await query(
    `INSERT INTO dbo.kpi_history (kpi_id, value) VALUES (@kpiId, @value)`,
    [
      { name: 'kpiId', type: sql.Int, value: kpiId },
      { name: 'value', type: sql.Decimal(18, 4), value: value },
    ]
  );
}

async function saveSnapshot(kpiId, payload, rowCount, durationMs) {
  await query(
    `INSERT INTO dbo.kpi_snapshots (kpi_id, payload, row_count, duration_ms)
     VALUES (@kpiId, @payload, @rowCount, @durationMs)`,
    [
      { name: 'kpiId', type: sql.Int, value: kpiId },
      { name: 'payload', type: sql.NVarChar(sql.MAX), value: JSON.stringify(payload) },
      { name: 'rowCount', type: sql.Int, value: rowCount },
      { name: 'durationMs', type: sql.Int, value: durationMs },
    ]
  );
}

/** Ultimo snapshot, para servir del cache sin volver a golpear el origen. */
async function latestSnapshot(kpiId, maxAgeSeconds) {
  const result = await query(
    `SELECT TOP 1 payload, row_count, duration_ms, captured_at
     FROM dbo.kpi_snapshots
     WHERE kpi_id = @kpiId
       AND captured_at > DATEADD(SECOND, -@maxAge, SYSUTCDATETIME())
     ORDER BY captured_at DESC`,
    [
      { name: 'kpiId', type: sql.Int, value: kpiId },
      { name: 'maxAge', type: sql.Int, value: maxAgeSeconds },
    ]
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
    `SELECT TOP (@limit) recorded_at, value
     FROM dbo.kpi_history
     WHERE kpi_id = @kpiId
       AND (@from IS NULL OR recorded_at >= @from)
       AND (@to   IS NULL OR recorded_at <= @to)
     ORDER BY recorded_at DESC`,
    [
      { name: 'kpiId', type: sql.Int, value: kpiId },
      { name: 'from', type: sql.DateTime2, value: from ? new Date(from) : null },
      { name: 'to', type: sql.DateTime2, value: to ? new Date(to) : null },
      { name: 'limit', type: sql.Int, value: Math.min(Number(limit) || 500, 5000) },
    ]
  );
  return result.recordset.reverse();
}

module.exports = {
  findById, findActive, list, create, update, remove, countDependencies,
  saveScalar, saveSnapshot, latestSnapshot, history,
};
