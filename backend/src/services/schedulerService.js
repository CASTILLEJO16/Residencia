'use strict';
const cron = require('node-cron');
const config = require('../config/env');
const alertService = require('./alertService');
const { query } = require('../config/database');

const jobs = [];
let monitorRunning = false;
let lastRun = null;

/**
 * Un solo ciclo a la vez: si el anterior sigue corriendo se salta el turno.
 * Sin esto, un KPI lento acumula ejecuciones solapadas.
 */
async function monitorTick() {
  if (monitorRunning) {
    console.warn('[monitor] el ciclo anterior sigue en curso, se omite este turno');
    return;
  }
  monitorRunning = true;
  try {
    const result = await alertService.runMonitorCycle();
    lastRun = { at: new Date().toISOString(), ...result };
    if (result.triggered || result.resolved || result.failed) {
      console.log(`[monitor] ${result.kpis} KPI(s) | ${result.triggered} alertas nuevas | ` +
        `${result.resolved} resueltas | ${result.failed} con error | ${result.durationMs}ms`);
    }
  } catch (err) {
    console.error('[monitor] error en el ciclo:', err.message);
  } finally {
    monitorRunning = false;
  }
}

async function purgeTick() {
  try {
    // Purgar historicos de KPIs mayores a 90 dias
    await query(`DELETE FROM kpi_history WHERE recorded_at < datetime('now') - '+90 days'`);
    // Purgar snapshots mayores a 7 dias
    await query(`DELETE FROM kpi_snapshots WHERE duration_ms < datetime('now') - '+7 days'`);
    // Purgar alertas resueltas mayores a 30 dias
    await query(`DELETE FROM alerts WHERE status = 'resolved' AND resolved_at < datetime('now') - '+30 days'`);
    // Purgar tickets cerrados mayores a 180 dias
    await query(`DELETE FROM tickets WHERE status = 'closed' AND closed_at < datetime('now') - '+180 days'`);
    console.log('[purga] historicos depurados');
  } catch (err) {
    console.error('[purga] fallo:', err.message);
  }
}

function start() {
  if (!config.monitor.enabled) {
    console.log('[monitor] deshabilitado por configuracion');
    return;
  }
  if (!cron.validate(config.monitor.cron)) {
    console.error(`[monitor] expresion cron invalida: ${config.monitor.cron}`);
    return;
  }

  jobs.push(cron.schedule(config.monitor.cron, monitorTick));
  console.log(`[monitor] activo con la programacion "${config.monitor.cron}"`);

  if (cron.validate(config.monitor.purgeCron)) {
    jobs.push(cron.schedule(config.monitor.purgeCron, purgeTick));
    console.log(`[purga] programada con "${config.monitor.purgeCron}"`);
  }
}

function stop() {
  jobs.forEach((job) => job.stop());
  jobs.length = 0;
}

function status() {
  return {
    enabled: config.monitor.enabled,
    cron: config.monitor.cron,
    running: monitorRunning,
    lastRun,
  };
}

module.exports = { start, stop, status, monitorTick };
