'use strict';
const ThresholdModel = require('../models/ThresholdModel');
const AlertModel = require('../models/AlertModel');
const KpiModel = require('../models/KpiModel');
const AuditLogModel = require('../models/AuditLogModel');
const kpiService = require('./kpiService');
const emailService = require('./emailService');

/**
 * Evalua una condicion contra un valor. Devuelve true si la condicion
 * se cumple, es decir, si hay que alertar.
 */
function evaluate(threshold, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return false;
  const v = Number(value);
  const target = Number(threshold.threshold_value);
  const min = Number(threshold.threshold_min);
  const max = Number(threshold.threshold_max);

  switch (threshold.condition_type) {
    case 'greater_than': return v > target;
    case 'less_than':    return v < target;
    case 'equals':       return v === target;
    case 'not_equals':   return v !== target;
    case 'between':      return v >= min && v <= max;   // alerta al entrar al rango
    case 'outside':      return v < min || v > max;     // alerta al salir del rango
    default:             return false;
  }
}

function describe(threshold, value) {
  const t = threshold;
  const texts = {
    greater_than: `mayor que ${t.threshold_value}`,
    less_than: `menor que ${t.threshold_value}`,
    equals: `igual a ${t.threshold_value}`,
    not_equals: `distinto de ${t.threshold_value}`,
    between: `dentro del rango ${t.threshold_min} a ${t.threshold_max}`,
    outside: `fuera del rango ${t.threshold_min} a ${t.threshold_max}`,
  };
  return `${t.kpi_name} tiene el valor ${value}, ${texts[t.condition_type] || 'fuera de lo esperado'} (umbral "${t.name}")`;
}

/** El cooldown evita abrir la misma alerta cada vez que corre el monitor. */
function inCooldown(threshold) {
  if (!threshold.last_triggered_at) return false;
  const minutes = Number(threshold.cooldown_minutes) || 0;
  if (minutes <= 0) return false;
  const elapsed = Date.now() - new Date(threshold.last_triggered_at).getTime();
  return elapsed < minutes * 60 * 1000;
}

/**
 * Evalua todos los umbrales de un KPI contra un valor ya calculado.
 * @returns {{triggered: Array, resolved: Array}}
 */
async function evaluateThresholds(kpi, value, thresholds) {
  const list = thresholds || await ThresholdModel.findByKpi(kpi.id);
  const triggered = [];
  const resolved = [];

  for (const threshold of list) {
    if (!threshold.is_active) continue;

    const breached = evaluate(threshold, value);
    const openAlert = await AlertModel.findOpenByThreshold(threshold.id);

    if (!breached) {
      // El KPI volvio a la normalidad: se cierran las alertas abiertas.
      if (openAlert) {
        const ids = await AlertModel.autoResolve(threshold.id);
        resolved.push(...ids);
      }
      continue;
    }

    if (openAlert) {
      // Ya hay una alerta viva: solo se cuenta la reincidencia.
      await AlertModel.touch(openAlert.id, value);
      continue;
    }

    if (inCooldown(threshold)) continue;

    try {
      const alert = await AlertModel.create({
        thresholdId: threshold.id,
        kpiId: kpi.id,
        currentValue: value,
        message: describe(threshold, value),
        severity: threshold.severity,
      });
      await ThresholdModel.markTriggered(threshold.id);
      triggered.push(alert);

      await AuditLogModel.write({
        action: 'alert.triggered', entityType: 'alert', entityId: alert.id,
        newValues: { kpi: kpi.name, threshold: threshold.name, value, severity: threshold.severity },
      });

      if (threshold.notify_emails) {
        await emailService.sendAlertNotification(alert, threshold, threshold.notify_emails);
      }

      if (threshold.auto_create_ticket) {
        await createTicketForAlert(alert, threshold);
      }
    } catch (err) {
      // El indice unico puede rechazar la insercion si otra instancia
      // del monitor gano la carrera. No es un error real.
      if (err.number === 2601 || err.number === 2627) continue;
      console.error('[alert] fallo al crear la alerta:', err.message);
    }
  }

  return { triggered, resolved };
}

/** Se importa aqui para evitar un ciclo de dependencias con ticketService. */
async function createTicketForAlert(alert, threshold) {
  const TicketModel = require('../models/TicketModel');
  const UserModel = require('../models/UserModel');
  try {
    const system = await UserModel.list({ limit: 1, isActive: 'true' });
    const creatorId = system.data[0]?.id;
    if (!creatorId) return null;

    const ticket = await TicketModel.create({
      title: `${alert.kpi_name}: ${threshold.name}`,
      description: alert.message,
      alertId: alert.id,
      priority: alert.severity,
      assignedTo: null,
    }, creatorId);

    await AuditLogModel.write({
      action: 'ticket.auto_created', entityType: 'ticket', entityId: ticket.id,
      newValues: { alertId: alert.id, severity: alert.severity },
    });
    return ticket;
  } catch (err) {
    if (err.number === 2601 || err.number === 2627) return null; // ya existia
    console.error('[alert] no se pudo crear el ticket automatico:', err.message);
    return null;
  }
}

/**
 * Ciclo completo del monitor: ejecuta cada KPI activo con umbrales y
 * evalua sus condiciones. Un KPI que falla no detiene a los demas.
 */
async function runMonitorCycle() {
  const startedAt = Date.now();
  const thresholds = await ThresholdModel.findActive();
  if (!thresholds.length) return { kpis: 0, triggered: 0, resolved: 0, durationMs: 0 };

  const byKpi = new Map();
  for (const t of thresholds) {
    if (!byKpi.has(t.kpi_id)) byKpi.set(t.kpi_id, []);
    byKpi.get(t.kpi_id).push(t);
  }

  let triggered = 0;
  let resolved = 0;
  let failed = 0;

  for (const [kpiId, list] of byKpi) {
    try {
      const kpi = await KpiModel.findById(kpiId);
      if (!kpi || !kpi.is_active) continue;

      const result = await kpiService.runKpi(kpi, { force: true, persist: true });
      const value = result.scalar;
      if (value === null) continue;

      const outcome = await evaluateThresholds(kpi, value, list);
      triggered += outcome.triggered.length;
      resolved += outcome.resolved.length;
    } catch (err) {
      failed += 1;
      console.error(`[monitor] KPI ${kpiId} fallo:`, err.message);
    }
  }

  return {
    kpis: byKpi.size, triggered, resolved, failed, durationMs: Date.now() - startedAt,
  };
}

module.exports = { evaluate, describe, evaluateThresholds, runMonitorCycle };
