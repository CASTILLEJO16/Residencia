'use strict';
const { sql, query } = require('../config/database');
const { parsePagination, buildMeta, safeSort } = require('../utils/pagination');

const FIELDS = `
  t.id, t.ticket_number, t.title, t.description, t.alert_id, t.priority, t.status,
  t.assigned_to, asg.full_name AS assigned_to_name, asg.email AS assigned_to_email,
  t.escalated_to, esc.full_name AS escalated_to_name, esc.email AS escalated_to_email,
  t.escalation_level, t.due_date,
  t.created_by, crt.full_name AS created_by_name,
  t.created_at, t.updated_at, t.closed_at, t.closed_by, cls.full_name AS closed_by_name,
  t.resolution,
  a.severity AS alert_severity, a.kpi_id, k.name AS kpi_name`;

const JOINS = `
  FROM dbo.tickets t
  LEFT JOIN dbo.users asg ON asg.id = t.assigned_to
  LEFT JOIN dbo.users esc ON esc.id = t.escalated_to
  LEFT JOIN dbo.users crt ON crt.id = t.created_by
  LEFT JOIN dbo.users cls ON cls.id = t.closed_by
  LEFT JOIN dbo.alerts a  ON a.id = t.alert_id
  LEFT JOIN dbo.kpis k    ON k.id = a.kpi_id`;

const SORTABLE = ['created_at', 'updated_at', 'priority', 'status', 'due_date'];

async function findById(id) {
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE t.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  return result.recordset[0] || null;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const { column, direction } = safeSort(params.sort, SORTABLE, 'created_at');
  const args = [
    { name: 'status', type: sql.NVarChar(20), value: params.status || null },
    { name: 'priority', type: sql.NVarChar(20), value: params.priority || null },
    { name: 'assignedTo', type: sql.Int, value: params.assignedTo ? Number(params.assignedTo) : null },
    { name: 'createdBy', type: sql.Int, value: params.createdBy ? Number(params.createdBy) : null },
    { name: 'search', type: sql.NVarChar(200), value: params.search ? `%${params.search}%` : null },
    { name: 'unassigned', type: sql.Bit, value: params.unassigned === 'true' ? 1 : null },
    { name: 'overdue', type: sql.Bit, value: params.overdue === 'true' ? 1 : null },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ];
  const where = `
    WHERE (@status IS NULL OR t.status = @status)
      AND (@priority IS NULL OR t.priority = @priority)
      AND (@assignedTo IS NULL OR t.assigned_to = @assignedTo)
      AND (@createdBy IS NULL OR t.created_by = @createdBy)
      AND (@search IS NULL OR t.title LIKE @search OR t.description LIKE @search)
      AND (@unassigned IS NULL OR t.assigned_to IS NULL)
      AND (@overdue IS NULL OR (t.due_date < SYSUTCDATETIME() AND t.status <> 'closed'))`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY ${column === 'priority'
       ? `CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
       : `t.${column}`} ${direction}
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`, args);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`, args.slice(0, 7));
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO dbo.tickets (title, description, alert_id, priority, assigned_to, due_date, created_by)
     OUTPUT INSERTED.id
     VALUES (@title, @description, @alertId, @priority, @assignedTo, @dueDate, @createdBy)`,
    [
      { name: 'title', type: sql.NVarChar(200), value: data.title },
      { name: 'description', type: sql.NVarChar(sql.MAX), value: data.description ?? null },
      { name: 'alertId', type: sql.BigInt, value: data.alertId ?? null },
      { name: 'priority', type: sql.NVarChar(20), value: data.priority },
      { name: 'assignedTo', type: sql.Int, value: data.assignedTo ?? null },
      { name: 'dueDate', type: sql.DateTime2, value: data.dueDate ? new Date(data.dueDate) : null },
      { name: 'createdBy', type: sql.Int, value: userId },
    ]);
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE dbo.tickets SET
       title       = COALESCE(@title, title),
       description = COALESCE(@description, description),
       priority    = COALESCE(@priority, priority),
       due_date    = COALESCE(@dueDate, due_date)
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'title', type: sql.NVarChar(200), value: data.title ?? null },
      { name: 'description', type: sql.NVarChar(sql.MAX), value: data.description ?? null },
      { name: 'priority', type: sql.NVarChar(20), value: data.priority ?? null },
      { name: 'dueDate', type: sql.DateTime2, value: data.dueDate ? new Date(data.dueDate) : null },
    ]);
  return findById(id);
}

