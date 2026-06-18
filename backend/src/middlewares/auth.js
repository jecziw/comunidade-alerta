const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../db');

async function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido.' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], env.jwt.secret);
    const { rows } = await pool.query(
      `SELECT u.*, t.plan, t.billing_status, t.alert_limit,
              t.stripe_customer_id, t.trial_ends_at, t.trial_used, t.name AS tenant_name
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user   = rows[0];
    req.tenant = { id: rows[0].tenant_id, name: rows[0].tenant_name, plan: rows[0].plan,
                   billing_status: rows[0].billing_status, alert_limit: rows[0].alert_limit,
                   stripe_customer_id: rows[0].stripe_customer_id,
                   trial_ends_at: rows[0].trial_ends_at, trial_used: rows[0].trial_used };
    next();
  } catch { return res.status(401).json({ error: 'Token inválido ou expirado.' }); }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(header.split(' ')[1], env.jwt.secret);
    const { rows } = await pool.query(
      'SELECT u.*, t.plan FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1',
      [decoded.userId]
    );
    if (rows[0]) { req.user = rows[0]; req.tenant = { id: rows[0].tenant_id, plan: rows[0].plan }; }
  } catch (_) {}
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Requer: ${roles.join(' ou ')}` });
    next();
  };
}

async function checkPlanLimit(req, res, next) {
  if (!req.tenant) return res.status(401).json({ error: 'Tenant não identificado.' });
  if (req.tenant.alert_limit === -1) return next();
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM alerts WHERE tenant_id=$1 AND created_at >= date_trunc('month',NOW())`,
    [req.tenant.id]
  );
  if (parseInt(rows[0].cnt) >= req.tenant.alert_limit)
    return res.status(429).json({ error: `Limite de ${req.tenant.alert_limit} alertas/mês atingido.`, code: 'PLAN_LIMIT_EXCEEDED' });
  next();
}

module.exports = { authenticateToken, optionalAuth, requireRole, checkPlanLimit };
