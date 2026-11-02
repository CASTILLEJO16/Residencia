'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, createUser, cleanup } = require('./helpers');
const sqlExecutor = require('../src/utils/sqlExecutor');

after(cleanup);

test('acepta consultas con su propio LIMIT', async () => {
  const uid = createUser('kpi_user', 'SIO_Analistas');
  for (let i = 0; i < 5; i++) {
    await db.query("INSERT INTO tickets (title, priority, created_by) VALUES (?, 'low', ?)", [`t${i}`, uid]);
  }
  const r = await sqlExecutor.execute('SELECT id, title FROM tickets ORDER BY id LIMIT 3');
  assert.equal(r.rowCount, 3);
  assert.equal(r.truncated, false);
});

test('marca truncated cuando se supera maxRows', async () => {
  const r = await sqlExecutor.execute('SELECT id FROM tickets', { maxRows: 2 });
  assert.equal(r.rowCount, 2);
  assert.equal(r.truncated, true);
});

test('las fechas del resultado salen en ISO UTC', async () => {
  const r = await sqlExecutor.execute("SELECT datetime('2030-01-01 10:00:00') AS d");
  assert.equal(r.rows[0].d, '2030-01-01T10:00:00Z');
});

test('rechaza objetos internos y palabras prohibidas', () => {
  assert.ok(sqlExecutor.validateQuery('SELECT * FROM users').length > 0);
  assert.ok(sqlExecutor.validateQuery('SELECT * FROM sqlite_master').length > 0);
  assert.ok(sqlExecutor.validateQuery('SELECT 1; DELETE FROM tickets').length > 0);
  assert.deepEqual(sqlExecutor.validateQuery("SELECT replace(title, 'a', 'b') FROM tickets"), []);
});

test('el proceso del KPI abre la base en solo lectura', async () => {
  // Se salta la validacion de texto y se ejecuta directo en el proceso:
  // SQLite debe rechazar la escritura por si mismo.
  const { fork } = require('child_process');
  const path = require('path');
  const child = fork(path.join(__dirname, '../src/utils/kpiRunner.js'), [], { serialization: 'advanced' });
  const msg = await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.send({
      dbFile: db.dbPath(),
      sql: "INSERT INTO system_config (key_name) VALUES ('hack') RETURNING id",
      limit: 10,
    });
  });
  assert.equal(msg.ok, false);
  assert.match(msg.message, /readonly|read-only|query_only/i);
  const { recordset } = await db.query("SELECT COUNT(*) AS c FROM system_config WHERE key_name = 'hack'");
  assert.equal(recordset[0].c, 0);
});

test('una consulta que no termina se corta por tiempo', async () => {
  const sql = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT max(x) FROM c';
  await assert.rejects(
    sqlExecutor.execute(sql, { timeoutSeconds: 1 }),
    (err) => err.statusCode === 504 && err.code === 'KPI_TIMEOUT'
  );
});
