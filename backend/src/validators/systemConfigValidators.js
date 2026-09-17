'use strict';
const { z } = require('zod');

const createConfigSchema = z.object({
  keyName: z.string().trim().min(1).max(100)
    .regex(/^[a-z_][a-z0-9_]*$/, 'Debe empezar con letra o guion bajo, solo minusculas, numeros y guiones bajos'),
  value: z.string().max(5000).optional(),
  valueType: z.enum(['string', 'int', 'bool', 'json']),
  description: z.string().trim().max(255).optional(),
  isSecret: z.boolean().optional(),
});

const updateConfigSchema = z.object({
  value: z.string().max(5000).optional(),
  description: z.string().trim().max(255).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'Debe enviar al menos un campo a modificar',
});

module.exports = { createConfigSchema, updateConfigSchema };
