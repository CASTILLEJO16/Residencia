'use strict';
const KpiModel = require('../models/KpiModel');
const ThresholdModel = require('../models/ThresholdModel');
const kpiService = require('../services/kpiService');
const sqlExecutor = require('../utils/sqlExecutor');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, ...await KpiModel.list(req.validatedQuery || req.query) });
});

const getById = asyncHandler(async (req, res) => {
  const kpi = await KpiModel.findById(req.params.id);
  if (!kpi) throw AppError.notFound('KPI no encontrado');
  const thresholds = await ThresholdModel.findByKpi(kpi.id);
  res.json({ success: true, data: { ...kpi, thresholds } });
});

const create = asyncHandler(async (req, res) => {
  sqlExecutor.assertQueryIsSafe(req.body.sqlQuery);
  const kpi = await KpiModel.create(req.body, req.user.id);
  audit(res, {
    action: 'kpi.create', entityType: 'kpi', entityId: kpi.id,
    newValues: { name: kpi.name, widgetType: kpi.widget_type, sqlQuery: kpi.sql_query },
  });
  res.status(201).json({ success: true, data: kpi });
});

const update = asyncHandler(async (req, res) => {
  const before = await KpiModel.findById(req.params.id);
  if (!before) throw AppError.notFound('KPI no encontrado');
  if (req.body.sqlQuery) sqlExecutor.assertQueryIsSafe(req.body.sqlQuery);

  const after = await KpiModel.update(req.params.id, req.body);
  audit(res, {
    action: 'kpi.update', entityType: 'kpi', entityId: req.params.id,
    oldValues: { name: before.name, sqlQuery: before.sql_query, isActive: before.is_active },
    newValues: { name: after.name, sqlQuery: after.sql_query, isActive: after.is_active },
  });
  res.json({ success: true, data: after });
});

const remove = asyncHandler(async (req, res) => {
  const kpi = await KpiModel.findById(req.params.id);
  if (!kpi) throw AppError.notFound('KPI no encontrado');

  const deps = await KpiModel.countDependencies(kpi.id);
  if (deps.thresholds > 0 || deps.alerts > 0) {
    throw AppError.conflict(
      `El KPI tiene ${deps.thresholds} umbral(es) y ${deps.alerts} alerta(s). ` +
      'Elimine los umbrales primero o desactive el KPI.'
    );
  }

  await KpiModel.remove(kpi.id);
  audit(res, {
    action: 'kpi.delete', entityType: 'kpi', entityId: kpi.id, oldValues: { name: kpi.name },
  });
  res.json({ success: true, data: { message: 'KPI eliminado' } });
});

/** GET /api/kpis/:id/data — respeta el cache salvo que se pida ?force=true */
const getData = asyncHandler(async (req, res) => {
  const force = req.query.force === 'true';
  const data = await kpiService.runById(req.params.id, { force });
  res.json({ success: true, data });
});

/** GET /api/kpis/dashboard — todos los KPIs activos de una sola llamada. */
const dashboard = asyncHandler(async (req, res) => {
  const kpis = await KpiModel.findActive();
  const force = req.query.force === 'true';
  const widgets = await kpiService.runMany(kpis, { force });
  res.json({
    success: true,
    data: {
      widgets,
      kpis: kpis.map((k) => ({
        id: k.id, name: k.name, description: k.description,
        widgetType: k.widget_type, refreshInterval: k.refresh_interval,
      })),
    },
  });
});

/** GET /api/kpis/:id/history */
const history = asyncHandler(async (req, res) => {
  const kpi = await KpiModel.findById(req.params.id);
  if (!kpi) throw AppError.notFound('KPI no encontrado');
  const rows = await KpiModel.history(kpi.id, req.query);
  res.json({ success: true, data: { kpi: { id: kpi.id, name: kpi.name }, points: rows } });
});

/**
 * POST /api/kpis/preview — prueba una consulta sin guardarla.
 * Solo administradores y analistas, y siempre contra la conexion de solo lectura.
 */
const preview = asyncHandler(async (req, res) => {
  const { sqlQuery, timeoutSeconds } = req.body;
  const result = await sqlExecutor.preview(sqlQuery, { timeoutSeconds });
  audit(res, {
    action: 'kpi.preview', entityType: 'kpi',
    newValues: { rowCount: result.rowCount, durationMs: result.durationMs },
  });
  res.json({ success: true, data: result });
});

/** POST /api/kpis/validate — valida la sintaxis sin ejecutar nada. */
const validateQuery = asyncHandler(async (req, res) => {
  const problems = sqlExecutor.validateQuery(req.body.sqlQuery);
  res.json({ success: true, data: { valid: problems.length === 0, problems } });
});

module.exports = {
  list, getById, create, update, remove, getData, dashboard, history, preview, validateQuery,
};
