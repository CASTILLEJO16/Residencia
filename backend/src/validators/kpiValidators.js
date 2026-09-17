'use strict';
const { z } = require('zod');

const WIDGET_TYPES = ['line', 'bar', 'pie', 'gauge', 'number', 'table', 'area'];

const sqlQuery = z.string().trim().min(10, 'La consulta es demasiado corta').max(8000);

const createKpiSchema = z.object({
  name: z.string().trim().min(3).max(100),
  description: z.string().trim().max(255).optional(),
  sqlQuery,
  dataSource: z.string().trim().max(100).optional(),
  refreshInterval: z.coerce.number().int().min(30).max(86400).optional().default(300),
  maxRows: z.coerce.number().int().min(1).max(10000).optional().default(1000),
  timeoutSeconds: z.coerce.number().int().min(1).max(120).optional().default(15),
  widgetType: z.enum(WIDGET_TYPES),
  valueColumn: z.string().trim().max(100).optional(),
  labelColumn: z.string().trim().max(100).optional(),
  isActive: z.boolean().optional().default(true),
});

const updateKpiSchema = createKpiSchema.partial().refine(
  (d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

const previewSchema = z.object({
  sqlQuery,
  timeoutSeconds: z.coerce.number().int().min(1).max(60).optional().default(10),
});

const validateSchema = z.object({ sqlQuery: z.string().max(8000) });

const listKpisSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  widgetType: z.enum(WIDGET_TYPES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sort: z.string().max(50).optional(),
});

module.exports = {
  WIDGET_TYPES, createKpiSchema, updateKpiSchema, previewSchema, validateSchema, listKpisSchema,
};
