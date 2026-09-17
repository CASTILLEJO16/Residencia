'use strict';
const ThresholdModel = require('../models/ThresholdModel');
const KpiModel = require('../models/KpiModel');
const alertService = require('../services/alertService');
const kpiService = require('../services/kpiService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await ThresholdModel.findAll(req.query) });
});

const getById = asyncHandler(async (req, res) => {
  const threshold = await ThresholdModel.findById(req.params.id);
  if (!threshold) throw AppError.notFound('Umbral no encontrado');
  res.json({ success: true, data: threshold });
});

const create = asyncHandler(async (req, res) => {
  const kpi = await KpiModel.findById(req.body.kpiId);
  if (!kpi) throw AppError.badRequest('El KPI indicado no existe');

  const threshold = await ThresholdModel.create(req.body, req.user.id);
  audit(res, {
    action: 'threshold.create', entityType: 'threshold', entityId: threshold.id,
    newValues: {
      kpi: kpi.name, name: threshold.name,
      condition: threshold.condition_type, severity: threshold.severity,
    },
  });
  res.status(201).json({ success: true, data: threshold });
});

const update = asyncHandler(async (req, res) => {
  const before = await ThresholdModel.findById(req.params.id);
  if (!before) throw AppError.notFound('Umbral no encontrado');

  const after = await ThresholdModel.update(req.params.id, req.body);
  audit(res, {
    action: 'threshold.update', entityType: 'threshold', entityId: req.params.id,
    oldValues: auditable(before), newValues: auditable(after),
  });
  res.json({ success: true, data: after });
});

const remove = asyncHandler(async (req, res) => {
  const threshold = await ThresholdModel.findById(req.params.id);
  if (!threshold) throw AppError.notFound('Umbral no encontrado');

  const result = await ThresholdModel.remove(req.params.id);
  if (!result.deleted) {
    throw AppError.conflict(
      `El umbral tiene ${result.alerts} alerta(s) asociadas. Desactivelo en vez de eliminarlo.`
    );
  }
  audit(res, {
    action: 'threshold.delete', entityType: 'threshold', entityId: req.params.id,
    oldValues: { name: threshold.name, kpi: threshold.kpi_name },
  });
  res.json({ success: true, data: { message: 'Umbral eliminado' } });
});

/**
 * POST /api/thresholds/:id/test
 * Evalua el umbral contra el valor actual del KPI sin abrir ninguna alerta.
 */
const test = asyncHandler(async (req, res) => {
  const threshold = await ThresholdModel.findById(req.params.id);
  if (!threshold) throw AppError.notFound('Umbral no encontrado');

  const kpi = await KpiModel.findById(threshold.kpi_id);
  const result = await kpiService.runKpi(kpi, { force: true, persist: false });
  const value = result.scalar;
  const breached = alertService.evaluate(threshold, value);

  res.json({
    success: true,
    data: {
      currentValue: value,
      breached,
      message: breached ? alertService.describe(threshold, value) : 'El KPI esta dentro del umbral',
    },
  });
});

function auditable(t) {
  return {
    name: t.name, conditionType: t.condition_type, thresholdValue: t.threshold_value,
    thresholdMin: t.threshold_min, thresholdMax: t.threshold_max,
    severity: t.severity, isActive: t.is_active,
  };
}

module.exports = { list, getById, create, update, remove, test };
