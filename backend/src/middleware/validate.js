'use strict';
const AppError = require('../utils/AppError');

/**
 * Valida body / params / query contra esquemas de Zod y reemplaza
 * el contenido por la version ya parseada y tipada.
 */
function validate(schemas) {
  return (req, res, next) => {
    try {
      for (const key of ['body', 'params', 'query']) {
        if (!schemas[key]) continue;
        const result = schemas[key].safeParse(req[key]);
        if (!result.success) {
          const details = result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          }));
          throw AppError.badRequest('Datos de entrada invalidos', details);
        }
        if (key === 'query') {
          // req.query es de solo lectura en Express 5; se guarda aparte.
          req.validatedQuery = result.data;
        } else {
          req[key] = result.data;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
