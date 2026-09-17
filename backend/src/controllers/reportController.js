'use strict';
const reportService = require('../services/reportService');
const AlertModel = require('../models/AlertModel');
const TicketModel = require('../models/TicketModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const catalog = asyncHandler(async (req, res) => {
  res.json({ success: true, data: reportService.availableReports() });
});

/** GET /api/reports/:type — datos en JSON para verlos en pantalla. */
const preview = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const params = { ...req.query, limit: Math.min(Number(req.query.limit) || 200, 1000) };
  const result = await reportService.fetchData(type, params);
  if (!result) throw AppError.notFound(`El reporte "${type}" no existe`);

  res.json({
    success: true,
    data: {
      title: result.title,
      columns: result.columns.map((c) => ({ key: c.key, header: c.header, type: c.type })),
      rows: result.rows,
      rowCount: result.rows.length,
    },
  });
});

/** GET /api/reports/:type/export?format=xlsx|csv|pdf */
const exportReport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const format = (req.query.format || 'xlsx').toLowerCase();
  if (!['xlsx', 'csv', 'pdf'].includes(format)) {
    throw AppError.badRequest('Formato no soportado. Use xlsx, csv o pdf.');
  }

  const result = await reportService.fetchData(type, req.query);
  if (!result) throw AppError.notFound(`El reporte "${type}" no existe`);

  const filters = { ...req.query };
  delete filters.format;

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const filename = `sio-${type}-${stamp}.${format}`;

  audit(res, {
    action: 'report.export', entityType: 'report', entityId: type,
    newValues: { format, rowCount: result.rows.length, filters },
  });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(reportService.toCsv(result));
  }
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(await reportService.toPdf(result, filters));
  }
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(Buffer.from(await reportService.toXlsx(result, filters)));
});

/** GET /api/reports/summary — cifras para la portada de reportes. */
const summary = asyncHandler(async (req, res) => {
  const [alerts, tickets] = await Promise.all([
    AlertModel.summary(),
    TicketModel.summary(req.user.id),
  ]);
  res.json({ success: true, data: { alerts, tickets } });
});

module.exports = { catalog, preview, exportReport, summary };
