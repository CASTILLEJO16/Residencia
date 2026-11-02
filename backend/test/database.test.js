'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, createUser, cleanup } = require('./helpers');

after(cleanup);

test('foreign_keys sigue activo despues de escribir', async () => {
  createUser('fk_user', 'SIO_Consulta');
  const { recordset } = await db.query('PRAGMA foreign_keys');
  assert.equal(recordset[0].foreign_keys, 1);

  await assert.rejects(
    db.query('INSERT INTO users (username, email, full_name, password_hash, role_id) VALUES (?, ?, ?, ?, ?)',
      ['x', 'x@x', 'x', 'h', 9999]),
    (err) => err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
  );
});

test('los booleanos y fechas se guardan y las fechas salen en ISO UTC', async () => {
  const id = createUser('date_user', 'SIO_Consulta');
  await db.query('UPDATE users SET is_active = ?, locked_until = ? WHERE id = ?',
    [false, new Date('2030-01-02T03:04:05.000Z'), id]);
  const { recordset } = await db.query('SELECT is_active, locked_until FROM users WHERE id = ?', [id]);
  assert.equal(recordset[0].is_active, 0);
  assert.equal(recordset[0].locked_until, '2030-01-02T03:04:05Z');
  assert.equal(new Date(recordset[0].locked_until).toISOString(), '2030-01-02T03:04:05.000Z');
});

test('INSERT devuelve su propio lastInsertId', async () => {
  const r = await db.query(
    "INSERT INTO system_config (key_name, value) VALUES ('t.key', '1')"
  );
  const row = (await db.query('SELECT id FROM system_config WHERE key_name = ?', ['t.key'])).recordset[0];
  assert.equal(r.lastInsertId, row.id);
});

test('withTransaction hace rollback si falla', () => {
  assert.throws(() => db.withTransaction(() => {
    db.querySync("INSERT INTO system_config (key_name, value) VALUES ('tx.key', '1')");
    throw new Error('falla');
  }), /falla/);
  const { recordset } = db.querySync("SELECT COUNT(*) AS c FROM system_config WHERE key_name = 'tx.key'");
  assert.equal(recordset[0].c, 0);
});

test('los tickets reciben numero automatico y updated_at se actualiza', async () => {
  const uid = createUser('tk_user', 'SIO_Analistas');
  const r = await db.query(
    "INSERT INTO tickets (title, priority, created_by, updated_at) VALUES ('t', 'low', ?, '2000-01-01 00:00:00')",
    [uid]
  );
  let t = (await db.query('SELECT ticket_number, updated_at FROM tickets WHERE id = ?', [r.lastInsertId])).recordset[0];
  assert.equal(t.ticket_number, `TCK-${String(r.lastInsertId).padStart(6, '0')}`);

  await db.query("UPDATE tickets SET status = 'closed' WHERE id = ?", [r.lastInsertId]);
  t = (await db.query('SELECT updated_at FROM tickets WHERE id = ?', [r.lastInsertId])).recordset[0];
  assert.notEqual(t.updated_at, '2000-01-01T00:00:00Z');
});
