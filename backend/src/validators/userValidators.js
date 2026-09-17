'use strict';
const { z } = require('zod');
const { passwordSchema } = require('./authValidators');

const idParam = z.object({
  id: z.coerce.number().int().positive('Id invalido'),
});

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, numeros, punto, guion y guion bajo'),
  email: z.string().trim().toLowerCase().email('Correo invalido').max(150),
  fullName: z.string().trim().min(3, 'El nombre es obligatorio').max(150),
  roleId: z.coerce.number().int().positive(),
  password: passwordSchema,
  mustChangePassword: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150).optional(),
  fullName: z.string().trim().min(3).max(150).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'Debe enviar al menos un campo a modificar',
});

const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
  mustChangePassword: z.boolean().optional().default(true),
});

const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  sort: z.string().max(50).optional(),
});

module.exports = {
  idParam, createUserSchema, updateUserSchema, resetPasswordSchema, listUsersSchema,
};
