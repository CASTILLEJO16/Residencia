'use strict';
const { sql, query } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');

const FIELDS = `
  a.id, a.threshold_id, t.name AS threshold_name, a.kpi_id, k.name AS kpi_name,
  a.triggered_at, a.current_value, a.message, a.severity, a.status,
  a.occurrence_count, a.last_seen_at, a.acknowledged_by, u.full_name AS acknowledged_by_name,
  a.acknowledged_at, a.resolved_at,
  (SELECT TOP 1 id FROM dbo.tickets WHERE alert_id = a.id) AS ticket_id`;

const JOINS = `
  FROM dbo.alerts a
  INNER JOIN dbo.thresholds t ON t.id = a.threshold_id
  INNER JOIN dbo.kpis k       ON k.id = a.kpi_id
  LEFT  JOIN dbo.users u      ON u.id = a.acknowledged_by`;

async function findById(id) {
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE a.id = @id`,
    [{ name: 'id', type: sql.BigInt, value: id }]);
  return result.recordset[0] || null;
}

/** Alerta abierta de un umbral, si existe. El indice unico garantiza que sea una sola. */
async function findOpenByThreshold(thresholdId) {
  const result = await query(
    `SELECT ${FIELDS} ${JOINS} WHERE a.threshold_id = @id AND a.status = 'open'`,
    [{ name: 'id', type: sql.Int, value: thresholdId }]);
  return result.recordset[0] || null;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const args = [
    { name: 'status', type: sql.NVarChar(20), value: params.status || null },
    { name: 'severity', type: sql.NVarChar(20), value: params.severity || null },
    { name: 'kpiId', type: sql.Int, value: params.kpiId ? Number(params.kpiId) : null },
    { name: 'from', type: sql.DateTime2, value: params.from ? new Date(params.from) : null },
    { name: 'to', type: sql.DateTime2, value: params.to ? new Date(params.to) : null },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ];
  const where = `
    WHERE (@status IS NULL OR a.status = @status)
      AND (@severity IS NULL OR a.severity = @severity)
      AND (@kpiId IS NULL OR a.kpi_id = @kpiId)
      AND (@from IS NULL OR a.triggered_at >= @from)
      AND (@to   IS NULL OR a.triggered_at <= @to)`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                              WHEN 'medium' THEN 2 ELSE 3 END,
              a.triggered_at DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, args);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`, args.slice(0, 5));
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ thresholdId, kpiId, currentValue, message, severity }) {
  const result = await query(
    `INSERT INTO dbo.alerts (threshold_id, kpi_id, current_value, message, severity)
     OUTPUT INSERTED.id
     VALUES (@thresholdId, @kpiId, @currentValue, @message, @severity)`,
    [
      { name: 'thresholdId', type: sql.Int, value: thresholdId },
      { name: 'kpiId', type: sql.Int, value: kpiId },
      { name: 'currentValue', type: sql.Decimal(18, 4), value: currentValue },
      { name: 'message', type: sql.NVarChar(500), value: message },
      { name: 'severity', type: sql.NVarChar(20), value: severity },
    ]);
  return findById(result.recordset[0].id);
}

/** La condicion sigue incumpliendose: se actualiza en vez de abrir otra alerta. */
async function touch(id, currentValue) {
  await query(
    `UPDATE dbo.alerts
     SET occurrence_count = occurrence_count + 1,
         last_seen_at = SYSUTCDATETIME(),
         current_value = @value
     WHERE id = @id`,
    [
      { name: 'id', type: sql.BigInt, value: id },
      { name: 'value', type: sql.Decimal(18, 4), value: currentValue },
    ]);
}

async function acknowledge(id, userId) {
  await query(
    `UPDATE dbo.alerts
     SET status = 'acknowledged', acknowledged_by = @userId, acknowledged_at = SYSUTCDATETIME()
     WHERE id = @id AND status = 'open'`,
    [
      { name: 'id', type: sql.BigInt, value: id },
      { name: 'userId', type: sql.Int, value: userId },
    ]);
  return findById(id);
}

async function resolve(id, userId) {
  await query(
    `UPDATE dbo.alerts
     SET status = 'resolved', resolved_at = SYSUTCDATETIME(),
         acknowledged_by = COALESCE(acknowledged_by, @userId),
         acknowledged_at = COALESCE(acknowledged_at, SYSUTCDATETIME())
     WHERE id = @id AND status <> 'resolved'`,
    [
      { name: 'id', type: sql.BigInt, value: id },
      { name: 'userId', type: sql.Int, value: userId ?? null },
    ]);
  return findById(id);
}

/** Cierre automatico cuando el KPI vuelve a su rango normal. */
async function autoResolve(thresholdId) {
  const result = await query(
    `UPDATE dbo.alerts
     SET status = 'resolved', resolved_at = SYSUTCDATETIME()
     OUTPUT INSERTED.id
     WHERE threshold_id = @id AND status IN ('open','acknowledged')`,
    [{ name: 'id', type: sql.Int, value: thresholdId }]);
  return result.recordset.map((r) => r.id);
}

/** Resumen para la cabecera del dashboard. */
async function summary() {
  const result = await query(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged_count,
       SUM(CASE WHEN status <> 'resolved' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
       SUM(CASE WHEN status <> 'resolved' AND severity = 'high' THEN 1 ELSE 0 END) AS high_count,
       SUM(CASE WHEN triggered_at > DATEADD(HOUR,-24,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS last_24h
     FROM dbo.alerts`);
  return result.recordset[0];
}

module.exports = {
  findById, findOpenByThreshold, list, create, touch,
  acknowledge, resolve, autoResolve, summary,
};
