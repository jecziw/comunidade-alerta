const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.db.connectionString,
  ssl: env.db.ssl,
  max: env.db.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => console.error('[db] Pool error:', err));

async function initDb() {
  const client = await pool.connect();
  try {
    console.log('[db] Conectado ao PostgreSQL');
  } catch (err) {
    console.error('[db] Erro na inicialização:', err);
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
