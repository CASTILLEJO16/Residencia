'use strict';
const fs = require('fs');
const { Client, escapeFilter, InvalidCredentialsError } = require('ldapts');
const config = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Autenticacion contra Active Directory.
 *
 * Flujo del inicio de sesion:
 *   1. Se hace bind con las credenciales que escribio la persona
 *      (usuario@dominio). Si AD las acepta, la contrasena es correcta.
 *   2. Con esa misma conexion se lee su ficha y los grupos a los que
 *      pertenece, incluidos los anidados (un grupo dentro de otro).
 *   3. El grupo decide el rol del SIO.
 *
 * El SIO nunca guarda ni compara la contrasena de dominio: solo la reenvia
 * al controlador de dominio por LDAPS y descarta el resultado.
 */

// OID de LDAP_MATCHING_RULE_IN_CHAIN: resuelve la membresia anidada en el
// propio controlador de dominio, en una sola consulta.
const IN_CHAIN = '1.2.840.113556.1.4.1941';

// userAccountControl: bit 2 = cuenta deshabilitada.
const UAC_DISABLED = 0x0002;

// Orden de prioridad cuando alguien esta en varios grupos del SIO.
const ROLE_PRIORITY = ['SIO_Admin', 'SIO_Analistas', 'SIO_Auditoria', 'SIO_Consulta'];

/**
 * AD responde "invalid credentials" para casi todo y pone el motivo real en
 * un codigo hexadecimal dentro del mensaje: "... AcceptSecurityContext error, data 52e".
 */
const AD_REASONS = {
  '525': { code: 'AD_USER_NOT_FOUND', status: 401, message: null },
  '52e': { code: 'AD_BAD_PASSWORD', status: 401, message: null },
  '530': { code: 'AD_LOGON_HOURS', status: 403, message: 'Tu cuenta no puede iniciar sesión en este horario' },
  '531': { code: 'AD_WORKSTATION', status: 403, message: 'Tu cuenta no puede iniciar sesión desde este equipo' },
  '532': { code: 'AD_PASSWORD_EXPIRED', status: 403, message: 'Tu contraseña de dominio expiró. Cámbiala en Windows (Ctrl+Alt+Supr) y vuelve a intentarlo' },
  '533': { code: 'AD_DISABLED', status: 403, message: 'Tu cuenta de dominio está deshabilitada' },
  '701': { code: 'AD_ACCOUNT_EXPIRED', status: 403, message: 'Tu cuenta de dominio expiró' },
  '773': { code: 'AD_MUST_CHANGE', status: 403, message: 'Debes cambiar tu contraseña de dominio antes de entrar. Hazlo en Windows (Ctrl+Alt+Supr)' },
  '775': { code: 'AD_LOCKED', status: 423, message: 'Tu cuenta de dominio está bloqueada por intentos fallidos' },
};

const GENERIC_BAD_LOGIN = 'Usuario o contraseña incorrectos';

/** Error de directorio con el motivo tecnico aparte, para la auditoria. */
class DirectoryError extends AppError {
  constructor(message, statusCode, code, reason) {
    super(message, statusCode, code);
    this.reason = reason;
  }
}

let caCache;
function tlsOptions() {
  if (!config.ldap.url.startsWith('ldaps://')) return undefined;
  if (caCache === undefined) {
    caCache = config.ldap.caCertFile ? fs.readFileSync(config.ldap.caCertFile) : null;
  }
  return {
    minVersion: 'TLSv1.2',
    ...(caCache ? { ca: [caCache] } : {}),
  };
}

function createClient() {
  return new Client({
    url: config.ldap.url,
    timeout: config.ldap.timeoutMs,
    connectTimeout: config.ldap.timeoutMs,
    tlsOptions: tlsOptions(),
  });
}

/**
 * Acepta las tres formas en que la gente escribe su usuario de dominio:
 *   juan   |   LAB\juan   |   juan@lab.local
 * y devuelve solo el sAMAccountName.
 */