async function assign(id, assignedTo) {
  await query(
    `UPDATE dbo.tickets
     SET assigned_to = @assignedTo,
         status = CASE WHEN status = 'open' AND @assignedTo IS NOT NULL
                       THEN 'in_progress' ELSE status END
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'assignedTo', type: sql.Int, value: assignedTo },
    ]);
  return findById(id);
}

async function escalate(id, escalatedTo) {
  await query(
    `UPDATE dbo.tickets
     SET escalated_to = @escalatedTo,
         escalation_level = escalation_level + 1,
         status = 'escalated'
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'escalatedTo', type: sql.Int, value: escalatedTo },
    ]);
  return findById(id);
}

async function changeStatus(id, status, userId, resolution) {
  const closing = status === 'closed';
  await query(
    `UPDATE dbo.tickets SET
       status     = @status,
       closed_at  = ${closing ? 'SYSUTCDATETIME()' : 'NULL'},
       closed_by  = ${closing ? '@userId' : 'NULL'},
       resolution = COALESCE(@resolution, resolution)
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'status', type: sql.NVarChar(20), value: status },
      { name: 'userId', type: sql.Int, value: userId },
      { name: 'resolution', type: sql.NVarChar(sql.MAX), value: resolution ?? null },
    ]);
  return findById(id);
}

/* ---------- historial ---------- */

async function addHistory({ ticketId, changedBy, action, fieldName, oldValue, newValue, comment }) {
  await query(
    `INSERT INTO dbo.ticket_history
       (ticket_id, changed_by, action, field_name, old_value, new_value, comment)
     VALUES (@ticketId, @changedBy, @action, @fieldName, @oldValue, @newValue, @comment)`,
    [
      { name: 'ticketId', type: sql.Int, value: ticketId },
      { name: 'changedBy', type: sql.Int, value: changedBy },
      { name: 'action', type: sql.NVarChar(50), value: action },
      { name: 'fieldName', type: sql.NVarChar(50), value: fieldName ?? null },
      { name: 'oldValue', type: sql.NVarChar(255), value: oldValue != null ? String(oldValue).slice(0, 255) : null },
      { name: 'newValue', type: sql.NVarChar(255), value: newValue != null ? String(newValue).slice(0, 255) : null },
      { name: 'comment', type: sql.NVarChar(sql.MAX), value: comment ?? null },
    ]);
}

async function getHistory(ticketId) {
  const result = await query(
    `SELECT h.id, h.action, h.field_name, h.old_value, h.new_value, h.comment,
            h.created_at, h.changed_by, u.full_name AS changed_by_name
     FROM dbo.ticket_history h
     INNER JOIN dbo.users u ON u.id = h.changed_by
     WHERE h.ticket_id = @ticketId
     ORDER BY h.created_at ASC, h.id ASC`,
    [{ name: 'ticketId', type: sql.Int, value: ticketId }]);
  return result.recordset;
}

/** Tablero de la pagina de incidentes. */
async function summary(userId) {
  const result = await query(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
       SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) AS escalated_count,
       SUM(CASE WHEN status <> 'closed' AND assigned_to IS NULL THEN 1 ELSE 0 END) AS unassigned_count,
       SUM(CASE WHEN status <> 'closed' AND assigned_to = @userId THEN 1 ELSE 0 END) AS mine_count,
       SUM(CASE WHEN status <> 'closed' AND due_date < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS overdue_count,
       SUM(CASE WHEN closed_at > DATEADD(DAY,-7,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS closed_last_7d
     FROM dbo.tickets`,
    [{ name: 'userId', type: sql.Int, value: userId ?? null }]);
  return result.recordset[0];
}

module.exports = {
  findById, list, create, update, assign, escalate, changeStatus,
  addHistory, getHistory, summary,
};
