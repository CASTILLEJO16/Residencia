'use strict';
const { query, getLastInsertId } = require('../config/database');
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
  FROM tickets t
  LEFT JOIN users asg ON asg.id = t.assigned_to
  LEFT JOIN users esc ON esc.id = t.escalated_to
  LEFT JOIN users crt ON crt.id = t.created_by
  LEFT JOIN users cls ON cls.id = t.closed_by
  LEFT JOIN alerts a  ON a.id = t.alert_id
  LEFT JOIN kpis k    ON k.id = a.kpi_id`;

const SORTABLE = ['created_at', 'updated_at', 'priority', 'status', 'due_date'];

async function findById(id) {
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE t.id = ?`, [id]);
  return result.recordset[0] || null;
}

async function list(params) {
  const { page, limit, offset } = parsePagination(params);
  const { column, direction } = safeSort(params.sort, SORTABLE, 'created_at');
  const args = [
    params.status || null,
    params.priority || null,
    params.assignedTo ? Number(params.assignedTo) : null,
    params.createdBy ? Number(params.createdBy) : null,
    params.search ? `%${params.search}%` : null,
    params.unassigned === 'true' ? true : null,
    params.overdue === 'true' ? true : null,
    offset,
    limit,
  ];
  const where = `
    WHERE (? IS NULL OR t.status = ?)
      AND (? IS NULL OR t.priority = ?)
      AND (? IS NULL OR t.assigned_to = ?)
      AND (? IS NULL OR t.created_by = ?)
      AND (? IS NULL OR t.title LIKE ? OR t.description LIKE ?)
      AND (? IS NULL OR t.assigned_to IS NULL)
      AND (? IS NULL OR (t.due_date < datetime('now') AND t.status <> 'closed'))`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY ${column === 'priority'
       ? `CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
       : `t.${column}`} ${direction}
     LIMIT ? OFFSET ?`,
    [args[0], args[0], args[1], args[1], args[2], args[2], args[3], args[3], args[4], args[4], args[4], args[5], args[5], args[6], args[7]]);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`,
    [args[0], args[0], args[1], args[1], args[2], args[2], args[3], args[3], args[4], args[4], args[4], args[5], args[5]]);
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  await query(
    `INSERT INTO tickets (title, description, alert_id, priority, assigned_to, due_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.title, data.description ?? null, data.alertId ?? null, data.priority, data.assignedTo ?? null, data.dueDate ? new Date(data.dueDate) : null, userId]);
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, data) {
  await query(
    `UPDATE tickets SET
       title       = COALESCE(?, title),
       description = COALESCE(?, description),
       priority    = COALESCE(?, priority),
       due_date    = COALESCE(?, due_date)
     WHERE id = ?`,
    [data.title ?? null, data.description ?? null, data.priority ?? null, data.dueDate ? new Date(data.dueDate) : null, id]);
  return findById(id);
}

async function assign(id, assignedTo) {
  await query(
    `UPDATE tickets
     SET assigned_to = ?,
         status = CASE WHEN status = 'open' AND ? IS NOT NULL
                       THEN 'in_progress' ELSE status END
     WHERE id = ?`,
    [assignedTo, assignedTo, id]);
  return findById(id);
}

async function escalate(id, escalatedTo) {
  await query(
    `UPDATE tickets
     SET escalated_to = ?,
         escalation_level = escalation_level + 1,
         status = 'escalated'
     WHERE id = ?`,
    [escalatedTo, id]);
  return findById(id);
}

async function changeStatus(id, status, userId, resolution) {
  const closing = status === 'closed';
  const closedAt = closing ? 'datetime(\'now\')' : 'NULL';
  const closedBy = closing ? '?' : 'NULL';
  await query(
    `UPDATE tickets SET
       status     = ?,
       closed_at  = ${closedAt},
       closed_by  = ${closedBy},
       resolution = COALESCE(?, resolution)
     WHERE id = ?`,
    [status, closing ? userId : null, resolution ?? null, id]);
  return findById(id);
}

/* ---------- historial ---------- */

async function addHistory({ ticketId, changedBy, action, fieldName, oldValue, newValue, comment }) {
  await query(
    `INSERT INTO ticket_history
       (ticket_id, changed_by, action, field_name, old_value, new_value, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ticketId, changedBy, action, fieldName ?? null, oldValue != null ? String(oldValue).slice(0, 255) : null, newValue != null ? String(newValue).slice(0, 255) : null, comment ?? null]);
}

async function getHistory(ticketId) {
  const result = await query(
    `SELECT h.id, h.action, h.field_name, h.old_value, h.new_value, h.comment,
            h.created_at, h.changed_by, u.full_name AS changed_by_name
     FROM ticket_history h
     INNER JOIN users u ON u.id = h.changed_by
     WHERE h.ticket_id = ?
     ORDER BY h.created_at ASC, h.id ASC`,
    [ticketId]);
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
       SUM(CASE WHEN status <> 'closed' AND assigned_to = ? THEN 1 ELSE 0 END) AS mine_count,
       SUM(CASE WHEN status <> 'closed' AND due_date < datetime('now') THEN 1 ELSE 0 END) AS overdue_count,
       SUM(CASE WHEN closed_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) AS closed_last_7d
     FROM tickets`,
    [userId ?? null]);
  return result.recordset[0];
}

module.exports = {
  findById, list, create, update, assign, escalate, changeStatus,
  addHistory, getHistory, summary,
};
