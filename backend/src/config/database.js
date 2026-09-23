'use strict';
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('./env');

let db = null;
let SQL = null;

async function initDb() {
  if (db) return db;
  
  SQL = await initSqlJs();
  const dbPath = config.db.path || path.join(__dirname, '../../data/sio.db');
  
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    // Crear directorio si no existe
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  db.run('PRAGMA foreign_keys = ON');
  console.log(`[db] SQLite conectado: ${dbPath}`);
  return db;
}

function getDb() {
  return db;
}

function saveDb() {
  if (!db) return;
  const dbPath = config.db.path || path.join(__dirname, '../../data/sio.db');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function getLastInsertId() {
  if (!db) return null;
  const result = db.exec('SELECT last_insert_rowid() AS id');
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0][0];
  }
  return null;
}

/**
 * Ejecuta una consulta parametrizada.
 * @param {string} text  SQL con parametros posicionales (?, ?, ...)
 * @param {Array<any>} params  Array de valores para los parametros
 */
async function query(text, params = []) {
  const database = await initDb();
  const stmt = database.prepare(text);
  // sql.js no sabe bindear Date, se normaliza a string SQLite YYYY-MM-DD HH:MM:SS
  const normalized = params.map((v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
    return v;
  });
  stmt.bind(normalized);
  const result = [];
  while (stmt.step()) {
    result.push(stmt.getAsObject());
  }
  stmt.free();
  
  // Guardar si fue una operación de escritura (INSERT, UPDATE, DELETE)
  const upperText = text.trim().toUpperCase();
  if (upperText.startsWith('INSERT') || upperText.startsWith('UPDATE') || upperText.startsWith('DELETE')) {
    saveDb();
  }
  
  return {
    recordset: result,
    rowsAffected: database.getRowsModified(),
    output: {},
  };
}

/** Ejecuta varias operaciones dentro de una transaccion. */
async function withTransaction(callback) {
  const database = await initDb();
  database.run('BEGIN');
  try {
    const result = await callback(database);
    database.run('COMMIT');
    saveDb();
    return result;
  } catch (err) {
    database.run('ROLLBACK');
    throw err;
  }
}

async function closeAll() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

module.exports = { initDb, getDb, query, withTransaction, closeAll, getLastInsertId };
