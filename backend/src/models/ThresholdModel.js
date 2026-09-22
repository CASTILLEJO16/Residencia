'use strict';
const { query, getLastInsertId } = require('../config/database');

const FIELDS = `
  t.id, t.kpi_id, k.name AS kpi_name, t.name, t.condition_type,
  t.threshold_value, t.threshold_min, t.threshold_max, t.severity,
  t.cooldown_minutes, t.last_triggered_at, t.auto_create_ticket,
  t.notify_emails, t.is_active, t.created_by, t.created_at, t.updated_at`;

async function findById(id) {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id WHERE t.id = ?`,
    [id]);
  return result.recordset[0] || null;
}

async function findByKpi(kpiId) {
  const result = await query(
    `SELECT ${FIELDS} FROM thresholds t
     INNER JOIN kpis k ON k.id = t.kpi_id
     WHERE t.kpi_id = ? ORDER BY t.severity, t.name`,
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
     WHERE (? IS NULL OR t.kpi_id = ?)
       AND (? IS NULL OR t.severity = ?)
     ORDER BY k.name, t.name`,
    [params.kpiId ? Number(params.kpiId) : null, params.kpiId ? Number(params.kpiId) : null, params.severity || null, params.severity || null]);
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
  await query(
    `INSERT INTO thresholds
       (kpi_id, name, condition_type, threshold_value, threshold_min, threshold_max,
        severity, cooldown_minutes, auto_create_ticket, notify_emails, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, 30), COALESCE(?, false),
             ?, COALESCE(?, true), ?)`,
    [...params(data), userId]);
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, data) {
  await query(
    `UPDATE thresholds SET
       name               = COALESCE(?, name),
       condition_type     = COALESCE(?, condition_type),
       threshold_value    = COALESCE(?, threshold_value),
       threshold_min      = COALESCE(?, threshold_min),
       threshold_max      = COALESCE(?, threshold_max),
       severity           = COALESCE(?, severity),
       cooldown_minutes   = COALESCE(?, cooldown_minutes),
       auto_create_ticket = COALESCE(?, auto_create_ticket),
       notify_emails      = COALESCE(?, notify_emails),
       is_active          = COALESCE(?, is_active)
     WHERE id = ?`,
    [...params(data), id]);
  return findById(id);
}

async function remove(id) {
  const alerts = await query(
    `SELECT COUNT(*) AS total FROM alerts WHERE threshold_id = ?`,
    [id]);
  if (alerts.recordset[0].total > 0) return { deleted: false, alerts: alerts.recordset[0].total };

  const result = await query(`DELETE FROM thresholds WHERE id = ?`, [id]);
  return { deleted: result.rowsAffected > 0 };
}

async function markTriggered(id) {
  await query(
    `UPDATE thresholds SET last_triggered_at = datetime('now') WHERE id = ?`,
    [id]);
}

module.exports = { findById, findByKpi, findActive, findAll, create, update, remove, markTriggered };
