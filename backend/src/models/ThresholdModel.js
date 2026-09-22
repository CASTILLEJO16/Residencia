'use strict';
const { query } = require('../config/database');

const FIELDS = `
  t.id, t.kpi_id, k.name AS kpi_name, t.name, t.condition_type,
  t.threshold_value, t.threshold_min, t.threshold_max, t.severity,
  t.cooldown_minutes, t.last_triggered_at, t.auto_create_ticket,
  t.notify_emails, t.is_active, t.created_by, t.created_at, t.updated_at`;

async function findById(id) {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id WHERE t.id = $1`,
    [id]);
  return result.recordset[0] || null;
}

async function findByKpi(kpiId) {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id
     WHERE t.kpi_id = $1 ORDER BY t.severity, t.name`,
    [kpiId]);
  return result.recordset;
}

/** Umbrales activos de KPIs activos: lo que evalua el monitor. */
async function findActive() {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id
     WHERE t.is_active = true AND k.is_active = true`);
  return result.recordset;
}

async function findAll(params = {}) {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id
     WHERE ($1 IS NULL OR t.kpi_id = $1)
       AND ($2 IS NULL OR t.severity = $2)
     ORDER BY k.name, t.name`,
    [params.kpiId ? Number(params.kpiId) : null, params.severity || null]);
  return result.recordset;
}

function params(data) {
  return [
    data.kpiId ?? null,
    data.name ?? null,
    data.conditionType ?? null,
    data.thresholdValue ?? null,
    data.thresholdMin ?? null,
    data.thresholdMax ?? null,
    data.severity ?? null,
    data.cooldownMinutes ?? null,
    data.autoCreateTicket ?? null,
    data.notifyEmails ?? null,
    data.isActive ?? null,
  ];
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO thresholds
       (kpi_id, name, condition_type, threshold_value, threshold_min, threshold_max,
        severity, cooldown_minutes, auto_create_ticket, notify_emails, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 30), COALESCE($9, false),
             $10, COALESCE($11, true), $12)
     RETURNING id`,
    [...params(data), userId]);
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE thresholds SET
       name               = COALESCE($2, name),
       condition_type     = COALESCE($3, condition_type),
       threshold_value    = COALESCE($4, threshold_value),
       threshold_min      = COALESCE($5, threshold_min),
       threshold_max      = COALESCE($6, threshold_max),
       severity           = COALESCE($7, severity),
       cooldown_minutes   = COALESCE($8, cooldown_minutes),
       auto_create_ticket = COALESCE($9, auto_create_ticket),
       notify_emails      = COALESCE($10, notify_emails),
       is_active          = COALESCE($11, is_active)
     WHERE id = $1`,
    [id, ...params(data)]);
  return findById(id);
}

async function remove(id) {
  const alerts = await query(
    `SELECT COUNT(*) AS total FROM alerts WHERE threshold_id = $1`,
    [id]);
  if (alerts.recordset[0].total > 0) return { deleted: false, alerts: alerts.recordset[0].total };

  const result = await query(`DELETE FROM thresholds WHERE id = $1`, [id]);
  return { deleted: result.rowsAffected > 0 };
}

async function markTriggered(id) {
  await query(
    `UPDATE thresholds SET last_triggered_at = NOW() WHERE id = $1`,
    [id]);
}

module.exports = { findById, findByKpi, findActive, findAll, create, update, remove, markTriggered };
