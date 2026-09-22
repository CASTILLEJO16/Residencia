const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function init() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/sio.db');
  const schemaPath = path.join(__dirname, 'create-schema-sqlite.sql');

  console.log(`[init] Creando base de datos SQLite: ${dbPath}`);

  // Eliminar base de datos existente si existe
  if (fs.existsSync(dbPath)) {
    console.log('[init] Eliminando base de datos existente...');
    fs.unlinkSync(dbPath);
  }

  // Crear directorio si no existe
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Crear nueva base de datos
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  // Leer y ejecutar esquema
  const schema = fs.readFileSync(schemaPath, 'utf8');
  console.log('[init] Ejecutando esquema...');
  db.exec(schema);

  // Guardar base de datos
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  console.log('[init] Base de datos creada exitosamente');
  db.close();
}

init().catch(console.error);
