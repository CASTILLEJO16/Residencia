'use strict';
const path = require('path');
const { fork } = require('child_process');
const { dbPath, normalizeRow } = require('../config/database');
const AppError = require('./AppError');

/**
 * Ejecutor de las consultas de los KPIs.
 *
 * IMPORTANTE: la validacion de texto que hay aqui es una segunda linea de
 * defensa, no la principal. Cualquier lista negra de palabras se puede
 * burlar. El control real es que la consulta corre en un proceso aparte con
 * una conexion SQLite de SOLO LECTURA (ver kpiRunner.js).
 */

// Palabras que no tienen ningun motivo para aparecer en la consulta de un KPI.
const FORBIDDEN = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'alter', 'create',
  'grant', 'revoke', 'deny', 'exec', 'execute', 'sp_executesql', 'backup',
  'restore', 'vacuum', 'reindex', 'analyze', 'shutdown', 'reconfigure', 'kill', 'dbcc', 'waitfor', 'openrowset',
  'openquery', 'opendatasource', 'openxml', 'bulk', 'sysadmin', 'xp_cmdshell',
];

// Objetos internos del SIO: un KPI nunca debe leerlos.
const FORBIDDEN_OBJECTS = [
  'users', 'roles', 'refresh_tokens', 'password_resets', 'audit_logs',
  'system_config', 'sqlite_master', 'sqlite_schema', 'sqlite_temp_master',
  'pragma', 'attach', 'sys.', 'sysobjects', 'syscolumns', 'information_schema',
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

/** Corre la consulta en un proceso hijo de solo lectura, con tiempo limite. */
function runIsolated(sql, limit, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'kpiRunner.js'), [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'advanced',
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGKILL');
      fn(value);
    };
    const timer = setTimeout(() => {
      const err = new Error('timeout');
      err.code = 'ETIMEOUT';
      finish(reject, err);
    }, timeoutMs);

    child.once('message', (msg) => {
      if (msg.ok) finish(resolve, msg);
      else finish(reject, new Error(msg.message));
    });
    child.once('error', (err) => finish(reject, err));
    child.once('exit', (code) => {
      finish(reject, new Error(`El ejecutor termino inesperadamente (${code}) ${stderr.trim()}`));
    });

    child.send({ dbFile: dbPath(), sql, limit });
  });
}

/**
 * Ejecuta la consulta contra SQLite en una conexion de solo lectura.
 * @returns {{rows: Array, columns: Array, rowCount: number, durationMs: number, truncated: boolean}}
 */
async function execute(rawQuery, { maxRows = 1000, timeoutSeconds = 15 } = {}) {
  assertQueryIsSafe(rawQuery);

  const limit = sanitizeInt(maxRows, 1000, 1, 10000);
  const timeoutMs = sanitizeInt(timeoutSeconds, 15, 1, 300) * 1000;
  const body = String(rawQuery).trim().replace(/;\s*$/, '');

  const startedAt = Date.now();
  let result;
  try {
    // Se pide una fila de mas para saber si el resultado quedo truncado.
    result = await runIsolated(body, limit + 1, timeoutMs);
  } catch (err) {
    if (err.code === 'ETIMEOUT') {
      throw new AppError(
        `La consulta supero el limite de ${timeoutMs / 1000} segundos`, 504, 'KPI_TIMEOUT'
      );
    }
    throw AppError.badRequest(`Error al ejecutar la consulta: ${err.message}`);
  }
  const durationMs = Date.now() - startedAt;

  const truncated = result.rows.length > limit;
  const rows = result.rows.slice(0, limit).map(normalizeRow);
  const columns = inferColumns(rows, result.columns);

  return {
    rows,
    columns,
    rowCount: rows.length,
    durationMs,
    truncated,
  };
}

function inferColumns(rows, declared = []) {
  const names = declared.length ? declared.map((c) => c.name) : Object.keys(rows[0] || {});
  return names.map((name) => {
    const sample = rows.find((r) => r[name] !== null && r[name] !== undefined)?.[name];
    return {
      name,
      type: sample === undefined ? 'unknown' : typeof sample,
      numeric: typeof sample === 'number',
    };
  });
}

/** Ejecuta sin guardar nada: sirve para el boton "Probar consulta". */
async function preview(rawQuery, options = {}) {
  const result = await execute(rawQuery, { ...options, maxRows: Math.min(options.maxRows || 50, 100) });
  return { ...result, rows: result.rows.slice(0, 50) };
}

module.exports = { validateQuery, assertQueryIsSafe, execute, preview };
