const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../src/models');
const servicesDir = path.join(__dirname, '../src/services');

// Reemplazos para migrar de PostgreSQL a SQLite
const replacements = [
  // Reemplazar $1, $2, etc. por ?, ?, etc. (pero cuidado con los índices duplicados)
  { pattern: /\$1/g, replacement: '?' },
  { pattern: /\$2/g, replacement: '?' },
  { pattern: /\$3/g, replacement: '?' },
  { pattern: /\$4/g, replacement: '?' },
  { pattern: /\$5/g, replacement: '?' },
  { pattern: /\$6/g, replacement: '?' },
  { pattern: /\$7/g, replacement: '?' },
  { pattern: /\$8/g, replacement: '?' },
  { pattern: /\$9/g, replacement: '?' },
  { pattern: /\$10/g, replacement: '?' },
  { pattern: /\$11/g, replacement: '?' },
  { pattern: /\$12/g, replacement: '?' },
  
  // Reemplazar funciones de PostgreSQL por SQLite
  { pattern: /NOW\(\)/g, replacement: "datetime('now')" },
  { pattern: /INTERVAL '(\d+) days'/g, replacement: "'+$1 days'" },
  { pattern: /INTERVAL '(\d+) hours'/g, replacement: "'+$1 hours'" },
  { pattern: /INTERVAL '(\d+) minutes'/g, replacement: "'+$1 minutes'" },
  { pattern: /INTERVAL '(\d+) second' \* (\d+)/g, replacement: "'+$2 seconds'" },
  { pattern: /INTERVAL '7 days'/g, replacement: "'+7 days'" },
  { pattern: /INTERVAL '90 days'/g, replacement: "'+90 days'" },
  { pattern: /INTERVAL '30 days'/g, replacement: "'+30 days'" },
  { pattern: /INTERVAL '180 days'/g, replacement: "'+180 days'" },
  
  // Reemplazar RETURNING id por last_insert_rowid()
  { pattern: /RETURNING id/g, replacement: '' },
  
  // Reemplazar COALESCE($2, email) por COALESCE(?, email)
  { pattern: /COALESCE\(\$(\d+),/g, replacement: 'COALESCE(?, ' },
];

function migrateFile(filePath) {
  console.log(`Migrando: ${path.basename(filePath)}`);
  let content = fs.readFileSync(filePath, 'utf8');
  
  for (const { pattern, replacement } of replacements) {
    content = content.replace(pattern, replacement);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
}

// Migrar todos los archivos JS en models
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));
modelFiles.forEach(file => migrateFile(path.join(modelsDir, file)));

// Migrar todos los archivos JS en services
const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'));
serviceFiles.forEach(file => migrateFile(path.join(servicesDir, file)));

console.log('Migración completada. Revisa los archivos manualmente para ajustes finos.');
