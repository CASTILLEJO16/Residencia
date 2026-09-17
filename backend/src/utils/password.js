'use strict';
const bcrypt = require('bcryptjs');
const config = require('../config/env');

async function hash(plain) {
  return bcrypt.hash(plain, config.security.bcryptRounds);
}

async function verify(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

/**
 * Reglas de contrasena. Devuelve un arreglo de errores (vacio si es valida).
 */
function validateStrength(plain) {
  const errors = [];
  const min = config.security.passwordMinLength;
  if (!plain || plain.length < min) errors.push(`Debe tener al menos ${min} caracteres`);
  if (!/[a-z]/.test(plain)) errors.push('Debe incluir una minuscula');
  if (!/[A-Z]/.test(plain)) errors.push('Debe incluir una mayuscula');
  if (!/[0-9]/.test(plain)) errors.push('Debe incluir un numero');
  if (!/[^A-Za-z0-9]/.test(plain)) errors.push('Debe incluir un caracter especial');
  return errors;
}

module.exports = { hash, verify, validateStrength };
