'use strict';
const { sql, getReadOnlyPool } = require('../config/database');
const AppError = require('./AppError');

/**
 * Ejecutor de las consultas de los KPIs.
 *
 * IMPORTANTE: la validacion de texto que hay aqui es una segunda linea de
 * defensa, no la principal. Cualquier lista negra de palabras se puede
 * burlar. El control real es que esto corre con getReadOnlyPool(), un
 * usuario de SQL Server que solo tiene SELECT sobre la base de origen y
 * DENY explicito sobre el esquema del SIO (ver 05_readonly_user.sql).
 * Si esa conexion no esta bien configurada, este archivo no protege nada.
 */

// Palabras que no tienen ningun motivo para aparecer en la consulta de un KPI.
const FORBIDDEN = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'alter', 'create',
  'grant', 'revoke', 'deny', 'exec', 'execute', 'sp_executesql', 'backup',
  'restore', 'shutdown', 'reconfigure', 'kill', 'dbcc', 'waitfor', 'openrowset',
  'openquery', 'opendatasource', 'openxml', 'bulk', 'sysadmin', 'xp_cmdshell',
];

// Objetos internos del SIO: un KPI nunca debe leerlos.
const FORBIDDEN_OBJECTS = [
  'users', 'roles', 'refresh_tokens', 'password_resets', 'audit_logs',
  'system_config', 'sys.', 'sysobjects', 'syscolumns', 'information_schema',
  'fn_my_permissions', 'suser_', 'is_srvrolemember',
];

/**
 * Analiza la consulta y devuelve la lista de problemas encontrados.
 * Se usa tanto al guardar el KPI como antes de cada ejecucion.
 */
function validateQuery(rawQuery) {
  const problems = [];
  const text = String(rawQuery || '').trim();

  if (!text) {
    return ['La consulta esta vacia'];
  }
  if (text.length > 8000) {
    problems.push('La consulta supera los 8000 caracteres');
  }

  // Comentarios: sirven para esconder codigo, no se permiten.
  if (text.includes('--') || text.includes('/*') || text.includes('*/')) {
    problems.push('No se permiten comentarios (-- o /* */)');
  }

  // Un solo statement. Se tolera un punto y coma final.
  const withoutTrailing = text.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    problems.push('Solo se permite una sentencia (sin punto y coma intermedio)');
  }

  // Tiene que empezar por SELECT o por un CTE.
  if (!/^\s*(select|with)\b/i.test(withoutTrailing)) {
    problems.push('La consulta debe comenzar con SELECT o WITH');
  }

  const lower = withoutTrailing.toLowerCase();

  for (const word of FORBIDDEN) {
    const pattern = new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`, 'i');
    if (pattern.test(lower)) problems.push(`Palabra no permitida: ${word.toUpperCase()}`);
  }

  // SELECT ... INTO crea tablas.
  if (/\binto\b/i.test(lower)) {
    problems.push('No se permite SELECT ... INTO');
  }

  for (const obj of FORBIDDEN_OBJECTS) {
    if (lower.includes(obj)) problems.push(`Objeto no permitido en la consulta: ${obj}`);
  }

  // Evita que el KPI dependa de otra base de datos por nombre completo.
  if (/\b[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+\b/i.test(lower)) {
    problems.push('No se permiten referencias a servidores vinculados');
  }

  return [...new Set(problems)];
}

/** Lanza AppError si la consulta no pasa la validacion. */
function assertQueryIsSafe(rawQuery) {
  const problems = validateQuery(rawQuery);
  if (problems.length) {
    throw AppError.badRequest('La consulta del KPI no es valida', problems);
  }
}

function sanitizeInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

/**
 * Ejecuta la consulta contra la conexion de solo lectura.
 * @returns {{rows: Array, columns: Array, rowCount: number, durationMs: number, truncated: boolean}}
 */
async function execute(rawQuery, { maxRows = 1000, timeoutSeconds = 15 } = {}) {
  assertQueryIsSafe(rawQuery);

  // Los limites vienen de la tabla kpis (con CHECK), pero se revalidan
  // porque se interpolan en el batch de SET ROWCOUNT.
  const limit = sanitizeInt(maxRows, 1000, 1, 10000);
  const timeout = sanitizeInt(timeoutSeconds, 15, 1, 120) * 1000;

  const pool = await getReadOnlyPool();
  const request = pool.request();
  request.timeout = timeout;

  const body = String(rawQuery).trim().replace(/;\s*$/, '');
  const batch = [
    'SET NOCOUNT ON;',
    'SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;',
    'SET LOCK_TIMEOUT 5000;',
    `SET ROWCOUNT ${limit};`,
    body,
    'SET ROWCOUNT 0;',
  ].join('\n');

  const startedAt = Date.now();
  let result;
  try {
    result = await request.query(batch);
  } catch (err) {
    if (err.code === 'ETIMEOUT') {
      throw new AppError(
        `La consulta supero el limite de ${timeout / 1000} segundos`, 504, 'KPI_TIMEOUT'
      );
    }
    throw AppError.badRequest(`Error al ejecutar la consulta: ${err.message}`);
  }
  const durationMs = Date.now() - startedAt;

  const rows = result.recordset || [];
  const columns = result.recordset?.columns
    ? Object.entries(result.recordset.columns).map(([name, meta]) => ({
        name,
        type: meta.type?.name || 'unknown',
        numeric: isNumericType(meta.type?.name),
      }))
    : inferColumns(rows);

  return {
    rows,
    columns,
    rowCount: rows.length,
    durationMs,
    truncated: rows.length >= limit,
  };
}

function isNumericType(typeName) {
  return ['Int', 'BigInt', 'SmallInt', 'TinyInt', 'Decimal', 'Numeric',
    'Float', 'Real', 'Money', 'SmallMoney'].includes(typeName);
}

function inferColumns(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((name) => ({
    name,
    type: typeof rows[0][name],
    numeric: typeof rows[0][name] === 'number',
  }));
}

/** Ejecuta sin guardar nada: sirve para el boton "Probar consulta". */
async function preview(rawQuery, options = {}) {
  const result = await execute(rawQuery, { ...options, maxRows: Math.min(options.maxRows || 50, 100) });
  return { ...result, rows: result.rows.slice(0, 50) };
}

module.exports = { validateQuery, assertQueryIsSafe, execute, preview };
