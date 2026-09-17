'use strict';

/** Envuelve un handler async para que los rechazos lleguen al errorHandler. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
