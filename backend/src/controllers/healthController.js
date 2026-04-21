const { pool } = require('../db');

async function health(_req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch (_error) {
    res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
  }
}

module.exports = { health };
