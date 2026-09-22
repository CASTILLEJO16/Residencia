'use strict';
const { Pool: PgPool } = require('pg');
const config = require('./env');

let pool = null;
let readOnlyPool = null;

function buildConfig(cfg) {
  return {
    host: cfg.server,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  };
}

/** Pool principal de la aplicacion (lectura/escritura sobre el esquema SIO). */
async function getPool() {
  if (pool) return pool;
  pool = new PgPool(buildConfig(config.db));
  pool.on('error', (err) => console.error('[db] error en el pool:', err.message));
  return pool;
}

/**
 * Pool de SOLO LECTURA, exclusivo para el ejecutor de KPIs (Fase 2).
 * Usa credenciales distintas y con permisos minimos.
 */
async function getReadOnlyPool() {
  const cfg = config.dbReadOnly;
  if (!cfg.server || !cfg.user) {
    throw new Error('La conexion de solo lectura (DB_RO_*) no esta configurada');
  }
  if (readOnlyPool) return readOnlyPool;
  readOnlyPool = new PgPool({
    ...buildConfig(cfg),
    max: 4,
    min: 0,
  });
  readOnlyPool.on('error', (err) => console.error('[db-ro] error:', err.message));
  return readOnlyPool;
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text  SQL con parametros posicionales ($1, $2, ...)
 * @param {Array<any>} params  Array de valores para los parametros
 */
async function query(text, params = []) {
  const p = await getPool();
  const result = await p.query(text, params);
  return {
    recordset: result.rows,
    rowsAffected: result.rowCount,
    output: {},
  };
}

/** Ejecuta varias operaciones dentro de una transaccion. */
async function withTransaction(callback) {
  const p = await getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ya revertida */ }
    throw err;
  } finally {
    client.release();
  }
}

async function closeAll() {
  if (pool) await pool.end().catch(() => {});
  if (readOnlyPool) await readOnlyPool.end().catch(() => {});
  pool = null;
  readOnlyPool = null;
}

module.exports = { pg: require('pg'), getPool, getReadOnlyPool, query, withTransaction, closeAll };
