'use strict';
const { query } = require('../config/database');
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
  const result = await query(`SELECT ${FIELDS} ${JOINS} WHERE t.id = $1`, [id]);
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
    WHERE ($1 IS NULL OR t.status = $1)
      AND ($2 IS NULL OR t.priority = $2)
      AND ($3 IS NULL OR t.assigned_to = $3)
      AND ($4 IS NULL OR t.created_by = $4)
      AND ($5 IS NULL OR t.title LIKE $5 OR t.description LIKE $5)
      AND ($6 IS NULL OR t.assigned_to IS NULL)
      AND ($7 IS NULL OR (t.due_date < NOW() AND t.status <> 'closed'))`;

  const rows = await query(
    `SELECT ${FIELDS} ${JOINS} ${where}
     ORDER BY ${column === 'priority'
       ? `CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`
       : `t.${column}`} ${direction}
     LIMIT $9 OFFSET $8`, args);

  const count = await query(`SELECT COUNT(*) AS total ${JOINS} ${where}`, args.slice(0, 7));
  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create(data, userId) {
  const result = await query(
    `INSERT INTO tickets (title, description, alert_id, priority, assigned_to, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [data.title, data.description ?? null, data.alertId ?? null, data.priority, data.assignedTo ?? null, data.dueDate ? new Date(data.dueDate) : null, userId]);
  return findById(result.recordset[0].id);
}

async function update(id, data) {
  await query(
    `UPDATE tickets SET
       title       = COALESCE($2, title),
       description = COALESCE($3, description),
       priority    = COALESCE($4, priority),
       due_date    = COALESCE($5, due_date)
     WHERE id = $1`,
    [id, data.title ?? null, data.description ?? null, data.priority ?? null, data.dueDate ? new Date(data.dueDate) : null]);
  return findById(id);
}

async function assign(id, assignedTo) {
  await query(
    `UPDATE tickets
     SET assigned_to = $2,
         status = CASE WHEN status = 'open' AND $2 IS NOT NULL
                       THEN 'in_progress' ELSE status END
     WHERE id = $1`,
    [id, assignedTo]);
  return findById(id);
}

async function escalate(id, escalatedTo) {
  await query(
    `UPDATE tickets
     SET escalated_to = $2,
         escalation_level = escalation_level + 1,
         status = 'escalated'
     WHERE id = $1`,
    [id, escalatedTo]);
  return findById(id);
}

async function changeStatus(id, status, userId, resolution) {
  const closing = status === 'closed';
  await query(
    `UPDATE tickets SET
       status     = $2,
       closed_at  = ${closing ? 'NOW()' : 'NULL'},
       closed_by  = ${closing ? '$3' : 'NULL'},
       resolution = COALESCE($4, resolution)
     WHERE id = $1`,
    [id, status, userId, resolution ?? null]);
  return findById(id);
}

/* ---------- historial ---------- */

async function addHistory({ ticketId, changedBy, action, fieldName, oldValue, newValue, comment }) {
  await query(
    `INSERT INTO ticket_history
       (ticket_id, changed_by, action, field_name, old_value, new_value, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ticketId, changedBy, action, fieldName ?? null, oldValue != null ? String(oldValue).slice(0, 255) : null, newValue != null ? String(newValue).slice(0, 255) : null, comment ?? null]);
}

async function getHistory(ticketId) {
  const result = await query(
    `SELECT h.id, h.action, h.field_name, h.old_value, h.new_value, h.comment,
            h.created_at, h.changed_by, u.full_name AS changed_by_name
     FROM ticket_history h
     INNER JOIN users u ON u.id = h.changed_by
     WHERE h.ticket_id = $1
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
       SUM(CASE WHEN status <> 'closed' AND assigned_to = $1 THEN 1 ELSE 0 END) AS mine_count,
       SUM(CASE WHEN status <> 'closed' AND due_date < NOW() THEN 1 ELSE 0 END) AS overdue_count,
       SUM(CASE WHEN closed_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS closed_last_7d
     FROM tickets`,
    [userId ?? null]);
  return result.recordset[0];
}

module.exports = {
  findById, list, create, update, assign, escalate, changeStatus,
  addHistory, getHistory, summary,
};
