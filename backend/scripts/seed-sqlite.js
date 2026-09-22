const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function seed() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '../data/sio.db');
  
  console.log('[seed] Cargando base de datos...');
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);
  
  console.log('[seed] Insertando datos de prueba...');
  
  // Insertar roles
  console.log('[seed] Insertando roles...');
  const roles = [
    ['admin', 'Administrador del sistema', 1],
    ['operador', 'Operador de monitoreo', 0],
    ['analista', 'Analista de datos', 0],
    ['viewer', 'Usuario solo lectura', 0],
    ['manager', 'Gerente de operaciones', 0],
  ];
  
  roles.forEach(([name, description, isSystem]) => {
    db.run(`INSERT OR IGNORE INTO roles (name, description, is_system) VALUES (?, ?, ?)`, [name, description, isSystem]);
  });
  
  // Insertar usuarios
  console.log('[seed] Insertando usuarios...');
  const passwordHash = await bcrypt.hash('Password123!', 12);
  
  const users = [
    ['admin', 'admin@sio.com', 'Administrador', 1, 1],
    ['operador1', 'op1@sio.com', 'Operador Uno', 2, 1],
    ['operador2', 'op2@sio.com', 'Operador Dos', 2, 1],
    ['analista1', 'analista1@sio.com', 'Analista Uno', 3, 1],
    ['analista2', 'analista2@sio.com', 'Analista Dos', 3, 1],
    ['viewer1', 'viewer1@sio.com', 'Viewer Uno', 4, 1],
    ['viewer2', 'viewer2@sio.com', 'Viewer Dos', 4, 1],
    ['manager1', 'manager1@sio.com', 'Gerente Uno', 5, 1],
    ['manager2', 'manager2@sio.com', 'Gerente Dos', 5, 1],
    ['user1', 'user1@sio.com', 'Usuario Uno', 2, 1],
    ['user2', 'user2@sio.com', 'Usuario Dos', 2, 1],
    ['user3', 'user3@sio.com', 'Usuario Tres', 2, 1],
    ['user4', 'user4@sio.com', 'Usuario Cuatro', 2, 1],
    ['user5', 'user5@sio.com', 'Usuario Cinco', 2, 1],
    ['user6', 'user6@sio.com', 'Usuario Seis', 2, 1],
    ['user7', 'user7@sio.com', 'Usuario Siete', 2, 1],
    ['user8', 'user8@sio.com', 'Usuario Ocho', 2, 1],
    ['user9', 'user9@sio.com', 'Usuario Nueve', 2, 1],
    ['user10', 'user10@sio.com', 'Usuario Diez', 2, 1],
  ];
  
  users.forEach(([username, email, fullName, roleId, isActive]) => {
    db.run(`INSERT OR IGNORE INTO users (username, email, full_name, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?)`, 
      [username, email, fullName, passwordHash, roleId, isActive]);
  });
  
  // Insertar KPIs
  console.log('[seed] Insertando KPIs...');
  const kpis = [
    ['CPU Usage', 'Porcentaje de uso de CPU del servidor', 'SELECT 65 AS value', 'server1', 60, 1000, 15, 'gauge', 'value', null, 1, 1],
    ['Memory Usage', 'Porcentaje de uso de memoria RAM', 'SELECT 78 AS value', 'server1', 60, 1000, 15, 'gauge', 'value', null, 1, 1],
    ['Disk Usage', 'Porcentaje de uso de disco', 'SELECT 45 AS value', 'server1', 300, 1000, 15, 'gauge', 'value', null, 1, 1],
    ['Network Traffic', 'Tráfico de red en MB/s', 'SELECT 120 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Response Time', 'Tiempo de respuesta en ms', 'SELECT 250 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Error Rate', 'Tasa de errores por minuto', 'SELECT 5 AS value', 'server1', 60, 1000, 15, 'number', 'value', null, 1, 1],
    ['Active Users', 'Número de usuarios activos', 'SELECT 150 AS value', 'app1', 60, 1000, 15, 'number', 'value', null, 1, 1],
    ['Database Connections', 'Conexiones activas a BD', 'SELECT 45 AS value', 'db1', 30, 1000, 15, 'number', 'value', null, 1, 1],
    ['API Requests', 'Solicitudes API por minuto', 'SELECT 500 AS value', 'api1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Cache Hit Rate', 'Tasa de aciertos de cache %', 'SELECT 92 AS value', 'cache1', 60, 1000, 15, 'gauge', 'value', null, 1, 1],
    ['Queue Length', 'Longitud de la cola de procesamiento', 'SELECT 25 AS value', 'queue1', 30, 1000, 15, 'number', 'value', null, 1, 1],
    ['Uptime', 'Tiempo de actividad del servidor', 'SELECT 99.9 AS value', 'server1', 300, 1000, 15, 'number', 'value', null, 1, 1],
    ['Temperature', 'Temperatura del servidor en °C', 'SELECT 42 AS value', 'server1', 60, 1000, 15, 'gauge', 'value', null, 1, 1],
    ['Throughput', 'Rendimiento en operaciones/segundo', 'SELECT 850 AS value', 'app1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Latency P95', 'Latencia percentil 95 en ms', 'SELECT 180 AS value', 'api1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Failed Transactions', 'Transacciones fallidas por hora', 'SELECT 12 AS value', 'app1', 60, 1000, 15, 'number', 'value', null, 1, 1],
    ['Storage I/O', 'Operaciones I/O por segundo', 'SELECT 320 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Thread Pool', 'Hilos activos en el pool', 'SELECT 28 AS value', 'app1', 30, 1000, 15, 'number', 'value', null, 1, 1],
    ['Memory Leaks', 'Fugas de memoria detectadas', 'SELECT 0 AS value', 'app1', 300, 1000, 15, 'number', 'value', null, 1, 1],
    ['Backup Status', 'Estado del último backup', 'SELECT 1 AS value', 'server1', 300, 1000, 15, 'boolean', 'value', null, 1, 1],
  ];
  
  kpis.forEach(([name, description, sqlQuery, dataSource, refreshInterval, maxRows, timeoutSeconds, widgetType, valueColumn, labelColumn, isActive, createdBy]) => {
    db.run(`INSERT OR IGNORE INTO kpis (name, description, sql_query, data_source, refresh_interval, max_rows, timeout_seconds, widget_type, value_column, label_column, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, sqlQuery, dataSource, refreshInterval, maxRows, timeoutSeconds, widgetType, valueColumn, labelColumn, isActive, createdBy]);
  });
  
  // Insertar Umbrales
  console.log('[seed] Insertando umbrales...');
  const thresholds = [
    [1, 'CPU Crítico', 'greater_than', 90, null, null, 'critical', 5, 1, 1, null, 1],
    [1, 'CPU Alto', 'greater_than', 75, null, null, 'high', 5, 0, 1, null, 1],
    [2, 'Memoria Crítica', 'greater_than', 90, null, null, 'critical', 5, 1, 1, null, 1],
    [2, 'Memoria Alta', 'greater_than', 80, null, null, 'high', 5, 0, 1, null, 1],
    [4, 'Tráfico Alto', 'greater_than', 200, null, null, 'high', 5, 0, 1, null, 1],
    [5, 'Respuesta Lenta', 'greater_than', 500, null, null, 'critical', 5, 1, 1, null, 1],
    [6, 'Errores Críticos', 'greater_than', 10, null, null, 'critical', 5, 1, 1, null, 1],
    [7, 'Usuarios Bajos', 'less_than', 50, null, null, 'medium', 5, 0, 1, null, 1],
    [8, 'Conexiones Altas', 'greater_than', 80, null, null, 'high', 5, 0, 1, null, 1],
    [9, 'Requests Altos', 'greater_than', 1000, null, null, 'high', 5, 0, 1, null, 1],
    [10, 'Cache Bajo', 'less_than', 80, null, null, 'medium', 5, 0, 1, null, 1],
    [11, 'Cola Larga', 'greater_than', 50, null, null, 'high', 5, 0, 1, null, 1],
    [13, 'Temperatura Alta', 'greater_than', 60, null, null, 'critical', 5, 1, 1, null, 1],
    [14, 'Rendimiento Bajo', 'less_than', 500, null, null, 'medium', 5, 0, 1, null, 1],
    [15, 'Latencia Alta', 'greater_than', 300, null, null, 'high', 5, 0, 1, null, 1],
    [16, 'Fallos Altos', 'greater_than', 20, null, null, 'critical', 5, 1, 1, null, 1],
    [17, 'I/O Alto', 'greater_than', 500, null, null, 'high', 5, 0, 1, null, 1],
    [18, 'Threads Altos', 'greater_than', 40, null, null, 'medium', 5, 0, 1, null, 1],
    [19, 'Fugas Detectadas', 'greater_than', 0, null, null, 'critical', 5, 1, 1, null, 1],
    [20, 'Backup Fallido', 'equals', 0, null, null, 'critical', 5, 1, 1, null, 1],
  ];
  
  thresholds.forEach(([kpiId, name, conditionType, thresholdValue, thresholdMin, thresholdMax, severity, cooldownMinutes, autoCreateTicket, notifyEmails, isActive, createdBy]) => {
    db.run(`INSERT OR IGNORE INTO thresholds (kpi_id, name, condition_type, threshold_value, threshold_min, threshold_max, severity, cooldown_minutes, auto_create_ticket, notify_emails, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kpiId, name, conditionType, thresholdValue, thresholdMin, thresholdMax, severity, cooldownMinutes, autoCreateTicket, notifyEmails, isActive, createdBy]);
  });
  
  // Insertar Alertas
  console.log('[seed] Insertando alertas...');
  const alerts = [
    [1, 1, 'critical', 95, 'open', 1, null],
    [2, 2, 'high', 82, 'open', 1, null],
    [3, 1, 'critical', 92, 'open', 1, null],
    [4, 4, 'high', 220, 'open', 1, null],
    [5, 5, 'critical', 550, 'open', 1, null],
    [6, 6, 'critical', 15, 'open', 1, null],
    [7, 7, 'medium', 45, 'open', 1, null],
    [8, 8, 'high', 85, 'open', 1, null],
    [9, 9, 'high', 1100, 'open', 1, null],
    [10, 10, 'medium', 75, 'open', 1, null],
    [11, 11, 'high', 55, 'open', 1, null],
    [12, 12, 'medium', 99.8, 'open', 1, null],
    [13, 13, 'critical', 65, 'open', 1, null],
    [14, 14, 'medium', 450, 'open', 1, null],
    [15, 15, 'high', 320, 'open', 1, null],
    [16, 16, 'critical', 25, 'open', 1, null],
    [17, 17, 'high', 550, 'open', 1, null],
    [18, 18, 'medium', 42, 'open', 1, null],
    [19, 19, 'critical', 1, 'open', 1, null],
    [20, 20, 'critical', 0, 'open', 1, null],
  ];
  
  alerts.forEach(([kpiId, thresholdId, severity, currentValue, status, occurrenceCount, acknowledgedBy]) => {
    db.run(`INSERT OR IGNORE INTO alerts (kpi_id, threshold_id, severity, current_value, status, occurrence_count, acknowledged_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [kpiId, thresholdId, severity, currentValue, status, occurrenceCount, acknowledgedBy]);
  });
  
  // Insertar Tickets
  console.log('[seed] Insertando tickets...');
  const tickets = [
    ['T001', 'CPU sobrecargado en servidor principal', 'El CPU está al 95% de capacidad, necesita atención inmediata', 1, 'critical', 'open', 2, null, 0, null, 1],
    ['T002', 'Memoria alta en servidor de base de datos', 'Uso de memoria al 82%, monitorear tendencia', 2, 'high', 'in_progress', 3, null, 0, null, 1],
    ['T003', 'Tráfico de red inusual', 'Pico de tráfico detectado a las 2:00 AM', 4, 'high', 'open', null, null, 0, null, 1],
    ['T004', 'Tiempo de respuesta degradado', 'API respondiendo con 550ms de latencia', 5, 'critical', 'open', 2, null, 0, null, 1],
    ['T005', 'Tasa de errores elevada', '15 errores por minuto detectados', 6, 'critical', 'in_progress', 3, null, 0, null, 1],
    ['T006', 'Usuarios activos bajos', 'Solo 45 usuarios activos, verificar marketing', 7, 'medium', 'open', null, null, 0, null, 1],
    ['T007', 'Conexiones a BD cerca del límite', '85 conexiones activas, cerca del máximo', 8, 'high', 'open', 2, null, 0, null, 1],
    ['T008', 'Solicitudes API por encima del umbral', '1100 req/min superando el límite', 9, 'high', 'open', null, null, 0, null, 1],
    ['T009', 'Cache hit rate bajo', 'Cache al 75%, optimizar configuración', 10, 'medium', 'open', 4, null, 0, null, 1],
    ['T010', 'Cola de procesamiento creciente', '55 items en cola, revisar capacidad', 11, 'high', 'in_progress', 3, null, 0, null, 1],
    ['T011', 'Temperatura del servidor alta', '65°C detectados en sensor principal', 13, 'critical', 'open', 2, null, 0, null, 1],
    ['T012', 'Rendimiento por debajo del SLA', '450 ops/s, SLA es 500', 14, 'medium', 'open', null, null, 0, null, 1],
    ['T013', 'Latencia P95 elevada', '320ms de latencia P95, SLA es 300ms', 15, 'high', 'open', 2, null, 0, null, 1],
    ['T014', 'Transacciones fallidas', '25 fallas en la última hora', 16, 'critical', 'open', 3, null, 0, null, 1],
    ['T015', 'I/O de disco alto', '550 ops/s, verificar cuellos de botella', 17, 'high', 'open', 2, null, 0, null, 1],
    ['T016', 'Thread pool saturado', '42 hilos activos, aumentar capacidad', 18, 'medium', 'open', null, null, 0, null, 1],
    ['T017', 'Posible fuga de memoria', '1 fuga detectada en análisis', 19, 'critical', 'open', 3, null, 0, null, 1],
    ['T018', 'Backup nocturno fallido', 'Backup de las 3AM no completó', 20, 'critical', 'open', 2, null, 0, null, 1],
    ['T019', 'Mantenimiento programado', 'Reinicio de servidor programado', null, 'low', 'open', 2, null, 0, null, 1],
    ['T020', 'Actualización de sistema', 'Actualizar a versión 2.0', null, 'low', 'open', 3, null, 0, null, 1],
  ];
  
  tickets.forEach(([ticketNumber, title, description, alertId, priority, status, assignedTo, escalatedTo, escalationLevel, dueDate, createdBy]) => {
    db.run(`INSERT OR IGNORE INTO tickets (ticket_number, title, description, alert_id, priority, status, assigned_to, escalated_to, escalation_level, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNumber, title, description, alertId, priority, status, assignedTo, escalatedTo, escalationLevel, dueDate, createdBy]);
  });
  
  // Insertar configuración del sistema
  console.log('[seed] Insertando configuración del sistema...');
  const configs = [
    ['app.name', 'SIO System', 'string', 'Nombre de la aplicación', 0, 1],
    ['app.version', '1.0.0', 'string', 'Versión actual', 0, 1],
    ['monitor.enabled', 'true', 'boolean', 'Monitor habilitado', 0, 1],
    ['monitor.interval', '60', 'number', 'Intervalo de monitoreo en segundos', 0, 1],
    ['alert.email.enabled', 'false', 'boolean', 'Alertas por email habilitadas', 1, 1],
    ['alert.email.recipients', 'admin@sio.com', 'string', 'Destinatarios de alertas', 1, 1],
    ['retention.days', '90', 'number', 'Días de retención de logs', 0, 1],
    ['maintenance.window', '02:00-04:00', 'string', 'Ventana de mantenimiento', 0, 1],
  ];
  
  configs.forEach(([keyName, value, valueType, description, isSecret, updatedBy]) => {
    db.run(`INSERT OR IGNORE INTO system_config (key_name, value, value_type, description, is_secret, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [keyName, value, valueType, description, isSecret, updatedBy]);
  });
  
  // Guardar cambios
  console.log('[seed] Guardando base de datos...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[seed] Datos de prueba insertados exitosamente');
  console.log('[seed] Resumen:');
  console.log(`  - Roles: ${roles.length}`);
  console.log(`  - Usuarios: ${users.length}`);
  console.log(`  - KPIs: ${kpis.length}`);
  console.log(`  - Umbrales: ${thresholds.length}`);
  console.log(`  - Alertas: ${alerts.length}`);
  console.log(`  - Tickets: ${tickets.length}`);
  console.log(`  - Configuraciones: ${configs.length}`);
  
  db.close();
}

seed().catch(console.error);
