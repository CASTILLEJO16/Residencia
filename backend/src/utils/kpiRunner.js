'use strict';
/**
 * Proceso aislado que ejecuta la consulta de un KPI.
 *
 * - Abre la base en modo SOLO LECTURA y con query_only: aunque la consulta
 *   burlara la validacion de texto, SQLite rechaza cualquier escritura.
 * - Corre en un proceso hijo (no en un worker_thread) porque better-sqlite3
 *   es sincrono y nativo: un hilo atascado en una consulta no se puede
 *   interrumpir, pero un proceso si se puede matar al superar el tiempo limite.
 */
const Database = require('better-sqlite3');

process.once('message', ({ dbFile, sql, limit }) => {
  let reply;
  try {
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');

    const stmt = db.prepare(sql);
    if (!stmt.reader) throw new Error('La consulta no devuelve filas');

    const rows = [];
    for (const row of stmt.iterate()) {
      rows.push(row);
      if (rows.length >= limit) break;
    }
    const columns = stmt.columns().map((c) => ({ name: c.name, type: c.type || 'unknown' }));
    db.close();
    reply = { ok: true, rows, columns };
  } catch (err) {
    reply = { ok: false, message: err.message };
  }
  process.send(reply, () => process.exit(0));
});
