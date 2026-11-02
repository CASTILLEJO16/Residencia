'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, PASSWORD, createUser, startServer, cleanup } = require('./helpers');

let server;
let base;

before(async () => {
  createUser('admin_t', 'SIO_Admin');
  createUser('auditor_t', 'SIO_Auditoria');
  ({ server, base } = await startServer());
});

after(() => {
  server.close();
  cleanup();
});

function cookieFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/sio_rt=([^;]*)/);
  return match ? match[1] : null;
}

async function login(username) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return { res, body: await res.json(), cookie: cookieFrom(res) };
}

function refresh(cookie) {
  return fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: cookie ? { Cookie: `sio_rt=${cookie}` } : {},
  });
}

test('login entrega el refresh token solo en cookie httpOnly', async () => {
  const { res, body, cookie } = await login('admin_t');
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
  assert.equal(body.data.refreshToken, undefined);
  assert.match(cookie, /^[a-f0-9]{96}$/);
  const header = res.headers.get('set-cookie');
  assert.match(header, /HttpOnly/i);
  assert.match(header, /SameSite=Strict/i);
  assert.match(header, /Path=\/api\/auth/);
});

test('refresh rota el token y enlaza replaced_by con el id del nuevo', async () => {
  const { cookie } = await login('admin_t');
  const res = await refresh(cookie);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.data.accessToken);
  const next = cookieFrom(res);
  assert.ok(next && next !== cookie);

  const { hashToken } = require('../src/config/jwt');
  const old = db.querySync('SELECT revoked_at, replaced_by FROM refresh_tokens WHERE token = ?', [hashToken(cookie)]).recordset[0];
  const neu = db.querySync('SELECT id FROM refresh_tokens WHERE token = ?', [hashToken(next)]).recordset[0];
  assert.ok(old.revoked_at);
  assert.equal(old.replaced_by, neu.id);

  // Reusar el token viejo enseguida se rechaza (sin cerrar las demas sesiones).
  assert.equal((await refresh(cookie)).status, 401);
  assert.equal((await refresh(next)).status, 200);
});

test('reusar un token revocado hace tiempo cierra todas las sesiones', async () => {
  const { cookie } = await login('admin_t');
  const { hashToken } = require('../src/config/jwt');
  const second = await refresh(cookie);
  const live = cookieFrom(second);
  db.querySync("UPDATE refresh_tokens SET revoked_at = datetime('now', '-5 minutes') WHERE token = ?", [hashToken(cookie)]);

  assert.equal((await refresh(cookie)).status, 401);
  assert.equal((await refresh(live)).status, 401, 'la sesion vigente tambien se revoca');
});

test('refresh sin cookie responde 401', async () => {
  assert.equal((await refresh(null)).status, 401);
});

test('logout revoca el token y borra la cookie', async () => {
  const { cookie } = await login('admin_t');
  const res = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: `sio_rt=${cookie}` },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /sio_rt=;/);
  assert.equal((await refresh(cookie)).status, 401);
});

test('la auditoria pagina correctamente (LIMIT/OFFSET en orden)', async () => {
  const { body } = await login('auditor_t');
  const res = await fetch(`${base}/api/audit?page=1&limit=5`, {
    headers: { Authorization: `Bearer ${body.data.accessToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.data.length > 0, 'la primera pagina no debe venir vacia');
  assert.ok(data.data.length <= 5);
});

test('el bloqueo por intentos fallidos usa la hora UTC correctamente', async () => {
  createUser('lock_t', 'SIO_Consulta');
  for (let i = 0; i < 5; i++) {
    await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'lock_t', password: 'Incorrecta123!' }),
    });
  }
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'lock_t', password: PASSWORD }),
  });
  assert.equal(res.status, 423);
  const body = await res.json();
  const minutes = Number(body.error.message.match(/(\d+) minuto/)[1]);
  assert.ok(minutes >= 1 && minutes <= 15, `bloqueo de ${minutes} min`);
});
