'use strict';
/**
 * Carga datos de demostracion (usuarios, KPIs, umbrales, alertas, tickets...).
 *
 *   node scripts/seed-sqlite.js
 *
 * La contrasena de los usuarios demo se toma de SEED_PASSWORD (por defecto
 * "Password123!"). Todos quedan con must_change_password = 1, asi que la
 * deberan cambiar en su primer inicio de sesion. No se ejecuta en produccion.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb, applySchema, closeAll } = require('../src/config/database');

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('[seed] NODE_ENV=production: los datos demo no se cargan en produccion.');
  console.error('[seed] Use "npm run seed:admin" para crear el administrador inicial.');
  process.exit(1);
}

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';

function seed() {
  const db = initDb();
  applySchema(db);

  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, Number(process.env.BCRYPT_ROUNDS) || 12);

  const users = [
    ['admin', 'admin@sio.com', 'Administrador', 1],
    ['analista1', 'analista1@sio.com', 'Analista Uno', 2],
    ['analista2', 'analista2@sio.com', 'Analista Dos', 2],
    ['consulta1', 'consulta1@sio.com', 'Consulta Uno', 3],
    ['auditor1', 'auditor1@sio.com', 'Auditor Uno', 4],
  ];

  const kpis = [
    ['CPU Usage', 'Porcentaje de uso de CPU del servidor', 'SELECT 65 AS value', 'server1', 60, 1000, 15, 'gauge', 'value', null],
    ['Memory Usage', 'Porcentaje de uso de memoria RAM', 'SELECT 78 AS value', 'server1', 60, 1000, 15, 'gauge', 'value', null],
    ['Network Traffic', 'Tráfico de red en MB/s', 'SELECT 120 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp'],
    ['Response Time', 'Tiempo de respuesta en ms', 'SELECT 250 AS value', 'server1', 30, 1000, 15, 'line', 'value', 'timestamp'],
    ['Error Rate', 'Tasa de errores por minuto', 'SELECT 5 AS value', 'server1', 60, 1000, 15, 'number', 'value', null],
  ];

  // [kpi_id, nombre, condicion, valor, severidad, auto_create_ticket]
  const thresholds = [
    [1, 'CPU Crítico', 'greater_than', 90, 'critical', 1],
    [2, 'Memoria Crítica', 'greater_than', 90, 'critical', 1],
    [3, 'Tráfico Alto', 'greater_than', 200, 'high', 0],
    [4, 'Respuesta Lenta', 'greater_than', 500, 'critical', 1],
    [5, 'Errores Críticos', 'greater_than', 10, 'critical', 1],
  ];

  const alerts = [
    [1, 1, 'critical', 95],
    [2, 2, 'high', 82],
    [3, 3, 'high', 220],
    [4, 4, 'critical', 550],
    [5, 5, 'critical', 15],
  ];

  const tickets = [
    ['T001', 'CPU sobrecargado en servidor principal', 'El CPU está al 95% de capacidad, necesita atención inmediata', 1, 'critical', 'open', 2],
    ['T002', 'Memoria alta en servidor de base de datos', 'Uso de memoria al 82%, monitorear tendencia', 2, 'high', 'in_progress', 3],
    ['T003', 'Tráfico de red inusual', 'Pico de tráfico detectado a las 2:00 AM', 3, 'high', 'open', null],
    ['T004', 'Tiempo de respuesta degradado', 'API respondiendo con 550ms de latencia', 4, 'critical', 'open', 2],
    ['T005', 'Tasa de errores elevada', '15 errores por minuto detectados', 5, 'critical', 'in_progress', 3],
  ];

  const configs = [
    ['app.name', 'SIO System', 'string', 'Nombre de la aplicación', 0],
    ['app.version', '1.0.0', 'string', 'Versión actual', 0],
    ['monitor.enabled', 'true', 'boolean', 'Monitor habilitado', 0],
    ['monitor.interval', '60', 'number', 'Intervalo de monitoreo en segundos', 0],
    ['alert.email.enabled', 'false', 'boolean', 'Alertas por email habilitadas', 1],
    ['alert.email.recipients', 'admin@sio.com', 'string', 'Destinatarios de alertas', 1],
    ['retention.days', '90', 'number', 'Días de retención de logs', 0],
    ['maintenance.window', '02:00-04:00', 'string', 'Ventana de mantenimiento', 0],
  ];

  const ticketHistory = [
    [1, 1, 'created', null, null, null, 'Ticket creado por alerta'],
    [1, 2, 'assigned', 'assigned_to', null, '2', 'Asignado a analista1'],
    [1, 2, 'status_changed', 'status', 'open', 'in_progress', 'En análisis'],
    [2, 1, 'created', null, null, null, 'Ticket creado por alerta'],
    [2, 3, 'assigned', 'assigned_to', null, '3', 'Asignado a analista2'],
  ];

  db.transaction(() => {
    const insUser = db.prepare(`INSERT OR IGNORE INTO users
      (username, email, full_name, password_hash, role_id, is_active, must_change_password)
      VALUES (?, ?, ?, ?, ?, 1, 1)`);
    users.forEach(([u, e, n, r]) => insUser.run(u, e, n, passwordHash, r));

    const insKpi = db.prepare(`INSERT OR IGNORE INTO kpis
      (name, description, sql_query, data_source, refresh_interval, max_rows, timeout_seconds,
       widget_type, value_column, label_column, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`);
    kpis.forEach((k) => insKpi.run(...k));

    const insThr = db.prepare(`INSERT INTO thresholds
      (kpi_id, name, condition_type, threshold_value, severity, cooldown_minutes,
       auto_create_ticket, notify_emails, is_active, created_by)
      SELECT ?, ?, ?, ?, ?, 5, ?, NULL, 1, 1
      WHERE NOT EXISTS (SELECT 1 FROM thresholds WHERE kpi_id = ? AND name = ?)`);
    thresholds.forEach(([kpi, name, cond, val, sev, auto]) =>
      insThr.run(kpi, name, cond, val, sev, auto, kpi, name));

    const alertCount = db.prepare('SELECT COUNT(*) AS c FROM alerts').get().c;
    if (alertCount === 0) {
      const insAlert = db.prepare(`INSERT INTO alerts
        (kpi_id, threshold_id, severity, current_value, status, occurrence_count)
        VALUES (?, ?, ?, ?, 'open', 1)`);
      alerts.forEach((a) => insAlert.run(...a));
    }

    const insTicket = db.prepare(`INSERT OR IGNORE INTO tickets
      (ticket_number, title, description, alert_id, priority, status, assigned_to,
       escalation_level, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`);
    tickets.forEach((t) => insTicket.run(...t));

    const insConfig = db.prepare(`INSERT OR IGNORE INTO system_config
      (key_name, value, value_type, description, is_secret, updated_by)
      VALUES (?, ?, ?, ?, ?, 1)`);
    configs.forEach((c) => insConfig.run(...c));

    const historyCount = db.prepare('SELECT COUNT(*) AS c FROM ticket_history').get().c;
    if (historyCount === 0) {
      const insHist = db.prepare(`INSERT INTO ticket_history
        (ticket_id, changed_by, action, field_name, old_value, new_value, comment)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      ticketHistory.forEach((h) => insHist.run(...h));
    }
  })();

  console.log('[seed] Datos de demostracion cargados.');
  console.log(`[seed] Usuarios: ${users.map((u) => u[0]).join(', ')}`);
  console.log(`[seed] Contrasena inicial: ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : SEED_PASSWORD}`);
  console.log('[seed] Todos deberan cambiarla en su primer inicio de sesion.');
}

try {
  seed();
} catch (err) {
  console.error('[seed] Error:', err.message);
  process.exitCode = 1;
} finally {
  closeAll();
}
