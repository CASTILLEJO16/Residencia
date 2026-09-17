'use strict';
const app = require('./app');
const config = require('./config/env');
const { getPool, closeAll } = require('./config/database');
const scheduler = require('./services/schedulerService');

async function start() {
  try {
    await getPool();
    console.log(`[db] conectado a ${config.db.database}@${config.db.server}`);
  } catch (err) {
    console.error('[db] no se pudo conectar:', err.message);
    process.exit(1);
  }

  scheduler.start();

  const server = app.listen(config.port, () => {
    console.log(`[api] SIO escuchando en http://localhost:${config.port} (${config.env})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[api] ${signal} recibido, cerrando...`);
    scheduler.stop();
    server.close(async () => {
      await closeAll();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[api] promesa no capturada:', reason);
  });
}

start();
