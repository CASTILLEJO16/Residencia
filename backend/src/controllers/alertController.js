'use strict';
const AlertModel = require('../models/AlertModel');
const schedulerService = require('../services/schedulerService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, ...await AlertModel.list(req.query) });
});

const getById = asyncHandler(async (req, res) => {
  const alert = await AlertModel.findById(req.params.id);
  if (!alert) throw AppError.notFound('Alerta no encontrada');
  res.json({ success: true, data: alert });
});

const summary = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await AlertModel.summary() });
});

/** Tomar la alerta: alguien la esta atendiendo. */
const acknowledge = asyncHandler(async (req, res) => {
  const alert = await AlertModel.findById(req.params.id);
  if (!alert) throw AppError.notFound('Alerta no encontrada');
  if (alert.status !== 'open') throw AppError.conflict('La alerta ya fue atendida');

  const updated = await AlertModel.acknowledge(req.params.id, req.user.id);
  audit(res, {
    action: 'alert.acknowledge', entityType: 'alert', entityId: req.params.id,
    oldValues: { status: alert.status }, newValues: { status: 'acknowledged' },
  });
  res.json({ success: true, data: updated });
});

const resolve = asyncHandler(async (req, res) => {
  const alert = await AlertModel.findById(req.params.id);
  if (!alert) throw AppError.notFound('Alerta no encontrada');
  if (alert.status === 'resolved') throw AppError.conflict('La alerta ya esta resuelta');

  const updated = await AlertModel.resolve(req.params.id, req.user.id);
  audit(res, {
    action: 'alert.resolve', entityType: 'alert', entityId: req.params.id,
    oldValues: { status: alert.status }, newValues: { status: 'resolved' },
  });
  res.json({ success: true, data: updated });
});

/** Estado del monitor, util para diagnosticar por que no llegan alertas. */
const monitorStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: schedulerService.status() });
});

/** Fuerza un ciclo del monitor sin esperar al cron. */
const runMonitor = asyncHandler(async (req, res) => {
  await schedulerService.monitorTick();
  audit(res, { action: 'monitor.manual_run', entityType: 'config' });
  res.json({ success: true, data: schedulerService.status() });
});

module.exports = { list, getById, summary, acknowledge, resolve, monitorStatus, runMonitor };