function normalizeUsername(input) {
  let value = String(input || '').trim();
  if (value.includes('\\')) value = value.split('\\').pop();
  if (value.includes('@')) {
    const [name, suffix] = value.split('@');
    if (suffix && suffix.toLowerCase() !== config.ldap.domain) {
      throw new DirectoryError('Ese dominio no está permitido', 401, 'AD_WRONG_DOMAIN', 'dominio_distinto');
    }
    value = name;
  }
  // sAMAccountName: hasta 20 caracteres. Se limita a un juego seguro.
  if (!/^[A-Za-z0-9._-]{1,20}$/.test(value)) {
    throw new DirectoryError(GENERIC_BAD_LOGIN, 401, 'AD_BAD_USERNAME', 'formato_invalido');
  }
  return value;
}

function translateBindError(err) {
  if (err instanceof InvalidCredentialsError || err?.code === 49) {
    const match = /data ([0-9a-f]{3,4})/i.exec(err.message || '');
    const reason = AD_REASONS[match?.[1]?.toLowerCase()];
    if (reason) {
      return new DirectoryError(reason.message || GENERIC_BAD_LOGIN, reason.status, reason.code, match[1]);
    }
    return new DirectoryError(GENERIC_BAD_LOGIN, 401, 'AD_BAD_CREDENTIALS', 'invalid_credentials');
  }
  return connectionError(err);
}

function connectionError(err) {
  const tls = /certificate|self[- ]signed|unable to verify|altnames/i.test(err?.message || '');
  console.error('[ldap] error de conexion:', err?.message);
  return new DirectoryError(
    tls
      ? 'El servidor no confía en el certificado del controlador de dominio. Revisa LDAP_CA_CERT'
      : 'No se pudo contactar al controlador de dominio. Intenta de nuevo en unos minutos',
    503,
    tls ? 'AD_TLS' : 'AD_UNAVAILABLE',
    err?.code || err?.message
  );
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function guidToString(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== 16) return null;
  // objectGUID viene en el orden mixto de Microsoft; se deja en el formato
  // que muestra "Usuarios y equipos de Active Directory".
  const b = buffer;
  const hex = (i) => b[i].toString(16).padStart(2, '0');
  return [
    hex(3) + hex(2) + hex(1) + hex(0),
    hex(5) + hex(4),
    hex(7) + hex(6),
    hex(8) + hex(9),
    [10, 11, 12, 13, 14, 15].map(hex).join(''),
  ].join('-');
}

/** Lee la ficha del usuario y sus grupos con una conexion ya autenticada. */
async function readProfile(client, sam) {
  const { searchEntries } = await client.search(config.ldap.baseDN, {
    scope: 'sub',
    filter: escapeFilter`(&(objectCategory=person)(objectClass=user)(sAMAccountName=${sam}))`,
    attributes: [
      'sAMAccountName', 'displayName', 'givenName', 'sn', 'mail',
      'userPrincipalName', 'userAccountControl', 'distinguishedName', 'objectGUID',
    ],
    explicitBufferAttributes: ['objectGUID'],
    sizeLimit: 2,
  });

  if (searchEntries.length !== 1) return null;
  const entry = searchEntries[0];
  const dn = entry.dn;

  const groups = await client.search(config.ldap.baseDN, {
    scope: 'sub',
    filter: `(&(objectClass=group)(member:${IN_CHAIN}:=${escapeFilter`${dn}`}))`,
    attributes: ['cn', 'sAMAccountName'],
    sizeLimit: 500,
  });

  const username = first(entry.sAMAccountName) || sam;
  const upn = first(entry.userPrincipalName) || `${username}@${config.ldap.domain}`;
  const fullName = first(entry.displayName)
    || [first(entry.givenName), first(entry.sn)].filter(Boolean).join(' ')
    || username;
  const uac = Number(first(entry.userAccountControl)) || 0;

  return {
    username,
    upn,
    email: (first(entry.mail) || upn).toLowerCase(),
    fullName,
    dn,
    externalId: guidToString(first(entry.objectGUID)),
    disabled: (uac & UAC_DISABLED) !== 0,
    groups: groups.searchEntries.map((g) => first(g.sAMAccountName) || first(g.cn)).filter(Boolean),
  };
}

