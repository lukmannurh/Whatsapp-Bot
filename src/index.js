const log = require('./lib/log');
const { init: initDb } = require('./lib/db');
const { createClient } = require('./bot');
const { createServer } = require('./server');

(async () => {
  try {
    await initDb();

    const client = createClient();
    const { server } = createServer();

    await client.initialize();

    const shutdown = async (signal) => {
      log.warn({ signal }, 'Shutting down...');
      try { await client.destroy(); } catch (_) {}
      try { server.close(); } catch (_) {}
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    log.error({ err }, 'Fatal error on startup');
    process.exit(1);
  }
})();
