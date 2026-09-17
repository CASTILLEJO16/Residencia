'use strict';
const { z } = require('zod');

const createRoleSchema = z.object({
  name: z.string().trim().min(3).max(50)
    .regex(/^[A-Za-z0-9_]+$/, 'Solo letras, numeros y guion bajo'),
  description: z.string().trim().max(255).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(3).max(50)
    .regex(/^[A-Za-z0-9_]+$/, 'Solo letras, numeros y guion bajo').optional(),
  description: z.string().trim().max(255).optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'Debe enviar al menos un campo a modificar',
});

module.exports = { createRoleSchema, updateRoleSchema };
