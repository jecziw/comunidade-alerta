const app = require('./app');
const { initDb } = require('./db');
const { port } = require('./config/env');

async function bootstrap() {
  await initDb();
  app.listen(port, () => {
    console.log(`API rodando na porta ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Falha ao iniciar aplicação', error);
  process.exit(1);
});
