'use strict';
const { z } = require('zod');

/**
 * Version "parcial" de un esquema de objeto para los PUT/PATCH: todos los
 * campos opcionales y SIN valores por defecto. (En Zod 4, .partial() aplica
 * los .default() de los campos ausentes, lo que en una actualizacion
 * sobrescribiria valores que el cliente no envio.)
 */
function partialWithoutDefaults(objectSchema) {
  const shape = {};
  for (const [key, field] of Object.entries(objectSchema.shape)) {
    const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = inner.optional();
  }
  return z.object(shape);
}

module.exports = { partialWithoutDefaults };
