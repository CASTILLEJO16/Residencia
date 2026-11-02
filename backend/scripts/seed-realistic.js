'use strict';
/**
 * Carga un escenario operativo realista para usar el SIO desde el primer dia:
 *
 *   - Un equipo de mesa de ayuda (analistas, lider de soporte, gerencia, auditoria).
 *   - ~4 meses de tickets con horarios laborales, prioridades, SLA, asignaciones,
 *     escalamientos, comentarios y cierres con su resolucion.
 *   - KPIs reales calculados sobre esos tickets (no valores fijos), con umbrales.
 *   - Historico diario de los KPIs y las alertas que esos umbrales habrian
 *     generado en el periodo.
 *   - Bitacora de auditoria coherente con todo lo anterior.
 *
 * Uso:
 *   node scripts/seed-realistic.js            agrega el escenario (falla si ya hay tickets)
 *   node scripts/seed-realistic.js --reset    borra tickets, KPIs, umbrales, alertas e
 *                                             historicos antes de cargar (conserva usuarios)
 *   --force                                   permite ejecutarlo con NODE_ENV=production
 *
 * Los usuarios nuevos usan la contrasena de SEED_PASSWORD (por defecto
 * "Password123!") y deben cambiarla en su primer inicio de sesion.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { initDb, applySchema, closeAll } = require('../src/config/database');

const args = new Set(process.argv.slice(2));
if (process.env.NODE_ENV === 'production' && !args.has('--force')) {
  console.error('[seed] NODE_ENV=production: agregue --force si de verdad quiere cargar este escenario.');
  process.exit(1);
}

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Password123!';
const DAYS = 120;              // periodo historico
const UTC_OFFSET_HOURS = -6;   // hora local (Ciudad de Mexico) para horarios laborales

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Generador pseudoaleatorio con semilla: el escenario es reproducible.
let seed = 20261102;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(rand() * list.length)];
function weighted(entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
// Distribucion log-normal aproximada: tiempos de atencion con cola larga.
function logNormal(median, spread) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return median * Math.exp(spread * z);
}

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const sqlDate = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const localDay = (ms) => new Date(ms + UTC_OFFSET_HOURS * HOUR).toISOString().slice(0, 10);

/** Primer minuto laboral (lun-vie 8:00-19:00 local) igual o posterior a ms. */
function nextBusinessTime(ms) {
  let t = ms;
  for (let i = 0; i < 24 * 8; i += 1) {
    const local = new Date(t + UTC_OFFSET_HOURS * HOUR);
    const dow = local.getUTCDay();
    const h = local.getUTCHours();
    if (dow !== 0 && dow !== 6 && h >= 8 && h < 19) return t;
    t += HOUR;
    t -= t % HOUR;
  }
  return t;
}

// ---------------------------------------------------------------------------
// Catalogos
// ---------------------------------------------------------------------------

const TEAM = [
  { username: 'mlopez', fullName: 'Mariana López Hernández', role: 'SIO_Analistas', load: 5 },
  { username: 'cramirez', fullName: 'Carlos Ramírez Ortega', role: 'SIO_Analistas', load: 5 },
  { username: 'dtorres', fullName: 'Daniela Torres Méndez', role: 'SIO_Analistas', load: 4 },
  { username: 'jsanchez', fullName: 'Jorge Sánchez Vega', role: 'SIO_Analistas', load: 4 },
  { username: 'fcastillo', fullName: 'Fernanda Castillo Ruiz', role: 'SIO_Analistas', load: 3 },
  { username: 'rmorales', fullName: 'Ricardo Morales Paredes', role: 'SIO_Analistas', load: 0, lead: true },
  { username: 'lgomez', fullName: 'Laura Gómez Salinas', role: 'SIO_Consulta', load: 0 },
  { username: 'hnavarro', fullName: 'Héctor Navarro Fuentes', role: 'SIO_Auditoria', load: 0 },
];

const AREAS = ['Contabilidad', 'Recursos Humanos', 'Ventas', 'Almacén', 'Compras', 'Dirección',
  'Producción', 'Sucursal Norte', 'Sucursal Centro', 'Atención a Clientes', 'Logística'];

