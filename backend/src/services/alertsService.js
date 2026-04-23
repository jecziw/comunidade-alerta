const { pool } = require('../db');

async function listAlerts() {
  const { rows } = await pool.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20');
  return rows;
}

async function createAlert(payload) {
  const query = `
    INSERT INTO alerts (title, description, neighborhood, severity, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const values = [
    payload.title,
    payload.description || '',
    payload.neighborhood,
    payload.severity,
    payload.status
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function getStats() {
  const [totalResult, criticalResult, neighborhoodsResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM alerts'),
    pool.query("SELECT COUNT(*)::int AS total FROM alerts WHERE severity = 'critical'"),
    pool.query('SELECT COUNT(DISTINCT neighborhood)::int AS total FROM alerts')
  ]);

  return {
    totalAlerts: totalResult.rows[0].total,
    criticalAlerts: criticalResult.rows[0].total,
    neighborhoods: neighborhoodsResult.rows[0].total,
    updatedAt: new Date().toISOString()
  };
}

module.exports = { listAlerts, createAlert, getStats };
