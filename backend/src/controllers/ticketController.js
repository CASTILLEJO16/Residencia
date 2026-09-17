'use strict';
const TicketModel = require('../models/TicketModel');
const UserModel = require('../models/UserModel');
const AlertModel = require('../models/AlertModel');
const emailService = require('../services/emailService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');
const { ROLES } = require('../middleware/roleMiddleware');

const list = asyncHandler(async (req, res) => {
  const params = { ...(req.validatedQuery || req.query) };
  if (params.mine === 'true') params.assignedTo = req.user.id;
  res.json({ success: true, ...await TicketModel.list(params) });
});

const getById = asyncHandler(async (req, res) => {
  const ticket = await TicketModel.findById(req.params.id);
  if (!ticket) throw AppError.notFound('Ticket no encontrado');
  const history = await TicketModel.getHistory(ticket.id);
  res.json({ success: true, data: { ...ticket, history } });
});

const summary = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await TicketModel.summary(req.user.id) });
});

const create = asyncHandler(async (req, res) => {
  const { alertId, assignedTo } = req.body;

  if (alertId) {
    const alert = await AlertModel.findById(alertId);
    if (!alert) throw AppError.badRequest('La alerta indicada no existe');
    if (alert.ticket_id) throw AppError.conflict('La alerta ya tiene un ticket asociado');
  }

  const assignee = assignedTo ? await requireActiveUser(assignedTo) : null;

  const ticket = await TicketModel.create(req.body, req.user.id);
  await TicketModel.addHistory({
    ticketId: ticket.id, changedBy: req.user.id, action: 'created',
    comment: `Ticket creado con prioridad ${ticket.priority}`,
  });

  if (assignee) {
    await TicketModel.addHistory({
      ticketId: ticket.id, changedBy: req.user.id, action: 'assigned',
      fieldName: 'assigned_to', newValue: assignee.full_name,
    });
    await emailService.sendTicketAssigned(ticket, assignee);
  }

  audit(res, {
    action: 'ticket.create', entityType: 'ticket', entityId: ticket.id,
    newValues: { title: ticket.title, priority: ticket.priority, alertId: alertId ?? null },
  });
  res.status(201).json({ success: true, data: ticket });
});

const update = asyncHandler(async (req, res) => {
  const before = await requireEditable(req);
  const after = await TicketModel.update(before.id, req.body);

  for (const field of ['title', 'priority', 'due_date']) {
    const key = field === 'due_date' ? 'dueDate' : field;
    if (req.body[key] === undefined) continue;
    if (String(before[field]) === String(after[field])) continue;
    await TicketModel.addHistory({
      ticketId: before.id, changedBy: req.user.id,
      action: field === 'priority' ? 'priority_changed' : 'status_changed',
      fieldName: field, oldValue: before[field], newValue: after[field],
    });
  }

  audit(res, {
    action: 'ticket.update', entityType: 'ticket', entityId: before.id,
    oldValues: auditable(before), newValues: auditable(after),
  });
  res.json({ success: true, data: after });
});

/** POST /api/tickets/:id/assign — assignedTo null lo devuelve a la bandeja comun. */
const assign = asyncHandler(async (req, res) => {
  const before = await requireEditable(req);
  const { assignedTo } = req.body;
  const assignee = assignedTo ? await requireActiveUser(assignedTo) : null;

  const after = await TicketModel.assign(before.id, assignedTo ?? null);
  await TicketModel.addHistory({
    ticketId: before.id, changedBy: req.user.id, action: 'assigned',
    fieldName: 'assigned_to',
    oldValue: before.assigned_to_name, newValue: assignee?.full_name || 'sin asignar',
  });

  if (assignee && assignee.id !== req.user.id) {
    await emailService.sendTicketAssigned(after, assignee);
  }

  audit(res, {
    action: 'ticket.assign', entityType: 'ticket', entityId: before.id,
    oldValues: { assignedTo: before.assigned_to }, newValues: { assignedTo: assignedTo ?? null },
  });
  res.json({ success: true, data: after });
});

