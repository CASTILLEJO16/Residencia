'use strict';
const KpiModel = require('../models/KpiModel');
const sqlExecutor = require('../utils/sqlExecutor');
const AppError = require('../utils/AppError');

/**
 * Convierte el resultado crudo de la consulta en la forma que espera cada
 * tipo de widget. Todo lo que el frontend necesita se decide aqui, no en
 * el navegador.
 */
function shapeResult(kpi, raw) {
  const { rows, columns } = raw;
  const numericColumns = columns.filter((c) => c.numeric).map((c) => c.name);
  const valueColumn = kpi.value_column || numericColumns[0] || columns[0]?.name;
  const labelColumn = kpi.label_column
    || columns.find((c) => !c.numeric)?.name
    || columns[0]?.name;

  const base = { widgetType: kpi.widget_type, columns, rowCount: raw.rowCount };

  switch (kpi.widget_type) {
    case 'number':
    case 'gauge': {
      const value = rows.length ? toNumber(rows[0][valueColumn]) : null;
      return { ...base, value, valueColumn };
    }

    case 'pie': {
      return {
        ...base,
        labels: rows.map((r) => String(r[labelColumn] ?? '')),
        series: rows.map((r) => toNumber(r[valueColumn]) ?? 0),
        valueColumn, labelColumn,
      };
    }

    case 'line':
    case 'bar':
    case 'area': {
      // Cada columna numerica distinta de la etiqueta es una serie.
      const seriesColumns = kpi.value_column
        ? [kpi.value_column]
        : numericColumns.filter((c) => c !== labelColumn);
      return {
        ...base,
        categories: rows.map((r) => formatCategory(r[labelColumn])),
        series: seriesColumns.map((col) => ({
          name: col,
          data: rows.map((r) => toNumber(r[col])),
        })),
        labelColumn,
      };
    }

    case 'table':
    default:
      return { ...base, rows };
  }
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatCategory(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

/**
 * Devuelve el valor escalar del KPI, que es lo que evaluan los umbrales.
 * Para un widget de serie se toma el ultimo punto de la primera serie.
 */
function extractScalar(shaped) {
  if (shaped.value !== undefined) return shaped.value;
  if (Array.isArray(shaped.series) && shaped.series.length) {
    const first = shaped.series[0];
    if (typeof first === 'number') return first;
    const data = first?.data || [];
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if (data[i] !== null && data[i] !== undefined) return data[i];
    }
  }
  if (Array.isArray(shaped.rows) && shaped.rows.length === 1) {
    const numeric = Object.values(shaped.rows[0]).find((v) => typeof v === 'number');
    return numeric ?? null;
  }
  return null;
}

/**
 * Ejecuta el KPI y guarda el resultado.
 * @param {object} kpi        registro de la tabla kpis
 * @param {boolean} force     ignora el cache
 * @param {boolean} persist   guarda historico y snapshot
 */
async function runKpi(kpi, { force = false, persist = true } = {}) {
  if (!force) {
    const cached = await KpiModel.latestSnapshot(kpi.id, kpi.refresh_interval);
    if (cached) return cached;
  }

  const raw = await sqlExecutor.execute(kpi.sql_query, {
    maxRows: kpi.max_rows,
    timeoutSeconds: kpi.timeout_seconds,
  });

  const shaped = shapeResult(kpi, raw);
  const scalar = extractScalar(shaped);
  const payload = {
    ...shaped,
    kpiId: kpi.id,
    name: kpi.name,
    scalar,
    truncated: raw.truncated,
    capturedAt: new Date().toISOString(),
    fromCache: false,
  };

  if (persist) {
    await KpiModel.saveSnapshot(kpi.id, payload, raw.rowCount, raw.durationMs);
    if (scalar !== null && Number.isFinite(scalar)) {
      await KpiModel.saveScalar(kpi.id, scalar);
    }
  }

  return { ...payload, durationMs: raw.durationMs };
}

/** Ejecuta un KPI por id. */
async function runById(id, options) {
  const kpi = await KpiModel.findById(id);
  if (!kpi) throw AppError.notFound('KPI no encontrado');
  if (!kpi.is_active) throw AppError.badRequest('El KPI esta desactivado');
  return runKpi(kpi, options);
}

/**
 * Ejecuta varios KPIs y nunca falla en bloque: si uno revienta, el resto
 * del dashboard debe seguir mostrandose.
 */
async function runMany(kpis, options) {
  const results = await Promise.allSettled(kpis.map((k) => runKpi(k, options)));
  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return { kpiId: kpis[i].id, name: kpis[i].name, ok: true, ...result.value };
    }
    return {
      kpiId: kpis[i].id,
      name: kpis[i].name,
      ok: false,
      widgetType: kpis[i].widget_type,
      error: result.reason?.message || 'Error desconocido',
    };
  });
}

module.exports = { shapeResult, extractScalar, runKpi, runById, runMany };
