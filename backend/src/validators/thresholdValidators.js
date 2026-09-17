'use strict';
const { z } = require('zod');

const CONDITIONS = ['greater_than', 'less_than', 'equals', 'not_equals', 'between', 'outside'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const emailList = z.string().trim().max(500).refine(
  (v) => !v || v.split(/[,;]/).every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())),
  { message: 'Lista de correos invalida (separe con coma)' }
);

const base = {
  name: z.string().trim().min(3).max(100),
  conditionType: z.enum(CONDITIONS),
  thresholdValue: z.coerce.number().optional(),
  thresholdMin: z.coerce.number().optional(),
  thresholdMax: z.coerce.number().optional(),
  severity: z.enum(SEVERITIES),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440).optional().default(30),
  autoCreateTicket: z.boolean().optional().default(false),
  notifyEmails: emailList.optional(),
  isActive: z.boolean().optional().default(true),
};

/** Un umbral de rango necesita minimo y maximo; el resto necesita un valor. */
function checkValues(data, ctx) {
  const needsRange = ['between', 'outside'].includes(data.conditionType);
  if (needsRange) {
    if (data.thresholdMin === undefined || data.thresholdMax === undefined) {
      ctx.addIssue({ code: 'custom', path: ['thresholdMin'],
        message: 'Los rangos requieren minimo y maximo' });
    } else if (data.thresholdMin > data.thresholdMax) {
      ctx.addIssue({ code: 'custom', path: ['thresholdMax'],
        message: 'El maximo debe ser mayor o igual que el minimo' });
    }
  } else if (data.conditionType && data.thresholdValue === undefined) {
    ctx.addIssue({ code: 'custom', path: ['thresholdValue'],
      message: 'Esta condicion requiere un valor' });
  }
}

const createThresholdSchema = z.object({
  kpiId: z.coerce.number().int().positive(),
  ...base,
}).superRefine(checkValues);

const updateThresholdSchema = z.object(base).partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Debe enviar al menos un campo' });
  }
  if (data.conditionType) checkValues(data, ctx);
});

module.exports = { CONDITIONS, SEVERITIES, createThresholdSchema, updateThresholdSchema };
