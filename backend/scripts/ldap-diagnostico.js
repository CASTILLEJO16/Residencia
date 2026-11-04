'use strict';
/**
 * Diagnostico de Active Directory: muestra que ve el SIO de un usuario.
 *
 *   npm run ldap:test -- usuario
 *
 * Pide la contrasena del usuario (no se muestra al escribirla), se autentica
 * igual que el login y muestra su DN, todos los grupos que devuelve AD y el
 * rol del SIO que le corresponderia. No escribe nada en la base de datos.
 */
require('dotenv').config();
const readline = require('readline');
const config = require('../src/config/env');
const ldap = require('../src/services/ldapService');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
      else rl.output.write('*');
    };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.log('Uso: npm run ldap:test -- <usuario>');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Configuracion ===');
  console.log(`LDAP_URL      : ${config.ldap.url || '(vacio: solo login local)'}`);
  console.log(`LDAP_BASE_DN  : ${config.ldap.baseDN}`);
  console.log(`LDAP_DOMAIN   : ${config.ldap.domain}`);
  console.log(`LDAP_CA_CERT  : ${config.ldap.caCertFile || '(ninguno)'}`);
  console.log('Grupos por rol:');
  for (const [role, group] of Object.entries(config.ldap.groups)) {
    console.log(`  ${role.padEnd(14)} <- grupo de AD "${group}"`);
  }
  if (!config.ldap.url) return;

  const password = await askHidden(`\nContrasena de ${username}: `);

  console.log('\n=== Autenticacion ===');
  let profile;
  try {
    profile = await ldap.authenticate(username, password);
  } catch (err) {
    console.log(`FALLO (${err.code || err.name}): ${err.message}`);
    if (err.reason) console.log(`Motivo tecnico: ${err.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log('OK');
  console.log(`Usuario : ${profile.username}`);
  console.log(`Nombre  : ${profile.fullName}`);
  console.log(`Correo  : ${profile.email}`);
  console.log(`DN      : ${profile.dn}`);

  console.log(`\n=== Grupos que devuelve AD (${profile.groups.length}) ===`);
  profile.groups.forEach((g) => console.log(`  - ${g}`));

  const role = ldap.resolveRole(profile.groups);
  console.log('\n=== Resultado ===');
  if (role) {
    console.log(`Rol del SIO: ${role}. Este usuario puede entrar.`);
  } else {
    console.log('Ningun grupo coincide con los de AD_GROUP_*: el login respondera 403.');
    console.log('Revise que el usuario sea miembro del grupo (o de un grupo dentro de el) y que');
    console.log('el nombre del grupo en AD coincida con el configurado en .env.');
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exitCode = 1;
});
