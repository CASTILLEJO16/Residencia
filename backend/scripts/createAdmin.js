'use strict';
/**
 * Crea el primer administrador de forma interactiva.
 * Genera una contrasena aleatoria si no se indica una.
 *
 *   npm run seed:admin
 */
const readline = require('readline');
const crypto = require('crypto');
require('dotenv').config();
const { initDb, applySchema, query, closeAll } = require('../src/config/database');
const password = require('../src/utils/password');

// Una sola interfaz para todo el script: crear una por pregunta pierde la
// entrada ya leida cuando stdin no es una terminal (p. ej. con una tuberia).
let rl = null;
function getReadline() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl;
}

function ask(question, { hidden = false } = {}) {
  const iface = getReadline();
  return new Promise((resolve) => {
    let onData = null;
    if (hidden && process.stdin.isTTY) {
      onData = (char) => {
        if (['\n', '\r', '\u0004'].includes(char.toString())) {
          process.stdin.removeListener('data', onData);
        } else {
          process.stdout.write('\x1B[2K\x1B[200D' + question + '*'.repeat(iface.line.length));
        }
      };
      process.stdin.on('data', onData);
    }
    iface.question(question, (answer) => {
      if (onData) process.stdin.removeListener('data', onData);
      resolve(answer.trim());
    });
  });
}

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  return Array.from(crypto.randomFillSync(new Uint32Array(16)))
    .map((n) => chars[n % chars.length]).join('');
}

async function main() {
  console.log('\n=== SIO: creacion del administrador inicial ===\n');
  applySchema(initDb());

  const roleResult = await query(`SELECT id FROM roles WHERE name = 'SIO_Admin'`);
  if (!roleResult.recordset.length) {
    throw new Error('El rol SIO_Admin no existe. Ejecute primero: node scripts/init-sqlite.js');
  }
  const roleId = roleResult.recordset[0].id;

  const existing = await query(
    'SELECT COUNT(*) AS total FROM users WHERE role_id = ?',
    [roleId]
  );
  if (existing.recordset[0].total > 0) {
    const answer = await ask('Ya existe al menos un administrador. Crear otro? (s/N): ');
    if (answer.toLowerCase() !== 's') { console.log('Cancelado.'); return; }
  }

  const username = await ask('Usuario: ');
  const email = (await ask('Correo: ')).toLowerCase();
  const fullName = await ask('Nombre completo: ');
  let plain = await ask('Contrasena (vacio = generar): ', { hidden: true });
  console.log('');

  let generated = false;
  if (!plain) { plain = randomPassword(); generated = true; }

  const errors = password.validateStrength(plain);
  if (errors.length) {
    console.error('Contrasena invalida:\n  - ' + errors.join('\n  - '));
    process.exitCode = 1;
    return;
  }

  const duplicate = await query(
    'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
    [username, email]
  );
  if (duplicate.recordset.length) {
    console.error('Ya existe un usuario con ese nombre o correo.');
    process.exitCode = 1;
    return;
  }

  const hash = await password.hash(plain);
  const inserted = await query(
    `INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [username, email, fullName, hash, roleId]
  );
  const id = inserted.lastInsertId;

  await query(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values)
     VALUES (?, ?, 'user.create', 'user', ?, ?)`,
    [id, username, String(id), JSON.stringify({ via: 'seed:admin', role: 'SIO_Admin' })]
  );

  console.log(`\nAdministrador creado (id ${id}).`);
  if (generated) console.log(`Contrasena temporal: ${plain}`);
  console.log('Debera cambiarla en el primer inicio de sesion.\n');
}

main()
  .catch((err) => { console.error('\nError:', err.message); process.exitCode = 1; })
  .finally(() => { if (rl) rl.close(); closeAll(); });
