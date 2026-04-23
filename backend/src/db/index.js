const { Pool } = require('pg');
const { databaseUrl } = require('../config/env');

const pool = new Pool({ connectionString: databaseUrl });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      description TEXT,
      neighborhood VARCHAR(80) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM alerts');
  if (rows[0].total === 0) {
    await pool.query(`
      INSERT INTO alerts (title, description, neighborhood, severity, status)
      VALUES
      ('Movimento suspeito', 'Veículo circulando repetidamente na rua principal.', 'Leblon', 'medium', 'investigating'),
      ('Falha na iluminação pública', 'Poste apagado próximo à praça.', 'Jardim Botânico', 'low', 'open'),
      ('Tentativa de invasão', 'Morador relatou tentativa de entrada no condomínio.', 'Leblon', 'critical', 'open');
    `);
  }
}

module.exports = { pool, initDb };
