'use strict';
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');

/**
 * Los reportes se generan en el servidor, no en el navegador: un reporte
 * de varios miles de filas congela la pestana del usuario si se arma con
 * jsPDF o xlsx del lado del cliente.
 */

const DEFINITIONS = {
  kpi_history: {
    title: 'Historico de KPIs',
    columns: [
      { key: 'kpi_name', header: 'KPI', width: 30 },
      { key: 'recorded_at', header: 'Fecha', width: 20, type: 'datetime' },
      { key: 'value', header: 'Valor', width: 16, type: 'number' },
    ],
    async fetch(params) {
      const kpiId = params.kpiId ? Number(params.kpiId) : null;
      const [from, to] = dateParams(params);
      const limit = limitOf(params);
      const result = await query(
        `SELECT k.name AS kpi_name, h.recorded_at, h.value
         FROM kpi_history h
         INNER JOIN kpis k ON k.id = h.kpi_id
         WHERE (? IS NULL OR h.kpi_id = ?)
           AND (? IS NULL OR h.recorded_at >= ?)
           AND (? IS NULL OR h.recorded_at <= ?)
         ORDER BY h.recorded_at DESC
         LIMIT ?`,
        [kpiId, kpiId, from, from, to, to, limit]);
      return result.recordset;
    },
  },

  alerts: {
    title: 'Alertas',
    columns: [
      { key: 'id', header: 'Id', width: 8 },
      { key: 'kpi_name', header: 'KPI', width: 26 },
      { key: 'threshold_name', header: 'Umbral', width: 24 },
      { key: 'severity', header: 'Severidad', width: 12 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'current_value', header: 'Valor', width: 14, type: 'number' },
      { key: 'occurrence_count', header: 'Repeticiones', width: 13, type: 'number' },
      { key: 'triggered_at', header: 'Detectada', width: 20, type: 'datetime' },
      { key: 'resolved_at', header: 'Resuelta', width: 20, type: 'datetime' },
      { key: 'acknowledged_by_name', header: 'Atendida por', width: 24 },
    ],
    async fetch(params) {
      const severity = params.severity || null;
      const status = params.status || null;
      const kpiId = params.kpiId ? Number(params.kpiId) : null;
      const [from, to] = dateParams(params);
      const limit = limitOf(params);
      const result = await query(
        `SELECT a.id, k.name AS kpi_name, t.name AS threshold_name,
                a.severity, a.status, a.current_value, a.occurrence_count,
                a.triggered_at, a.resolved_at, u.full_name AS acknowledged_by_name
         FROM alerts a
         INNER JOIN kpis k       ON k.id = a.kpi_id
         INNER JOIN thresholds t ON t.id = a.threshold_id
         LEFT  JOIN users u      ON u.id = a.acknowledged_by
         WHERE (? IS NULL OR a.severity = ?)
           AND (? IS NULL OR a.status = ?)
           AND (? IS NULL OR a.kpi_id = ?)
           AND (? IS NULL OR a.triggered_at >= ?)
           AND (? IS NULL OR a.triggered_at <= ?)
         ORDER BY a.triggered_at DESC
         LIMIT ?`,
        [severity, severity, status, status, kpiId, kpiId, from, from, to, to, limit]);
      return result.recordset;
    },
  },

  incidents: {
    title: 'Incidentes',
    columns: [
      { key: 'ticket_number', header: 'Ticket', width: 12 },
      { key: 'title', header: 'Titulo', width: 40 },
      { key: 'priority', header: 'Prioridad', width: 12 },
      { key: 'status', header: 'Estado', width: 14 },
      { key: 'assigned_to_name', header: 'Asignado a', width: 24 },
      { key: 'created_by_name', header: 'Creado por', width: 24 },
      { key: 'created_at', header: 'Creado', width: 20, type: 'datetime' },
      { key: 'closed_at', header: 'Cerrado', width: 20, type: 'datetime' },
      { key: 'hours_to_close', header: 'Horas para cerrar', width: 18, type: 'number' },
    ],
    async fetch(params) {
      const status = params.status || null;
      const priority = params.priority || null;
      const assignedTo = params.assignedTo ? Number(params.assignedTo) : null;
      const [from, to] = dateParams(params);
      const limit = limitOf(params);
      const result = await query(
        `SELECT t.ticket_number, t.title, t.priority, t.status,
                asg.full_name AS assigned_to_name, crt.full_name AS created_by_name,
                t.created_at, t.closed_at,
                CASE WHEN t.closed_at IS NOT NULL
                     THEN (julianday(t.closed_at) - julianday(t.created_at)) * 24
                     END AS hours_to_close
         FROM tickets t
         LEFT JOIN users asg ON asg.id = t.assigned_to
         LEFT JOIN users crt ON crt.id = t.created_by
         WHERE (? IS NULL OR t.status = ?)
           AND (? IS NULL OR t.priority = ?)
           AND (? IS NULL OR t.assigned_to = ?)
           AND (? IS NULL OR t.created_at >= ?)
           AND (? IS NULL OR t.created_at <= ?)
         ORDER BY t.created_at DESC
         LIMIT ?`,
        [status, status, priority, priority, assignedTo, assignedTo, from, from, to, to, limit]);
      return result.recordset;
    },
  },

  audit: {
    title: 'Auditoria',
    columns: [
      { key: 'created_at', header: 'Fecha', width: 20, type: 'datetime' },
      { key: 'username', header: 'Usuario', width: 20 },
      { key: 'action', header: 'Accion', width: 26 },
      { key: 'entity_type', header: 'Entidad', width: 14 },
      { key: 'entity_id', header: 'Id', width: 10 },
      { key: 'ip_address', header: 'IP', width: 16 },
      { key: 'status_code', header: 'HTTP', width: 8, type: 'number' },
    ],
    async fetch(params) {
      const userId = params.userId ? Number(params.userId) : null;
      const action = params.action || null;
      const entityType = params.entityType || null;
      const [from, to] = dateParams(params);
      const limit = limitOf(params);
      const result = await query(
        `SELECT a.created_at, a.username, a.action, a.entity_type,
                a.entity_id, a.ip_address, a.status_code
         FROM audit_logs a
         WHERE (? IS NULL OR a.user_id = ?)
           AND (? IS NULL OR a.action = ?)
           AND (? IS NULL OR a.entity_type = ?)
           AND (? IS NULL OR a.created_at >= ?)
           AND (? IS NULL OR a.created_at <= ?)
         ORDER BY a.created_at DESC
         LIMIT ?`,
        [userId, userId, action, action, entityType, entityType, from, from, to, to, limit]);
      return result.recordset;
    },
  },
};

