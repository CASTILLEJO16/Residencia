'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('./env');

/**
 * Acceso a SQLite con better-sqlite3.
 *
 * - Escribe directamente al archivo (sin reescribir la base completa en cada
 *   cambio, como hacia sql.js), con journal WAL: un corte no corrompe el archivo.
 * - foreign_keys queda activo durante toda la vida de la conexion.
 * - withTransaction usa transacciones reales de SQLite.
 *
 * Las fechas se guardan en UTC con el formato nativo de SQLite
 * ("YYYY-MM-DD HH:MM:SS") y se devuelven a la aplicacion en ISO 8601 con
 * "Z", para que JavaScript no las interprete como hora local.
 */

const DEFAULT_PATH = path.join(__dirname, '../../data/sio.db');

let db = null;

function dbPath() {
  return config.db.path ? path.resolve(config.db.path) : DEFAULT_PATH;
}

function initDb() {
  if (db) return db;
  const file = dbPath();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  console.log(`[db] SQLite conectado: ${file}`);
  return db;
}

const SCHEMA_FILE = path.join(__dirname, '../../scripts/create-schema-sqlite.sql');

/**
 * Aplica el esquema (idempotente: CREATE ... IF NOT EXISTS). Asi una base
 * existente recibe las tablas, indices y triggers que le falten.
 */
function applySchema(database = initDb()) {
  database.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

  // Hasta ahora las claves foraneas no se aplicaban; se avisa si hay datos huerfanos.
  const violations = database.pragma('foreign_key_check');
  if (violations.length) {
    const tables = [...new Set(violations.map((v) => v.table))].join(', ');
    console.warn(`[db] ${violations.length} registro(s) violan claves foraneas en: ${tables}. ` +
      'Revise con: PRAGMA foreign_key_check');
  }
}

function getDb() {
  return initDb();
}

const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function toSqliteDate(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Convierte los parametros a tipos que SQLite sabe guardar. */
function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toSqliteDate(value);
  if (typeof value === 'string' && ISO_DATETIME.test(value)) return toSqliteDate(new Date(value));
  return value;
}

/** Las fechas de SQLite (UTC sin zona) salen como ISO 8601 con Z. */
function normalizeRow(row) {
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'string' && SQLITE_DATETIME.test(value)) {
      row[key] = `${value.replace(' ', 'T')}Z`;
    }
  }
  return row;
}

let lastInsertId = null;

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text  SQL con parametros posicionales (?, ?, ...)
 * @param {Array<any>} params  valores para los parametros
 */
async function query(text, params = []) {
  return querySync(text, params);
}

function querySync(text, params = []) {
  const database = initDb();
  const stmt = database.prepare(text);
  const bound = params.map(normalizeParam);

  if (stmt.reader) {
    const rows = stmt.all(...bound).map(normalizeRow);
    return { recordset: rows, rowsAffected: 0, output: {} };
  }

  const info = stmt.run(...bound);
  if (info.changes > 0 && /^\s*insert/i.test(text)) {
    lastInsertId = Number(info.lastInsertRowid);
  }
  return {
    recordset: [],
    rowsAffected: info.changes,
    lastInsertId: Number(info.lastInsertRowid),
    output: {},
  };
}

function getLastInsertId() {
  return lastInsertId;
}

/**
 * Ejecuta varias operaciones dentro de una transaccion real.
 *
 * El callback debe ser SINCRONO (usar querySync o la conexion que recibe):
 * con una sola conexion compartida, un await dentro de la transaccion
 * permitiria que otra peticion colara sus escrituras en ella.
 */
function withTransaction(callback) {
  const database = initDb();
  return database.transaction(() => {
    const result = callback(database);
    if (result && typeof result.then === 'function') {
      throw new Error('withTransaction requiere un callback sincrono');
    }
    return result;
  }).immediate();
}

async function closeAll() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDb, applySchema, getDb, query, querySync, withTransaction, closeAll, getLastInsertId, dbPath,
  normalizeRow,
};
