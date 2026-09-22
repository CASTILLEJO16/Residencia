'use strict';
const { query, getLastInsertId } = require('../config/database');
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
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE a.id = ?`, [id]);
  return result.recordset[0] || null;
}

/** Alerta abierta de un umbral, si existe. El indice unico garantiza que sea una sola. */
async function findOpenByThreshold(thresholdId) {
  const result = await query(
    `SELECT ${FIELDS} ${JOINS} WHERE a.threshold_id = ? AND a.status = 'open'`,
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
    WHERE (? IS NULL OR a.status = ?)
      AND (? IS NULL OR a.severity = ?)
      AND (? IS NULL OR a.kpi_id = ?)
      AND (? IS NULL OR a.triggered_at >= ?)
      AND (? IS NULL OR a.triggered_at <= ?)`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1
                              WHEN 'medium' THEN 2 ELSE 3 END,
              a.triggered_at DESC
     LIMIT ? OFFSET ?`, args);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`, args.slice(0, 5));
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ thresholdId, kpiId, currentValue, message, severity }) {
  await query(
    `INSERT INTO alerts (threshold_id, kpi_id, current_value, message, severity)
     VALUES (?, ?, ?, ?, ?)`,
    [thresholdId, kpiId, currentValue, message, severity]);
  const id = getLastInsertId();
  return findById(id);
}

/** La condicion sigue incumpliendose: se actualiza en vez de abrir otra alerta. */
async function touch(id, currentValue) {
  await query(
    `UPDATE alerts
     SET occurrence_count = occurrence_count + 1,
         last_seen_at = datetime('now'),
         current_value = ?
     WHERE id = ?`,
    [id, currentValue]);
}

async function acknowledge(id, userId) {
  await query(
    `UPDATE alerts
     SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = datetime('now')
     WHERE id = ? AND status = 'open'`,
    [userId, id]);
  return findById(id);
}

async function resolve(id, userId) {
  await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = datetime('now'),
         acknowledged_by = COALESCE(acknowledged_by, ?),
         acknowledged_at = COALESCE(acknowledged_at, datetime('now'))
     WHERE id = ? AND status <> 'resolved'`,
    [userId, id]);
  return findById(id);
}

/** Cierre automatico cuando el KPI vuelve a su rango normal. */
async function autoResolve(thresholdId) {
  const result = await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = datetime('now')
     WHERE threshold_id = ? AND status IN ('open','acknowledged')
     `,
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
       SUM(CASE WHEN triggered_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS last_24h
     FROM alerts`);
  return result.recordset[0];
}

module.exports = {
  findById, findOpenByThreshold, list, create, touch,
  acknowledge, resolve, autoResolve, summary,
};
