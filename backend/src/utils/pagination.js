'use strict';

/** Normaliza los parametros de paginacion de la query string. */
function parsePagination(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  return { page, limit, offset: (page - 1) * limit };
}

function buildMeta(total, page, limit) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Valida una columna de ordenamiento contra una lista blanca.
 * Nunca interpolar directamente lo que venga del cliente en un ORDER BY.
 */
function safeSort(requested, allowed, fallback) {
  const [field, dirRaw] = String(requested || '').split(':');
  const column = allowed.includes(field) ? field : fallback;
  const direction = String(dirRaw).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { column, direction };
}

module.exports = { parsePagination, buildMeta, safeSort };
