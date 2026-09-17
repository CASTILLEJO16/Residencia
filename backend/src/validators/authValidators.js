'use strict';
const { z } = require('zod');
const config = require('../config/env');

const passwordSchema = z.string()
  .min(config.security.passwordMinLength,
    `La contrasena debe tener al menos ${config.security.passwordMinLength} caracteres`)
  .max(128)
  .regex(/[a-z]/, 'Debe incluir una minuscula')
  .regex(/[A-Z]/, 'Debe incluir una mayuscula')
  .regex(/[0-9]/, 'Debe incluir un numero')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir un caracter especial');

const loginSchema = z.object({
  username: z.string().trim().min(1, 'El usuario es obligatorio').max(50),
  password: z.string().min(1, 'La contrasena es obligatoria').max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().length(96, 'Refresh token invalido'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'La contrasena actual es obligatoria'),
  newPassword: passwordSchema,
}).refine((d) => d.currentPassword !== d.newPassword, {
  message: 'La nueva contrasena debe ser distinta de la actual',
  path: ['newPassword'],
});

module.exports = { passwordSchema, loginSchema, refreshSchema, changePasswordSchema };