function dateParams(params) {
  return [
    params.from ? new Date(params.from) : null,
    params.to ? new Date(params.to) : null,
  ];
}

function limitOf(params) {
  const n = Number.parseInt(params.limit, 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 50000) : 10000;
}

function getDefinition(type) {
  return DEFINITIONS[type] || null;
}

function availableReports() {
  return Object.entries(DEFINITIONS).map(([key, def]) => ({
    key, title: def.title, columns: def.columns.map((c) => c.header),
  }));
}

async function fetchData(type, params) {
  const def = getDefinition(type);
  if (!def) return null;
  const rows = await def.fetch(params);
  return { title: def.title, columns: def.columns, rows };
}

/* ---------- exportadores ---------- */

function formatCell(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'datetime') return new Date(value).toLocaleString('es-MX');
  return value;
}

function toCsv({ columns, rows }) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => escape(c.header)).join(';')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(formatCell(row[c.key], c.type))).join(';'));
  }
  // BOM para que Excel en espanol abra los acentos correctamente.
  return '\uFEFF' + lines.join('\r\n');
}

async function toXlsx({ title, columns, rows }, filters) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIO';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31));

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5F8B' },
  };
  sheet.getRow(1).height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const record = {};
    for (const col of columns) {
      const value = row[col.key];
      record[col.key] = col.type === 'datetime' && value ? new Date(value) : value;
    }
    sheet.addRow(record);
  }

  for (const col of columns) {
    if (col.type === 'datetime') sheet.getColumn(col.key).numFmt = 'dd/mm/yyyy hh:mm';
    if (col.type === 'number') sheet.getColumn(col.key).alignment = { horizontal: 'right' };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Hoja con los filtros aplicados: sin esto un reporte exportado
  // no se puede reproducir despues.
  const meta = workbook.addWorksheet('Filtros');
  meta.columns = [{ header: 'Filtro', width: 24 }, { header: 'Valor', width: 40 }];
  meta.getRow(1).font = { bold: true };
  meta.addRow(['Reporte', title]);
  meta.addRow(['Generado', new Date().toLocaleString('es-MX')]);
  meta.addRow(['Registros', rows.length]);
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && value !== '') meta.addRow([key, String(value)]);
  }

  return workbook.xlsx.writeBuffer();
}

function toPdf({ title, columns, rows }, filters) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalWidth = columns.reduce((sum, c) => sum + (c.width || 18), 0);
    const widths = columns.map((c) => ((c.width || 18) / totalWidth) * pageWidth);

    doc.fillColor('#16202C').fontSize(16).text(title, { continued: false });
    doc.fontSize(9).fillColor('#5A6B7C')
      .text(`Generado el ${new Date().toLocaleString('es-MX')} — ${rows.length} registro(s)`);

    const activeFilters = Object.entries(filters || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    if (activeFilters.length) doc.text(`Filtros — ${activeFilters.join('  |  ')}`);
    doc.moveDown(0.6);

    const rowHeight = 16;

    function drawHeader() {
      const y = doc.y;
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#1F5F8B');
      let x = doc.page.margins.left;
      doc.fillColor('#FFFFFF').fontSize(8);
      columns.forEach((col, i) => {
        doc.text(col.header, x + 4, y + 4, { width: widths[i] - 8, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + rowHeight;
    }

    drawHeader();

    rows.forEach((row, index) => {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (index % 2 === 1) {
        doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#F2F4F7');
      }
      let x = doc.page.margins.left;
      doc.fillColor('#16202C').fontSize(8);
      columns.forEach((col, i) => {
        doc.text(String(formatCell(row[col.key], col.type)), x + 4, y + 4, {
          width: widths[i] - 8, ellipsis: true, lineBreak: false,
        });
        x += widths[i];
      });
      doc.y = y + rowHeight;
    });

    doc.end();
  });
}

module.exports = { availableReports, getDefinition, fetchData, toCsv, toXlsx, toPdf };
