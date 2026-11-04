'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// LDAP configurado y en "produccion": sin fallback al login local.
process.env.LDAP_URL = 'ldaps://dc.invalid:636';
process.env.NODE_ENV = 'production';

const { PASSWORD, createUser, startServer, cleanup } = require('./helpers');
const ldapService = require('../src/services/ldapService');
const AppError = require('../src/utils/AppError');

let server;
let base;
let behaviour;

before(async () => {
  createUser('local_admin', 'SIO_Admin');
  ldapService.authenticate = async () => behaviour();
  ({ server, base } = await startServer());
});

after(() => {
  server.close();
  cleanup();
});

function login(username, password = PASSWORD) {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

test('los grupos de AD se traducen a los roles reales de la base', async () => {
  const { _internal } = require('../src/controllers/authController');
  const { db } = require('./helpers');
  const idOf = (name) => db.querySync('SELECT id FROM roles WHERE name = ?', [name]).recordset[0].id;

  assert.equal(await _internal.getRoleIdFromADGroups(['SIO_Admin']), idOf('SIO_Admin'));
  assert.equal(await _internal.getRoleIdFromADGroups(['sio_analistas']), idOf('SIO_Analistas'));
  assert.equal(await _internal.getRoleIdFromADGroups(['SIO_Auditoria']), idOf('SIO_Auditoria'));
  assert.equal(await _internal.getRoleIdFromADGroups(['SIO_Consulta', 'SIO_Admin']), idOf('SIO_Admin'));
  assert.equal(await _internal.getRoleIdFromADGroups(['Otro']), null);
});

test('login AD crea el usuario con su rol', async () => {
  behaviour = () => ({
    username: 'juan', email: 'juan@lab.local', fullName: 'Juan', groups: ['SIO_Analistas'],
  });
  const res = await login('juan', 'cualquiera');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.user.role, 'SIO_Analistas');
});

test('si AD no responde en produccion NO se usa el login local', async () => {
  behaviour = () => { throw new AppError('caido', 503, 'AD_UNAVAILABLE'); };
  const res = await login('local_admin');
  assert.equal(res.status, 503);
});

test('cuenta bloqueada en AD no cae al login local', async () => {
  behaviour = () => { throw new AppError('bloqueada', 423, 'AD_LOCKED'); };
  const res = await login('local_admin');
  assert.equal(res.status, 423);
});

test('credenciales rechazadas por AD responden 401', async () => {
  behaviour = () => null;
  const res = await login('local_admin');
  assert.equal(res.status, 401);
});

test('los nombres de grupo se comparan sin distinguir mayusculas, espacios ni guiones', () => {
  assert.equal(ldapService.resolveRole(['Domain Users', 'SIO Admin']), 'SIO_Admin');
  assert.equal(ldapService.resolveRole(['sio-analistas']), 'SIO_Analistas');
  assert.equal(ldapService.resolveRole(['SIO_Consulta ']), 'SIO_Consulta');
  assert.equal(ldapService.resolveRole(['SIO_Administradores']), null);
});

test('el cn se extrae del DN de memberOf', () => {
  const { cnFromDn } = ldapService._internal;
  assert.equal(cnFromDn('CN=SIO_Admin,OU=Grupos,DC=lab,DC=local'), 'SIO_Admin');
  assert.equal(cnFromDn('CN=Soporte\\, Nivel 2,OU=Grupos,DC=lab,DC=local'), 'Soporte, Nivel 2');
  assert.equal(cnFromDn('OU=Grupos,DC=lab,DC=local'), null);
});