/**
 * Valida usuario y contrasena contra AD y devuelve su perfil con grupos.
 * Lanza DirectoryError con un mensaje apto para mostrar al usuario.
 */
async function authenticate(rawUsername, password) {
  // Critico: un bind con contrasena vacia es un "bind anonimo no autenticado"
  // y AD lo acepta como exitoso. Sin esta linea cualquiera entraria.
  if (typeof password !== 'string' || password.length === 0) {
    throw new DirectoryError(GENERIC_BAD_LOGIN, 401, 'AD_EMPTY_PASSWORD', 'contrasena_vacia');
  }

  const sam = normalizeUsername(rawUsername);
  const client = createClient();

  try {
    try {
      await client.bind(`${sam}@${config.ldap.domain}`, password);
    } catch (err) {
      throw translateBindError(err);
    }

    let profile;
    try {
      profile = await readProfile(client, sam);
    } catch (err) {
      throw connectionError(err);
    }
    if (!profile) {
      throw new DirectoryError(GENERIC_BAD_LOGIN, 401, 'AD_USER_NOT_FOUND', 'fuera_de_base_dn');
    }
    if (profile.disabled) {
      throw new DirectoryError(AD_REASONS['533'].message, 403, 'AD_DISABLED', 'uac_disabled');
    }
    return profile;
  } finally {
    await client.unbind().catch(() => {});
  }
}

function canLookup() {
  return Boolean(config.ldap.bindUser && config.ldap.bindPassword);
}

/**
 * Consulta un usuario con la cuenta de servicio, sin su contrasena.
 * Sirve para revalidar grupos y estado al renovar la sesion.
 * Devuelve null si la cuenta ya no existe.
 */
async function lookup(username) {
  if (!canLookup()) return undefined;
  const client = createClient();
  try {
    try {
      await client.bind(config.ldap.bindUser, config.ldap.bindPassword);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        console.error('[ldap] la cuenta de servicio LDAP_BIND_USER fue rechazada');
      }
      throw connectionError(err);
    }
    try {
      return await readProfile(client, normalizeUsername(username));
    } catch (err) {
      throw connectionError(err);
    }
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Traduce la lista de grupos de AD al rol del SIO de mayor privilegio.
 * Devuelve null si la persona no esta en ningun grupo del SIO.
 */
function resolveRole(groups) {
  const owned = new Set((groups || []).map((g) => String(g).toLowerCase()));
  for (const role of ROLE_PRIORITY) {
    const adGroup = config.ldap.groups[role];
    if (adGroup && owned.has(adGroup.toLowerCase())) return role;
  }
  return null;
}

/** Solo los grupos del SIO, para la auditoria (no se registra toda la membresia). */
function relevantGroups(groups) {
  const wanted = new Set(Object.values(config.ldap.groups).map((g) => g.toLowerCase()));
  return (groups || []).filter((g) => wanted.has(String(g).toLowerCase()));
}

/** Prueba de conectividad para el arranque y el diagnostico. */
async function ping() {
  const client = createClient();
  try {
    if (canLookup()) await client.bind(config.ldap.bindUser, config.ldap.bindPassword);
    else await client.bind('', ''); // bind anonimo: solo comprueba red y TLS
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await client.unbind().catch(() => {});
  }
}

module.exports = {
  DirectoryError,
  authenticate,
  lookup,
  canLookup,
  resolveRole,
  relevantGroups,
  normalizeUsername,
  ping,
  _internal: { guidToString, translateBindError },
};
