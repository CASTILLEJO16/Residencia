'use strict';
const sql = require('mssql');
const config = require('./env');

let pool = null;
let readOnlyPool = null;

function buildConfig(cfg, extra = {}) {
  return {
    server: cfg.server,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: {
      encrypt: cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    ...extra,
  };
}

/** Pool principal de la aplicacion (lectura/escritura sobre el esquema SIO). */
async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(buildConfig(config.db)).connect();
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
  if (readOnlyPool && readOnlyPool.connected) return readOnlyPool;
  readOnlyPool = await new sql.ConnectionPool(
    buildConfig(cfg, { pool: { max: 4, min: 0, idleTimeoutMillis: 30000 } })
  ).connect();
  readOnlyPool.on('error', (err) => console.error('[db-ro] error:', err.message));
  return readOnlyPool;
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text  SQL con parametros nombrados (@nombre)
 * @param {Array<{name:string,type:any,value:any}>} params
 */
async function query(text, params = []) {
  const p = await getPool();
  const request = p.request();
  for (const { name, type, value } of params) {
    request.input(name, type, value === undefined ? null : value);
  }
  return request.query(text);
}

/** Ejecuta varias operaciones dentro de una transaccion. */
async function withTransaction(callback) {
  const p = await getPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* ya revertida */ }
    throw err;
  }
}

async function closeAll() {
  if (pool) await pool.close().catch(() => {});
  if (readOnlyPool) await readOnlyPool.close().catch(() => {});
  pool = null;
  readOnlyPool = null;
}

module.exports = { sql, getPool, getReadOnlyPool, query, withTransaction, closeAll };