// [titulo, descripcion, pesos de prioridad {low, medium, high, critical}, resoluciones]
const INCIDENTS = [
  ['No puede conectarse a la VPN', 'El usuario reporta error de autenticación al conectarse a la VPN desde casa.',
    { low: 1, medium: 5, high: 3, critical: 0 },
    ['Se renovó el certificado del cliente VPN y se reinstaló el perfil.', 'La cuenta estaba bloqueada en AD; se desbloqueó y se probó la conexión.']],
  ['Correo no sincroniza en Outlook', 'Outlook muestra "Desconectado" y no recibe correos nuevos desde la mañana.',
    { low: 2, medium: 6, high: 2, critical: 0 },
    ['Se reparó el perfil de Outlook y se reconstruyó el archivo OST.', 'El buzón estaba lleno; se archivó correo antiguo y se amplió la cuota.']],
  ['Impresora del área no imprime', 'Los trabajos quedan en cola y la impresora muestra error de papel atascado.',
    { low: 6, medium: 4, high: 0, critical: 0 },
    ['Se retiró papel atascado del fusor y se limpió la cola de impresión.', 'Se reinstaló el controlador de la impresora en el servidor de impresión.']],
  ['Sistema ERP lento al facturar', 'La generación de facturas tarda más de 2 minutos por documento.',
    { low: 0, medium: 3, high: 5, critical: 2 },
    ['Se reconstruyeron índices de la base del ERP y se depuraron bloqueos.', 'Se reinició el servicio de timbrado que tenía conexiones colgadas.']],
  ['Caída del sistema de punto de venta', 'Las cajas no pueden registrar ventas; el sistema no responde.',
    { low: 0, medium: 0, high: 3, critical: 7 },
    ['Se restableció el servicio de base de datos de la sucursal y se sincronizaron ventas pendientes.', 'Falla del switch de la sucursal; se reemplazó el equipo.']],
  ['Solicitud de alta de usuario', 'Alta de cuenta de dominio, correo y accesos para colaborador de nuevo ingreso.',
    { low: 7, medium: 3, high: 0, critical: 0 },
    ['Se creó la cuenta, se asignaron grupos y se entregaron credenciales al jefe inmediato.']],
  ['Solicitud de baja de usuario', 'Baja de accesos por salida de colaborador; respaldar información del equipo.',
    { low: 5, medium: 4, high: 1, critical: 0 },
    ['Se deshabilitó la cuenta, se respaldó el buzón y se recuperó el equipo.']],
  ['Restablecimiento de contraseña', 'El usuario olvidó su contraseña de dominio y no puede iniciar sesión.',
    { low: 6, medium: 3, high: 0, critical: 0 },
    ['Se validó la identidad y se restableció la contraseña con cambio obligatorio.']],
  ['Equipo no enciende', 'La laptop no enciende ni con el cargador conectado.',
    { low: 1, medium: 5, high: 2, critical: 0 },
    ['Se reemplazó el cargador dañado.', 'Falla de tarjeta madre; se asignó equipo de respaldo y se envió a garantía.']],
  ['Pantalla azul recurrente', 'El equipo se reinicia con pantalla azul varias veces al día.',
    { low: 1, medium: 5, high: 2, critical: 0 },
    ['Se actualizaron controladores de video y BIOS.', 'Se detectó memoria RAM dañada y se reemplazó.']],
  ['Sin acceso a carpeta compartida', 'El usuario no puede abrir la carpeta compartida del departamento.',
    { low: 4, medium: 5, high: 1, critical: 0 },
    ['Se agregó al usuario al grupo de seguridad correspondiente.']],
  ['Correo sospechoso de phishing', 'El usuario recibió un correo que solicita validar su contraseña en un enlace externo.',
    { low: 0, medium: 3, high: 5, critical: 2 },
    ['Se bloqueó el remitente, se eliminó el correo de todos los buzones y se forzó cambio de contraseña preventivo.']],
  ['Equipo con posible malware', 'El antivirus reporta amenaza detectada y el equipo está muy lento.',
    { low: 0, medium: 2, high: 6, critical: 2 },
    ['Se aisló el equipo, se ejecutó análisis completo y se eliminó la amenaza.', 'Se reinstaló el sistema operativo y se restauró la información respaldada.']],
  ['Internet intermitente en la sucursal', 'La conexión a internet se cae cada pocos minutos en toda la sucursal.',
    { low: 0, medium: 3, high: 5, critical: 2 },
    ['El proveedor reemplazó el módem; se monitoreó la conexión 24 horas.', 'Se corrigió un bucle en la red local causado por un cable mal conectado.']],
  ['Falla en el servidor de archivos', 'Los usuarios no pueden guardar documentos en la unidad de red.',
    { low: 0, medium: 1, high: 4, critical: 5 },
    ['Se liberó espacio en el volumen y se ampliaron 200 GB.', 'Se reinició el servicio de archivos tras una actualización fallida.']],
  ['Instalación de software', 'Solicitud de instalación de software autorizado por el jefe de área.',
    { low: 8, medium: 2, high: 0, critical: 0 },
    ['Se instaló el software con licencia corporativa y se validó con el usuario.']],
  ['Teléfono IP sin tono', 'La extensión no tiene tono y no puede recibir llamadas.',
    { low: 3, medium: 5, high: 1, critical: 0 },
    ['Se reconfiguró la extensión en el conmutador y se reinició el teléfono.']],
  ['Reporte de ventas no se genera', 'El reporte diario de ventas termina con error de tiempo de espera.',
    { low: 1, medium: 4, high: 4, critical: 1 },
    ['Se optimizó la consulta del reporte y se programó fuera de horario pico.']],
  ['No funciona el escáner', 'El escáner multifuncional no envía los documentos al correo.',
    { low: 6, medium: 4, high: 0, critical: 0 },
    ['Se actualizó la contraseña de la cuenta SMTP del equipo multifuncional.']],
  ['Respaldo nocturno fallido', 'El trabajo de respaldo de anoche terminó con errores.',
    { low: 0, medium: 2, high: 6, critical: 2 },
    ['Se reemplazó la cinta defectuosa y se ejecutó el respaldo manualmente con éxito.', 'Se liberó espacio en el repositorio de respaldos y se reprogramó el trabajo.']],
  ['Monitor sin señal', 'El monitor secundario no muestra imagen.',
    { low: 7, medium: 3, high: 0, critical: 0 },
    ['Se reemplazó el cable HDMI dañado.']],
  ['Error al timbrar facturas', 'El PAC rechaza los comprobantes con error de certificado.',
    { low: 0, medium: 1, high: 5, critical: 4 },
    ['Se cargó el nuevo certificado de sello digital en el ERP.']],
];

