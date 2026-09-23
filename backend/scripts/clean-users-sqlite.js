const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function cleanUsers() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/sio.db');
  
  console.log('[clean] Cargando base de datos...');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  console.log('[clean] Eliminando usuarios de prueba...');
  db.run('DELETE FROM users');
  
  console.log('[clean] Eliminando roles de prueba...');
  db.run('DELETE FROM roles');
  
  console.log('[clean] Eliminando refresh tokens...');
  db.run('DELETE FROM refresh_tokens');
  
  // Guardar cambios
  console.log('[clean] Guardando base de datos...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[clean] Usuarios y roles eliminados exitosamente');
  console.log('[clean] Se mantienen: KPIs, Umbrales, Alertas, Tickets, Configuración');
  
  db.close();
}

cleanUsers().catch(console.error);
