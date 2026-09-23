const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function addColumn() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/sio.db');
  
  console.log('[alter] Cargando base de datos...');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  // Verificar si la columna ya existe
  const tableInfo = db.exec('PRAGMA table_info(users)');
  const hasColumn = tableInfo[0].values.some(row => row[1] === 'must_change_password');
  
  if (hasColumn) {
    console.log('[alter] La columna must_change_password ya existe');
  } else {
    console.log('[alter] Agregando columna must_change_password...');
    db.run('ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0');
    console.log('[alter] Columna agregada exitosamente');
  }
  
  // Guardar cambios
  console.log('[alter] Guardando base de datos...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[alter] Base de datos actualizada');
  
  db.close();
}

addColumn().catch(console.error);
