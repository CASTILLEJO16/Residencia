'use strict';
/**
 * Crea (o actualiza) la base SQLite aplicando el esquema.
 *
 *   node scripts/init-sqlite.js          aplica el esquema sobre la base existente
 *   node scripts/init-sqlite.js --reset  BORRA la base y la crea desde cero
 */
require('dotenv').config();
const fs = require('fs');
const { dbPath, initDb, applySchema, closeAll } = require('../src/config/database');

const file = dbPath();
const reset = process.argv.includes('--reset');

if (reset && file !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(file + suffix)) fs.unlinkSync(file + suffix);
  }
  console.log(`[init] Base eliminada: ${file}`);
}

applySchema(initDb());
closeAll();
console.log('[init] Esquema aplicado correctamente');
