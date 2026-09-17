'use strict';
const { sql, query } = require('../config/database');

const FIELDS = `
  t.id, t.kpi_id, k.name AS kpi_name, t.name, t.condition_type,
  t.threshold_value, t.threshold_min, t.threshold_max, t.severity,
  t.cooldown_minutes, t.last_triggered_at, t.auto_create_ticket,
  t.notify_emails, t.is_active, t.created_by, t.created_at, t.updated_at`;

async function findById(id) {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.thresholds t
     INNER JOIN dbo.kpis k ON k.id = t.kpi_id WHERE t.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  return result.recordset[0] || null;
}

async function findByKpi(kpiId) {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.thresholds t
     INNER JOIN dbo.kpis k ON k.id = t.kpi_id
     WHERE t.kpi_id = @kpiId ORDER BY t.severity, t.name`,
    [{ name: 'kpiId', type: sql.Int, value: kpiId }]);
  return result.recordset;
}

/** Umbrales activos de KPIs activos: lo que evalua el monitor. */
async function findActive() {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.thresholds t
     INNER JOIN dbo.kpis k ON k.id = t.kpi_id
     WHERE t.is_active = 1 AND k.is_active = 1`);
  return result.recordset;
}

async function findAll(params = {}) {
  const result = await query(
    `SELECT ${FIELDS} FROM dbo.thresholds t
     INNER JOIN dbo.kpis k ON k.id = t.kpi_id
     WHERE (@kpiId IS NULL OR t.kpi_id = @kpiId)
       AND (@severity IS NULL OR t.severity = @severity)
     ORDER BY k.name, t.name`,
    [
      { name: 'kpiId', type: sql.Int, value: params.kpiId ? Number(params.kpiId) : null },
      { name: 'severity', type: sql.NVarChar(20), value: params.severity || null },
    ]);
  return result.recordset;
}

function params(data) {
  return [
    { name: 'kpiId', type: sql.Int, value: data.kpiId ?? null },
    { name: 'name', type: sql.NVarChar(100), value: data.name ?? null },
    { name: 'conditionType', type: sql.NVarChar(20), value: data.conditionType ?? null },
    { name: 'thresholdValue', type: sql.Decimal(18, 4), value: data.thresholdValue ?? null },
    { name: 'thresholdMin', type: sql.Decimal(18, 4), value: data.thresholdMin ?? null },
    { name: 'thresholdMax', type: sql.Decimal(18, 4), value: data.thresholdMax ?? null },
    { name: 'severity', type: sql.NVarChar(20), value: data.severity ?? null },
    { name: 'cooldownMinutes', type: sql.Int, value: data.cooldownMinutes ?? null },
    { name: 'autoCreateTicket', type: sql.Bit, value: data.autoCreateTicket ?? null },
    { name: 'notifyEmails', type: sql.NVarChar(500), value: data.notifyEmails ?? null },
    { name: 'isActive', type: sql.Bit, value: data.isActive ?? null },
  ];
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO dbo.thresholds
       (kpi_id, name, condition_type, threshold_value, threshold_min, threshold_max,
        severity, cooldown_minutes, auto_create_ticket, notify_emails, is_active, created_by)
     OUTPUT INSERTED.id
     VALUES (@kpiId, @name, @conditionType, @thresholdValue, @thresholdMin, @thresholdMax,
             @severity, COALESCE(@cooldownMinutes, 30), COALESCE(@autoCreateTicket, 0),
             @notifyEmails, COALESCE(@isActive, 1), @createdBy)`,
    [...params(data), { name: 'createdBy', type: sql.Int, value: userId }]);
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE dbo.thresholds SET
       name               = COALESCE(@name, name),
       condition_type     = COALESCE(@conditionType, condition_type),
       threshold_value    = COALESCE(@thresholdValue, threshold_value),
       threshold_min      = COALESCE(@thresholdMin, threshold_min),
       threshold_max      = COALESCE(@thresholdMax, threshold_max),
       severity           = COALESCE(@severity, severity),
       cooldown_minutes   = COALESCE(@cooldownMinutes, cooldown_minutes),
       auto_create_ticket = COALESCE(@autoCreateTicket, auto_create_ticket),
       notify_emails      = COALESCE(@notifyEmails, notify_emails),
       is_active          = COALESCE(@isActive, is_active)
     WHERE id = @id`,
    [...params(data), { name: 'id', type: sql.Int, value: id }]);
  return findById(id);
}

async function remove(id) {
  const alerts = await query(
    `SELECT COUNT(*) AS total FROM dbo.alerts WHERE threshold_id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  if (alerts.recordset[0].total > 0) return { deleted: false, alerts: alerts.recordset[0].total };

  const result = await query(`DELETE FROM dbo.thresholds WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  return { deleted: result.rowsAffected[0] > 0 };
}

async function markTriggered(id) {
  await query(
    `UPDATE dbo.thresholds SET last_triggered_at = SYSUTCDATETIME() WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
}

module.exports = { findById, findByKpi, findActive, findAll, create, update, remove, markTriggered };
