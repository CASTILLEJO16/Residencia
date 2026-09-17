'use strict';
/**
 * Crea el primer administrador de forma interactiva.
 * Genera una contrasena aleatoria si no se indica una.
 *
 *   npm run seed:admin
 */
const readline = require('readline');
const crypto = require('crypto');
const { sql, query, closeAll } = require('../src/config/database');
const password = require('../src/utils/password');

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      const onData = (char) => {
        if (['\n', '\r', '\u0004'].includes(char.toString())) {
          process.stdin.removeListener('data', onData);
        } else {
          process.stdout.write('\x1B[2K\x1B[200D' + question + '*'.repeat(rl.line.length));
        }
      };
      process.stdin.on('data', onData);
    }
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  return Array.from(crypto.randomFillSync(new Uint32Array(16)))
    .map((n) => chars[n % chars.length]).join('');
}

async function main() {
  console.log('\n=== SIO: creacion del administrador inicial ===\n');

  const roleResult = await query(
    `SELECT id FROM dbo.roles WHERE name = 'SIO_Admin'`
  );
  if (!roleResult.recordset.length) {
    throw new Error('El rol SIO_Admin no existe. Ejecute primero 03_seed.sql');
  }
  const roleId = roleResult.recordset[0].id;

  const existing = await query(
    `SELECT COUNT(*) AS total FROM dbo.users WHERE role_id = @roleId`,
    [{ name: 'roleId', type: sql.Int, value: roleId }]
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
    `SELECT TOP 1 id FROM dbo.users WHERE username = @u OR email = @e`,
    [
      { name: 'u', type: sql.NVarChar(50), value: username },
      { name: 'e', type: sql.NVarChar(150), value: email },
    ]
  );
  if (duplicate.recordset.length) {
    console.error('Ya existe un usuario con ese nombre o correo.');
    process.exitCode = 1;
    return;
  }

  const hash = await password.hash(plain);
  const inserted = await query(
    `INSERT INTO dbo.users (username, email, full_name, password_hash, role_id, must_change_password)
     OUTPUT INSERTED.id
     VALUES (@u, @e, @n, @h, @r, 1)`,
    [
      { name: 'u', type: sql.NVarChar(50), value: username },
      { name: 'e', type: sql.NVarChar(150), value: email },
      { name: 'n', type: sql.NVarChar(150), value: fullName },
      { name: 'h', type: sql.NVarChar(255), value: hash },
      { name: 'r', type: sql.Int, value: roleId },
    ]
  );

  await query(
    `INSERT INTO dbo.audit_logs (user_id, username, action, entity_type, entity_id, new_values)
     VALUES (@id, @u, 'user.create', 'user', @id2, @vals)`,
    [
      { name: 'id', type: sql.Int, value: inserted.recordset[0].id },
      { name: 'u', type: sql.NVarChar(50), value: username },
      { name: 'id2', type: sql.NVarChar(50), value: String(inserted.recordset[0].id) },
      { name: 'vals', type: sql.NVarChar(sql.MAX), value: JSON.stringify({ via: 'seed:admin', role: 'SIO_Admin' }) },
    ]
  );

  console.log(`\nAdministrador creado (id ${inserted.recordset[0].id}).`);
  if (generated) console.log(`Contrasena temporal: ${plain}`);
  console.log('Debera cambiarla en el primer inicio de sesion.\n');
}

main()
  .catch((err) => { console.error('\nError:', err.message); process.exitCode = 1; })
  .finally(() => closeAll());
