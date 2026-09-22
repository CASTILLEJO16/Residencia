'use strict';
const { query } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');

const FIELDS = `
  a.id, a.threshold_id, t.name AS threshold_name, a.kpi_id, k.name AS kpi_name,
  a.triggered_at, a.current_value, a.message, a.severity, a.status,
  a.occurrence_count, a.last_seen_at, a.acknowledged_by, u.full_name AS acknowledged_by_name,
  a.acknowledged_at, a.resolved_at,
  (SELECT id FROM tickets WHERE alert_id = a.id LIMIT 1) AS ticket_id`;

const JOINS = `
  FROM alerts a
  INNER JOIN thresholds t ON t.id = a.threshold_id
  INNER JOIN kpis k       ON k.id = a.kpi_id
  LEFT  JOIN users u      ON u.id = a.acknowledged_by`;

async function findById(id) {
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE a.id = $1`, [id]);
  return result.recordset[0] || null;
}

/** Alerta abierta de un umbral, si existe. El indice unico garantiza que sea una sola. */
async function findOpenByThreshold(thresholdId) {
  const result = await query(
    `SELECT ${FIELDS} ${JOINS} WHERE a.threshold_id = $1 AND a.status = 'open'`,
    [thresholdId]);
  return result.recordset[0] || null;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const args = [
    params.status || null,
    params.severity || null,
    params.kpiId ? Number(params.kpiId) : null,
    params.from ? new Date(params.from) : null,
    params.to ? new Date(params.to) : null,
    offset,
    limit,
  ];
  const where = `
    WHERE ($1 IS NULL OR a.status = $1)
      AND ($2 IS NULL OR a.severity = $2)
      AND ($3 IS NULL OR a.kpi_id = $3)
      AND ($4 IS NULL OR a.triggered_at >= $4)
      AND ($5 IS NULL OR a.triggered_at <= $5)`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                              WHEN 'medium' THEN 2 ELSE 3 END,
              a.triggered_at DESC
     LIMIT $7 OFFSET $6`, args);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`, args.slice(0, 5));
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ thresholdId, kpiId, currentValue, message, severity }) {
  const result = await query(
    `INSERT INTO alerts (threshold_id, kpi_id, current_value, message, severity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [thresholdId, kpiId, currentValue, message, severity]);
  return findById(result.recordset[0].id);
}

/** La condicion sigue incumpliendose: se actualiza en vez de abrir otra alerta. */
async function touch(id, currentValue) {
  await query(
    `UPDATE alerts
     SET occurrence_count = occurrence_count + 1,
         last_seen_at = NOW(),
         current_value = $2
     WHERE id = $1`,
    [id, currentValue]);
}

async function acknowledge(id, userId) {
  await query(
    `UPDATE alerts
     SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW()
     WHERE id = $1 AND status = 'open'`,
    [id, userId]);
  return findById(id);
}

async function resolve(id, userId) {
  await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = NOW(),
         acknowledged_by = COALESCE(acknowledged_by, $2),
         acknowledged_at = COALESCE(acknowledged_at, NOW())
     WHERE id = $1 AND status <> 'resolved'`,
    [id, userId]);
  return findById(id);
}

/** Cierre automatico cuando el KPI vuelve a su rango normal. */
async function autoResolve(thresholdId) {
  const result = await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE threshold_id = $1 AND status IN ('open','acknowledged')
     RETURNING id`,
    [thresholdId]);
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
       SUM(CASE WHEN triggered_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) AS last_24h
     FROM alerts`);
  return result.recordset[0];
}

module.exports = {
  findById, findOpenByThreshold, list, create, touch,
  acknowledge, resolve, autoResolve, summary,
};