const PRIORITY_SLA_HOURS = { critical: 4, high: 8, medium: 24, low: 72 };

const COMMENTS = [
  'Se contactó al usuario para validar el detalle del problema.',
  'Se solicitó al usuario una captura de pantalla del error.',
  'Se realizó conexión remota al equipo para diagnóstico.',
  'En espera de respuesta del usuario.',
  'Se escaló consulta al proveedor; en espera de su respuesta.',
  'Se aplicó solución temporal mientras se corrige la causa raíz.',
  'El usuario confirma que el problema persiste; se continúa revisando.',
];

// ---------------------------------------------------------------------------
// KPIs: consultas reales sobre las tablas del SIO
// ---------------------------------------------------------------------------

const DAY_EXPR = `date(created_at, '${UTC_OFFSET_HOURS} hours')`;

const KPIS = [
  {
    key: 'abiertos',
    name: 'Tickets abiertos',
    description: 'Tickets que aún no se han cerrado (backlog total).',
    widgetType: 'number', refresh: 60, valueColumn: 'tickets',
    sql: `SELECT COUNT(*) AS tickets FROM tickets WHERE status <> 'closed'`,
    thresholds: [['Backlog alto', 'greater_than', 25, 'high', 120]],
  },
  {
    key: 'criticos',
    name: 'Críticos sin cerrar',
    description: 'Tickets de prioridad crítica abiertos en este momento.',
    widgetType: 'number', refresh: 60, valueColumn: 'tickets',
    sql: `SELECT COUNT(*) AS tickets FROM tickets WHERE priority = 'critical' AND status <> 'closed'`,
    thresholds: [['Críticos acumulados', 'greater_than', 2, 'critical', 60]],
  },
  {
    key: 'vencidos',
    name: 'Tickets vencidos',
    description: 'Tickets abiertos cuya fecha compromiso (SLA) ya pasó.',
    widgetType: 'number', refresh: 60, valueColumn: 'tickets',
    sql: `SELECT COUNT(*) AS tickets FROM tickets
          WHERE status <> 'closed' AND due_date IS NOT NULL AND due_date < datetime('now')`,
    thresholds: [['SLA vencidos', 'greater_than', 5, 'high', 120]],
  },
  {
    key: 'sin_asignar',
    name: 'Tickets sin asignar',
    description: 'Tickets abiertos que todavía no tienen responsable.',
    widgetType: 'number', refresh: 60, valueColumn: 'tickets',
    sql: `SELECT COUNT(*) AS tickets FROM tickets WHERE status <> 'closed' AND assigned_to IS NULL`,
    thresholds: [['Cola sin asignar', 'greater_than', 4, 'medium', 60]],
  },
  {
    key: 'sla',
    name: 'Cumplimiento de SLA (30 días)',
    description: 'Porcentaje de tickets cerrados en los últimos 30 días dentro de su fecha compromiso.',
    widgetType: 'gauge', refresh: 300, valueColumn: 'cumplimiento',
    sql: `SELECT ROUND(100.0 * SUM(CASE WHEN closed_at <= due_date THEN 1 ELSE 0 END) / COUNT(*), 1) AS cumplimiento
          FROM tickets
          WHERE status = 'closed' AND closed_at >= datetime('now', '-30 days')`,
    thresholds: [['SLA por debajo de la meta', 'less_than', 85, 'high', 240]],
  },
  {
    key: 'mttr',
    name: 'Tiempo promedio de resolución (h)',
    description: 'Horas promedio entre la creación y el cierre, tickets cerrados en los últimos 30 días.',
    widgetType: 'number', refresh: 300, valueColumn: 'horas',
    sql: `SELECT ROUND(AVG((julianday(closed_at) - julianday(created_at)) * 24), 1) AS horas
          FROM tickets
          WHERE status = 'closed' AND closed_at >= datetime('now', '-30 days')`,
    thresholds: [['Resolución lenta', 'greater_than', 24, 'medium', 240]],
  },
  {
    key: 'flujo',
    name: 'Tickets creados vs cerrados (30 días)',
    description: 'Entrada y salida diaria de tickets (hora local).',
    widgetType: 'line', refresh: 300, labelColumn: 'dia',
    sql: `WITH RECURSIVE dias(d) AS (
            SELECT date('now', '${UTC_OFFSET_HOURS} hours', '-29 days')
            UNION ALL
            SELECT date(d, '+1 day') FROM dias WHERE d < date('now', '${UTC_OFFSET_HOURS} hours')
          )
          SELECT d AS dia,
                 (SELECT COUNT(*) FROM tickets t WHERE date(t.created_at, '${UTC_OFFSET_HOURS} hours') = d) AS creados,
                 (SELECT COUNT(*) FROM tickets t WHERE date(t.closed_at, '${UTC_OFFSET_HOURS} hours') = d) AS cerrados
          FROM dias ORDER BY d`,
  },
  {
    key: 'estado',
    name: 'Tickets abiertos por estado',
    description: 'Distribución del backlog según su estado.',
    widgetType: 'pie', refresh: 120, labelColumn: 'estado', valueColumn: 'tickets',
    sql: `SELECT CASE status
                   WHEN 'open' THEN 'Abierto'
                   WHEN 'in_progress' THEN 'En curso'
                   WHEN 'escalated' THEN 'Escalado'
                   WHEN 'on_hold' THEN 'En espera'
                   ELSE status END AS estado,
                 COUNT(*) AS tickets
          FROM tickets WHERE status <> 'closed'
          GROUP BY status ORDER BY tickets DESC`,
  },
  {
    key: 'prioridad',
    name: 'Backlog por prioridad',
    description: 'Tickets abiertos por prioridad.',
    widgetType: 'bar', refresh: 120, labelColumn: 'prioridad', valueColumn: 'tickets',
    sql: `SELECT CASE priority
                   WHEN 'critical' THEN 'Crítica'
                   WHEN 'high' THEN 'Alta'
                   WHEN 'medium' THEN 'Media'
                   ELSE 'Baja' END AS prioridad,
                 COUNT(*) AS tickets
          FROM tickets WHERE status <> 'closed'
          GROUP BY priority
          ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
  },
  {
    key: 'semanal',
    name: 'Volumen semanal de tickets (12 semanas)',
    description: 'Tickets recibidos por semana.',
    widgetType: 'area', refresh: 600, labelColumn: 'semana', valueColumn: 'tickets',
    sql: `SELECT strftime('%Y-S%W', created_at, '${UTC_OFFSET_HOURS} hours') AS semana, COUNT(*) AS tickets
          FROM tickets
          WHERE created_at >= datetime('now', '-84 days')
          GROUP BY semana ORDER BY semana`,
  },
  {
    key: 'alertas',
    name: 'Alertas activas por severidad',
    description: 'Alertas abiertas o atendidas que aún no se resuelven.',
    widgetType: 'pie', refresh: 60, labelColumn: 'severidad', valueColumn: 'alertas',
    sql: `SELECT CASE severity
                   WHEN 'critical' THEN 'Crítica'
                   WHEN 'high' THEN 'Alta'
                   WHEN 'medium' THEN 'Media'
                   ELSE 'Baja' END AS severidad,
                 COUNT(*) AS alertas
          FROM alerts WHERE status <> 'resolved'
          GROUP BY severity`,
  },
  {
    key: 'atencion',
    name: 'Tickets que requieren atención',
    description: 'Críticos, altos o vencidos que siguen abiertos, del más atrasado al más reciente.',
    widgetType: 'table', refresh: 60,
    sql: `SELECT ticket_number AS "Ticket",
                 title AS "Título",
                 CASE priority WHEN 'critical' THEN 'Crítica' WHEN 'high' THEN 'Alta'
                               WHEN 'medium' THEN 'Media' ELSE 'Baja' END AS "Prioridad",
                 CASE status WHEN 'open' THEN 'Abierto' WHEN 'in_progress' THEN 'En curso'
                             WHEN 'escalated' THEN 'Escalado' ELSE 'En espera' END AS "Estado",
                 CASE WHEN assigned_to IS NULL THEN 'Sin asignar' ELSE 'Asignado' END AS "Responsable",
                 ROUND((julianday('now') - julianday(due_date)) * 24, 1) AS "Horas de atraso"
          FROM tickets
          WHERE status <> 'closed'
            AND (priority IN ('critical', 'high') OR due_date < datetime('now'))
          ORDER BY due_date`,
  },
];

// ---------------------------------------------------------------------------
// Generacion del escenario
// ---------------------------------------------------------------------------

function buildTickets(now, staff) {
  const analysts = staff.filter((u) => u.load > 0);
  const lead = staff.find((u) => u.lead);
  const capturers = [...analysts, staff.find((u) => u.username === 'admin')].filter(Boolean);
  const start = now - DAYS * 24 * HOUR;
  const tickets = [];

  for (let day = 0; day <= DAYS; day += 1) {
    const dayStartLocal = new Date(start + day * 24 * HOUR + UTC_OFFSET_HOURS * HOUR);
    dayStartLocal.setUTCHours(0, 0, 0, 0);
    const dayStartUtc = dayStartLocal.getTime() - UTC_OFFSET_HOURS * HOUR;
    const dow = dayStartLocal.getUTCDay();
    const weekend = dow === 0 || dow === 6;
    // Lunes mas cargado; tendencia ligera al alza en el periodo.
    const base = weekend ? 1.5 : (dow === 1 ? 19 : 14);
    const count = Math.max(0, Math.round(base * (0.85 + day / DAYS * 0.35) + (rand() - 0.5) * 6));

    for (let i = 0; i < count; i += 1) {
      const hour = weekend ? randInt(9, 14) : weighted([[8, 3], [9, 8], [10, 9], [11, 8], [12, 7],
        [13, 4], [14, 5], [15, 7], [16, 7], [17, 5], [18, 3]]);
      const createdAt = dayStartUtc + hour * HOUR + randInt(0, 59) * MIN + randInt(0, 59) * 1000;
      if (createdAt > now - 10 * MIN) continue;

      const [title, description, weights, resolutions] = pick(INCIDENTS);
      const priority = weighted(Object.entries(weights).filter(([, w]) => w > 0));
      const area = pick(AREAS);
      const creator = pick(capturers);
      const slaHours = PRIORITY_SLA_HOURS[priority];
      // Criticos y altos se atienden de inmediato (guardia); para el resto el
      // SLA empieza a contar en horario laboral.
      const urgent = priority === 'critical' || priority === 'high';
      let dueDate = (urgent ? createdAt : nextBusinessTime(createdAt)) + slaHours * HOUR;

      const assignAt = (urgent ? createdAt : nextBusinessTime(createdAt)) + randInt(3, urgent ? 15 : 40) * MIN;
      const assignee = weighted(analysts.map((a) => [a, a.load]));

      // Tiempo hasta la solucion como fraccion del SLA: la mayoria cierra a
      // tiempo (~90%) y una cola larga lo incumple.
      let resolveHours = slaHours * logNormal(0.42, 0.62);
      if (rand() < 0.05) resolveHours *= randInt(2, 5); // casos complicados (refacciones, proveedor)
      let closedAt = assignAt + Math.max(resolveHours, 0.25) * HOUR;

      const escalated = (priority === 'critical' || priority === 'high') && rand() < 0.18;
      const onHold = !escalated && rand() < 0.14;

      const t = {
        title: `${title} - ${area}`,
        description: `${description} Área: ${area}.`,
        priority, createdAt, creator,
        assignee: null, assignAt: null,
        escalatedTo: null, escalateAt: null,
        status: 'open', closedAt: null, resolution: null, events: [],
      };

      t.events.push({ at: createdAt, by: creator, action: 'created',
        comment: `Ticket creado con prioridad ${priority}` });

      if (assignAt <= now) {
        t.assignee = assignee;
        t.assignAt = assignAt;
        t.status = 'in_progress';
        t.events.push({ at: assignAt, by: creator, action: 'assigned',
          field: 'assigned_to', newValue: assignee.fullName });
        t.events.push({ at: assignAt + randInt(1, 15) * MIN, by: assignee, action: 'status_changed',
          field: 'status', oldValue: 'open', newValue: 'in_progress' });
      }

      if (t.assignee && rand() < 0.45) {
        const at = t.assignAt + (Math.min(closedAt, now) - t.assignAt) * rand() * 0.6;
        if (at < now) t.events.push({ at, by: t.assignee, action: 'comment_added', comment: pick(COMMENTS) });
      }

      if (t.assignee && escalated && lead) {
        const at = t.assignAt + (closedAt - t.assignAt) * 0.35;
        if (at <= now) {
          t.escalatedTo = lead;
          t.escalateAt = at;
          t.status = 'escalated';
          t.events.push({ at, by: t.assignee, action: 'escalated', field: 'escalated_to',
            newValue: lead.fullName,
            comment: pick(['Requiere permisos de administración de infraestructura.',
              'Afecta a varias áreas; se requiere coordinación con el proveedor.',
              'No se resolvió en el primer nivel; se escala a líder de soporte.']) });
          closedAt += logNormal(1.5, 0.5) * HOUR;
        }
      }

      if (t.assignee && onHold) {
        const at = t.assignAt + (closedAt - t.assignAt) * 0.3;
        if (at <= now) {
          t.status = 'on_hold';
          t.events.push({ at, by: t.assignee, action: 'status_changed', field: 'status',
            oldValue: 'in_progress', newValue: 'on_hold', comment: 'En espera de respuesta del usuario.' });
          // Pendiente de refaccion, proveedor o usuario: el SLA se pausa mientras espera.
          const hold = logNormal(90, 0.5) * HOUR;
          closedAt += hold;
          dueDate += hold;
        }
      }

      t.dueDate = dueDate;
      if (t.assignee && closedAt <= now) {
        const previous = t.status;
        t.status = 'closed';
        t.closedAt = closedAt;
        t.closedBy = t.escalatedTo || t.assignee;
        t.resolution = pick(resolutions);
        t.events.push({ at: closedAt, by: t.closedBy, action: 'closed', field: 'status',
          oldValue: previous, newValue: 'closed', comment: t.resolution });
      }

      t.updatedAt = Math.max(...t.events.map((e) => e.at));
      tickets.push(t);
    }
  }
  tickets.sort((a, b) => a.createdAt - b.createdAt);
  return tickets;
}

/** Valor de los KPIs escalares en un instante dado (para el historico). */
function scalarAt(key, tickets, at) {
  const existing = tickets.filter((t) => t.createdAt <= at);
  const openAt = existing.filter((t) => !t.closedAt || t.closedAt > at);
  switch (key) {
    case 'abiertos': return openAt.length;
    case 'criticos': return openAt.filter((t) => t.priority === 'critical').length;
    case 'vencidos': return openAt.filter((t) => t.dueDate < at).length;
    case 'sin_asignar': return openAt.filter((t) => !t.assignAt || t.assignAt > at).length;
    case 'sla':
    case 'mttr': {
      const closed = existing.filter((t) => t.closedAt && t.closedAt <= at && t.closedAt >= at - 30 * 24 * HOUR);
      if (!closed.length) return null;
      if (key === 'sla') {
        return Math.round(1000 * closed.filter((t) => t.closedAt <= t.dueDate).length / closed.length) / 10;
      }
      const avg = closed.reduce((s, t) => s + (t.closedAt - t.createdAt), 0) / closed.length / HOUR;
      return Math.round(avg * 10) / 10;
    }
    default: return null;
  }
}

function conditionMet(type, value, limit) {
  if (value === null || value === undefined) return false;
  if (type === 'greater_than') return value > limit;
  if (type === 'less_than') return value < limit;
  return false;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

function run() {
  const db = initDb();
  applySchema(db);
  const now = Date.now();

  const existingTickets = db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c;
  if (existingTickets > 0 && !args.has('--reset')) {
    console.error(`[seed] Ya hay ${existingTickets} tickets. Use --reset para reemplazar los datos operativos.`);
    process.exitCode = 1;
    return;
  }

  const roleId = Object.fromEntries(db.prepare('SELECT id, name FROM roles').all().map((r) => [r.name, r.id]));
  const passwordHash = bcrypt.hashSync(SEED_PASSWORD, Number(process.env.BCRYPT_ROUNDS) || 12);

  const summary = db.transaction(() => {
    if (args.has('--reset')) {
      for (const table of ['ticket_history', 'tickets', 'alerts', 'thresholds',
        'kpi_snapshots', 'kpi_history', 'kpis', 'audit_logs']) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      db.prepare(`DELETE FROM sqlite_sequence WHERE name IN
        ('ticket_history','tickets','alerts','thresholds','kpi_snapshots','kpi_history','kpis','audit_logs')`).run();
    }

    // --- Usuarios -------------------------------------------------------
    let admin = db.prepare(`SELECT u.id, u.username, u.full_name FROM users u
      JOIN roles r ON r.id = u.role_id WHERE r.name = 'SIO_Admin' AND u.is_active = 1
      ORDER BY u.id LIMIT 1`).get();
    if (!admin) {
      const info = db.prepare(`INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password)
        VALUES ('admin', 'admin@empresa.com', 'Administrador del sistema', ?, ?, 1)`).run(passwordHash, roleId.SIO_Admin);
      admin = { id: Number(info.lastInsertRowid), username: 'admin', full_name: 'Administrador del sistema' };
    }

    const insUser = db.prepare(`INSERT OR IGNORE INTO users
      (username, email, full_name, password_hash, role_id, is_active, must_change_password, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, ?)`);
    const staff = [{ id: admin.id, username: admin.username, fullName: admin.full_name, load: 0 }];
    for (const member of TEAM) {
      insUser.run(member.username, `${member.username}@empresa.com`, member.fullName, passwordHash,
        roleId[member.role], sqlDate(now - (DAYS + 30) * 24 * HOUR));
      const row = db.prepare('SELECT id, full_name FROM users WHERE username = ?').get(member.username);
      staff.push({ ...member, id: row.id, fullName: row.full_name });
    }

    // --- Tickets --------------------------------------------------------
    const tickets = buildTickets(now, staff);
    const insTicket = db.prepare(`INSERT INTO tickets
      (title, description, priority, status, assigned_to, escalated_to, escalation_level, due_date,
       created_by, created_at, updated_at, closed_at, closed_by, resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insHistory = db.prepare(`INSERT INTO ticket_history
      (ticket_id, changed_by, action, field_name, old_value, new_value, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insAudit = db.prepare(`INSERT INTO audit_logs
      (user_id, username, action, entity_type, entity_id, http_method, endpoint, status_code,
       ip_address, user_agent, new_values, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ?, ?)`);
    const ipOf = (user) => `10.20.${(user.id % 5) + 1}.${20 + user.id}`;

    const AUDIT_ACTION = {
      created: ['ticket.create', 'POST', ''],
      assigned: ['ticket.assign', 'POST', '/assign'],
      status_changed: ['ticket.status', 'PATCH', '/status'],
      escalated: ['ticket.escalate', 'POST', '/escalate'],
      comment_added: ['ticket.comment', 'POST', '/comments'],
      closed: ['ticket.closed', 'PATCH', '/status'],
    };

    for (const t of tickets) {
      const info = insTicket.run(
        t.title, t.description, t.priority, t.status,
        t.assignee?.id ?? null, t.escalatedTo?.id ?? null, t.escalatedTo ? 1 : 0,
        sqlDate(t.dueDate), t.creator.id, sqlDate(t.createdAt), sqlDate(t.updatedAt),
        t.closedAt ? sqlDate(t.closedAt) : null, t.closedBy?.id ?? null, t.resolution
      );
      t.id = Number(info.lastInsertRowid);
      for (const e of t.events.sort((a, b) => a.at - b.at)) {
        insHistory.run(t.id, e.by.id, e.action, e.field ?? null, e.oldValue ?? null,
          e.newValue ?? null, e.comment ?? null, sqlDate(e.at));
        const [action, method, suffix] = AUDIT_ACTION[e.action];
        insAudit.run(e.by.id, e.by.username, action, 'ticket', String(t.id), method,
          `/api/tickets${e.action === 'created' ? '' : `/${t.id}${suffix}`}`,
          e.action === 'created' || e.action === 'comment_added' ? 201 : 200,
          ipOf(e.by), e.action === 'created' ? JSON.stringify({ priority: t.priority }) : null,
          sqlDate(e.at));
      }
    }

    // Inicios de sesion diarios del equipo (dias laborales).
    for (let day = DAYS; day >= 0; day -= 1) {
      const t0 = now - day * 24 * HOUR;
      const local = new Date(t0 + UTC_OFFSET_HOURS * HOUR);
      if ([0, 6].includes(local.getUTCDay())) continue;
      local.setUTCHours(8, 0, 0, 0);
      const start = local.getTime() - UTC_OFFSET_HOURS * HOUR;
      for (const user of staff) {
        if (user.role === 'SIO_Consulta' && rand() < 0.6) continue;
        if (user.role === 'SIO_Auditoria' && rand() < 0.85) continue;
        const at = start + randInt(0, 70) * MIN;
        if (at > now) continue;
        insAudit.run(user.id, user.username, 'auth.login', 'user', String(user.id), 'POST',
          '/api/auth/login', 200, ipOf(user), null, sqlDate(at));
      }
    }

    // --- KPIs, umbrales, historico y alertas ----------------------------
    const insKpi = db.prepare(`INSERT INTO kpis
      (name, description, sql_query, data_source, refresh_interval, max_rows, timeout_seconds,
       widget_type, value_column, label_column, is_active, created_by, created_at)
      VALUES (?, ?, ?, 'SIO - Mesa de ayuda', ?, 1000, 15, ?, ?, ?, 1, ?, ?)`);
    const insThreshold = db.prepare(`INSERT INTO thresholds
      (kpi_id, name, condition_type, threshold_value, severity, cooldown_minutes,
       auto_create_ticket, is_active, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`);
    const insHistoryPoint = db.prepare('INSERT INTO kpi_history (kpi_id, value, recorded_at) VALUES (?, ?, ?)');
    const insAlert = db.prepare(`INSERT INTO alerts
      (kpi_id, threshold_id, severity, current_value, message, triggered_at, status,
       occurrence_count, last_seen_at, acknowledged_by, acknowledged_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const lead = staff.find((u) => u.lead) || staff[0];
    const kpiCreatedAt = sqlDate(now - (DAYS + 7) * 24 * HOUR);
    let alertCount = 0;
    let historyCount = 0;

    for (const k of KPIS) {
      const info = insKpi.run(k.name, k.description, k.sql.replace(/\s+\n/g, '\n'), k.refresh,
        k.widgetType, k.valueColumn ?? null, k.labelColumn ?? null, admin.id, kpiCreatedAt);
      const kpiId = Number(info.lastInsertRowid);

      // Historico: un punto cada 6 horas de los ultimos 30 dias.
      const points = [];
      for (let at = now - 30 * 24 * HOUR; at <= now; at += 6 * HOUR) {
        const value = scalarAt(k.key, tickets, at);
        if (value === null) continue;
        points.push([at, value]);
        insHistoryPoint.run(kpiId, value, sqlDate(at));
        historyCount += 1;
      }

      for (const [name, type, limit, severity, cooldown] of k.thresholds || []) {
        const thrInfo = insThreshold.run(kpiId, name, type, limit, severity, cooldown, admin.id, kpiCreatedAt);
        const thresholdId = Number(thrInfo.lastInsertRowid);
        const op = type === 'greater_than' ? 'mayor que' : 'menor que';

        // Alertas que el monitor habria generado con ese historico.
        let open = null;
        for (const [at, value] of points) {
          const met = conditionMet(type, value, limit);
          if (met && !open) {
            open = { at, value, count: 1, last: at };
          } else if (met && open) {
            open.count += 1;
            open.last = at;
            open.value = value;
          } else if (!met && open) {
            const ackAt = open.at + randInt(10, 90) * MIN;
            insAlert.run(kpiId, thresholdId, severity, open.value,
              `${k.name}: ${open.value} (${op} ${limit})`, sqlDate(open.at), 'resolved',
              open.count, sqlDate(open.last), lead.id, sqlDate(ackAt), sqlDate(at));
            alertCount += 1;
            open = null;
          }
        }
        if (open) {
          const acknowledged = now - open.at > 2 * HOUR;
          insAlert.run(kpiId, thresholdId, severity, open.value,
            `${k.name}: ${open.value} (${op} ${limit})`, sqlDate(open.at),
            acknowledged ? 'acknowledged' : 'open', open.count, sqlDate(open.last),
            acknowledged ? lead.id : null, acknowledged ? sqlDate(open.at + 45 * MIN) : null, null);
          alertCount += 1;
          db.prepare('UPDATE thresholds SET last_triggered_at = ? WHERE id = ?')
            .run(sqlDate(open.at), thresholdId);
        }
      }
    }

    // --- Configuracion --------------------------------------------------
    const insConfig = db.prepare(`INSERT INTO system_config (key_name, value, value_type, description, is_secret, updated_by)
      VALUES (?, ?, ?, ?, 0, ?)
      ON CONFLICT(key_name) DO UPDATE SET value = excluded.value, description = excluded.description`);
    for (const [key, value, type, desc] of [
      ['empresa_nombre', 'Mesa de Ayuda TI', 'string', 'Nombre que aparece en reportes y correos'],
      ['sla_horas_critica', '4', 'int', 'Horas compromiso para tickets de prioridad crítica'],
      ['sla_horas_alta', '8', 'int', 'Horas compromiso para tickets de prioridad alta'],
      ['sla_horas_media', '24', 'int', 'Horas compromiso para tickets de prioridad media'],
      ['sla_horas_baja', '72', 'int', 'Horas compromiso para tickets de prioridad baja'],
      ['meta_cumplimiento_sla', '85', 'int', 'Porcentaje mínimo de cumplimiento de SLA'],
      ['horario_soporte', '{"dias":"lun-vie","inicio":"08:00","fin":"19:00","zona":"America/Mexico_City"}',
        'json', 'Horario de atención de la mesa de ayuda'],
    ]) {
      insConfig.run(key, value, type, desc, admin.id);
    }

    const byStatus = {};
    tickets.forEach((t) => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    return { users: staff.length, tickets: tickets.length, byStatus, kpis: KPIS.length, alertCount, historyCount };
  })();

  console.log('[seed] Escenario operativo cargado:');
  console.log(`  - Personal: ${summary.users} usuarios (contraseña inicial: ${process.env.SEED_PASSWORD ? 'SEED_PASSWORD' : SEED_PASSWORD}, cambio obligatorio)`);
  console.log(`  - Tickets: ${summary.tickets} en ${DAYS} días ->`,
    Object.entries(summary.byStatus).map(([s, n]) => `${s}: ${n}`).join(', '));
  console.log(`  - KPIs: ${summary.kpis}, puntos de histórico: ${summary.historyCount}, alertas: ${summary.alertCount}`);
}

try {
  run();
} catch (err) {
  console.error('[seed] Error:', err.message);
  process.exitCode = 1;
} finally {
  closeAll();
}
