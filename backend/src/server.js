const http = require('http');
const app  = require('./app');
const { initSocketService } = require('./services/socketService');
const { initDb } = require('./db');
const env  = require('./config/env');

async function start() {
  await initDb();
  const server = http.createServer(app);
  initSocketService(server);

  if (env.externalSync) {
    const { startExternalSync } = require('./services/externalSyncJob');
    setTimeout(() => startExternalSync(), 5000);
  }

  server.listen(env.port, () => {
    console.log(`[server] Rodando na porta ${env.port} (${env.nodeEnv})`);
    console.log(`[server] Sync externo: ${env.externalSync ? 'ATIVADO' : 'DESATIVADO'}`);
  });

  const shutdown = () => {
    if (env.externalSync) {
      try { require('./services/externalSyncJob').stopExternalSync(); } catch (_) {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

start().catch(err => { console.error('[server] Falha ao inicializar:', err); process.exit(1); });
