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
  
  // Los roles ya se insertan en el esquema, no los duplicamos
  
  // Insertar usuarios
  console.log('[seed] Insertando usuarios...');
  const passwordHash = await bcrypt.hash('Password123!', 12);
  
  const users = [
    ['admin', 'admin@sio.com', 'Administrador', 1, 1],
    ['analista1', 'analista1@sio.com', 'Analista Uno', 2, 1],
    ['analista2', 'analista2@sio.com', 'Analista Dos', 2, 1],
    ['consulta1', 'consulta1@sio.com', 'Consulta Uno', 3, 1],
    ['auditor1', 'auditor1@sio.com', 'Auditor Uno', 4, 1],
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
    ['Network Traffic', 'Tráfico de red en MB/s', 'SELECT 120 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Response Time', 'Tiempo de respuesta en ms', 'SELECT 250 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp', 1, 1],
    ['Error Rate', 'Tasa de errores por minuto', 'SELECT 5 AS value', 'server1', 60, 1000, 15, 'number', 'value', null, 1, 1],
  ];
  
  kpis.forEach(([name, description, sqlQuery, dataSource, refreshInterval, maxRows, timeoutSeconds, widgetType, valueColumn, labelColumn, isActive, createdBy]) => {
    db.run(`INSERT OR IGNORE INTO kpis (name, description, sql_query, data_source, refresh_interval, max_rows, timeout_seconds, widget_type, value_column, label_column, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, sqlQuery, dataSource, refreshInterval, maxRows, timeoutSeconds, widgetType, valueColumn, labelColumn, isActive, createdBy]);
  });
  
  // Insertar Umbrales
  console.log('[seed] Insertando umbrales...');
  const thresholds = [
    [1, 'CPU Crítico', 'greater_than', 90, null, null, 'critical', 5, 1, 1, null, 1],
    [2, 'Memoria Crítica', 'greater_than', 90, null, null, 'critical', 5, 1, 1, null, 1],
    [3, 'Tráfico Alto', 'greater_than', 200, null, null, 'high', 5, 0, 1, null, 1],
    [4, 'Respuesta Lenta', 'greater_than', 500, null, null, 'critical', 5, 1, 1, null, 1],
    [5, 'Errores Críticos', 'greater_than', 10, null, null, 'critical', 5, 1, 1, null, 1],
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
    [3, 3, 'high', 220, 'open', 1, null],
    [4, 4, 'critical', 550, 'open', 1, null],
    [5, 5, 'critical', 15, 'open', 1, null],
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
    ['T003', 'Tráfico de red inusual', 'Pico de tráfico detectado a las 2:00 AM', 3, 'high', 'open', null, null, 0, null, 1],
    ['T004', 'Tiempo de respuesta degradado', 'API respondiendo con 550ms de latencia', 4, 'critical', 'open', 2, null, 0, null, 1],
    ['T005', 'Tasa de errores elevada', '15 errores por minuto detectados', 5, 'critical', 'in_progress', 3, null, 0, null, 1],
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

  // Insertar logs de auditoría
  console.log('[seed] Insertando logs de auditoría...');
  const auditLogs = [
    [1, 'admin', 'LOGIN', null, null, 'POST', '/api/auth/login', 200, '192.168.1.100', 'Mozilla/5.0', null, null],
    [1, 'admin', 'CREATE', 'user', '2', 'POST', '/api/users', 201, '192.168.1.100', 'Mozilla/5.0', null, '{"username":"analista1"}'],
    [1, 'admin', 'CREATE', 'kpi', '1', 'POST', '/api/kpis', 201, '192.168.1.100', 'Mozilla/5.0', null, '{"name":"CPU Usage"}'],
    [2, 'analista1', 'LOGIN', null, null, 'POST', '/api/auth/login', 200, '192.168.1.105', 'Mozilla/5.0', null, null],
    [2, 'analista1', 'UPDATE', 'ticket', '1', 'PUT', '/api/tickets/1', 200, '192.168.1.105', 'Mozilla/5.0', '{"status":"open"}', '{"status":"in_progress"}'],
  ];

  auditLogs.forEach(([userId, username, action, entityType, entityId, httpMethod, endpoint, statusCode, ipAddress, userAgent, oldValues, newValues]) => {
    db.run(`INSERT OR IGNORE INTO audit_logs (user_id, username, action, entity_type, entity_id, http_method, endpoint, status_code, ip_address, user_agent, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, action, entityType, entityId, httpMethod, endpoint, statusCode, ipAddress, userAgent, oldValues, newValues]);
  });

  // Insertar historial de tickets
  console.log('[seed] Insertando historial de tickets...');
  const ticketHistory = [
    [1, 1, 'created', null, null, null, 'Ticket creado por alerta'],
    [1, 2, 'assigned', 'assigned_to', null, '2', 'Asignado a analista1'],
    [1, 2, 'status_changed', 'status', 'open', 'in_progress', 'En análisis'],
    [2, 1, 'created', null, null, null, 'Ticket creado por alerta'],
    [2, 3, 'assigned', 'assigned_to', null, '3', 'Asignado a analista2'],
  ];

  ticketHistory.forEach(([ticketId, changedBy, action, fieldName, oldValue, newValue, comment]) => {
    db.run(`INSERT OR IGNORE INTO ticket_history (ticket_id, changed_by, action, field_name, old_value, new_value, comment) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, changedBy, action, fieldName, oldValue, newValue, comment]);
  });

  // Guardar cambios
  console.log('[seed] Guardando base de datos...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  console.log('[seed] Datos de prueba insertados exitosamente');
  console.log('[seed] Resumen:');
  console.log(`  - Usuarios: ${users.length}`);
  console.log(`  - KPIs: ${kpis.length}`);
  console.log(`  - Umbrales: ${thresholds.length}`);
  console.log(`  - Alertas: ${alerts.length}`);
  console.log(`  - Tickets: ${tickets.length}`);
  console.log(`  - Configuraciones: ${configs.length}`);
  console.log(`  - Logs de auditoría: ${auditLogs.length}`);
  console.log(`  - Historial de tickets: ${ticketHistory.length}`);
  
  db.close();
}

seed().catch(console.error);
