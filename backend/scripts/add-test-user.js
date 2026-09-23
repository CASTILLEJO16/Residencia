const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function addTestUser() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/sio.db');
  
  console.log('[test-user] Cargando base de datos...');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Insertar rol admin
  console.log('[test-user] Insertando rol admin...');
  db.run(`INSERT OR IGNORE INTO roles (name, description, is_system) VALUES (?, ?, ?)`, 
    ['admin', 'Administrador del sistema', 1]);
  
  // Insertar usuario admin
  console.log('[test-user] Insertando usuario admin...');
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  
  db.run(`INSERT OR IGNORE INTO users (username, email, full_name, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?)`, 
    ['admin', 'admin@sio.com', 'Administrador', passwordHash, 1, 1]);
  
  // Guardar cambios
  console.log('[test-user] Guardando base de datos...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[test-user] Usuario de prueba creado exitosamente');
  console.log('[test-user] Credenciales:');
  console.log('  - Usuario: admin');
  console.log('  - Contraseña: Admin123!');
  console.log('  - Email: admin@sio.com');
  
  db.close();
}

addTestUser().catch(console.error);
