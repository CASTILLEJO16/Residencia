'use strict';
/**
 * Entorno aislado para los tests: base SQLite temporal y variables minimas.
 * Debe requerirse ANTES que cualquier modulo de src/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sio-test-'));
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.JWT_SECRET = 'x'.repeat(64);
process.env.BCRYPT_ROUNDS = '4';
process.env.MONITOR_ENABLED = 'false';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.LDAP_URL = process.env.LDAP_URL || '';

const bcrypt = require('bcryptjs');
const db = require('../src/config/database');

db.applySchema(db.initDb());

const PASSWORD = 'Password123!';
const hash = bcrypt.hashSync(PASSWORD, 4);

function createUser(username, roleName, { mustChange = 0 } = {}) {
  const role = db.querySync('SELECT id FROM roles WHERE name = ?', [roleName]).recordset[0];
  const r = db.querySync(
    `INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, `${username}@test.local`, username, hash, role.id, mustChange]
  );
  return r.lastInsertId;
}

async function startServer() {
  const app = require('../src/app');
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

function cleanup() {
  db.closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { db, PASSWORD, createUser, startServer, cleanup };