/** POST /api/tickets/:id/escalate */
const escalate = asyncHandler(async (req, res) => {
  const before = await requireEditable(req);
  const { escalatedTo, reason } = req.body;
  const target = await requireActiveUser(escalatedTo);

  if (target.id === before.assigned_to) {
    throw AppError.badRequest('No se puede escalar a la misma persona que ya lo atiende');
  }

  const after = await TicketModel.escalate(before.id, escalatedTo);
  await TicketModel.addHistory({
    ticketId: before.id, changedBy: req.user.id, action: 'escalated',
    fieldName: 'escalated_to', oldValue: before.escalated_to_name, newValue: target.full_name,
    comment: reason,
  });
  await emailService.sendTicketEscalated(after, target, reason);

  audit(res, {
    action: 'ticket.escalate', entityType: 'ticket', entityId: before.id,
    newValues: { escalatedTo: escalatedTo, level: after.escalation_level, reason },
  });
  res.json({ success: true, data: after });
});

/** PATCH /api/tickets/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const before = await requireEditable(req, { allowClosed: true });
  const { status, resolution } = req.body;

  if (before.status === status) throw AppError.badRequest('El ticket ya tiene ese estado');
  if (status === 'closed' && !resolution) {
    throw AppError.badRequest('Debe indicar la resolucion para cerrar el ticket');
  }
  if (before.status === 'closed' && status !== 'closed' && req.user.role !== ROLES.ADMIN) {
    throw AppError.forbidden('Solo un administrador puede reabrir un ticket cerrado');
  }

  const after = await TicketModel.changeStatus(before.id, status, req.user.id, resolution);
  await TicketModel.addHistory({
    ticketId: before.id, changedBy: req.user.id,
    action: status === 'closed' ? 'closed' : (before.status === 'closed' ? 'reopened' : 'status_changed'),
    fieldName: 'status', oldValue: before.status, newValue: status, comment: resolution,
  });

  // Cerrar el ticket resuelve la alerta que lo origino.
  if (status === 'closed' && before.alert_id) {
    await AlertModel.resolve(before.alert_id, req.user.id);
  }

  audit(res, {
    action: `ticket.${status}`, entityType: 'ticket', entityId: before.id,
    oldValues: { status: before.status }, newValues: { status },
  });
  res.json({ success: true, data: after });
});

/** POST /api/tickets/:id/comments */
const addComment = asyncHandler(async (req, res) => {
  const ticket = await TicketModel.findById(req.params.id);
  if (!ticket) throw AppError.notFound('Ticket no encontrado');

  await TicketModel.addHistory({
    ticketId: ticket.id, changedBy: req.user.id,
    action: 'comment_added', comment: req.body.comment,
  });

  audit(res, { action: 'ticket.comment', entityType: 'ticket', entityId: ticket.id });
  res.status(201).json({ success: true, data: await TicketModel.getHistory(ticket.id) });
});

const getHistory = asyncHandler(async (req, res) => {
  const ticket = await TicketModel.findById(req.params.id);
  if (!ticket) throw AppError.notFound('Ticket no encontrado');
  res.json({ success: true, data: await TicketModel.getHistory(ticket.id) });
});

/* ---------- helpers ---------- */

async function requireEditable(req, { allowClosed = false } = {}) {
  const ticket = await TicketModel.findById(req.params.id);
  if (!ticket) throw AppError.notFound('Ticket no encontrado');
  if (!allowClosed && ticket.status === 'closed') {
    throw AppError.conflict('El ticket esta cerrado. Reabralo antes de modificarlo.');
  }
  return ticket;
}

async function requireActiveUser(id) {
  const user = await UserModel.findById(id);
  if (!user) throw AppError.badRequest('El usuario indicado no existe');
  if (!user.is_active) throw AppError.badRequest('No se puede asignar a un usuario desactivado');
  return user;
}

function auditable(t) {
  return { title: t.title, priority: t.priority, status: t.status, dueDate: t.due_date };
}

module.exports = {
  list, getById, summary, create, update, assign, escalate,
  changeStatus, addComment, getHistory,
};
