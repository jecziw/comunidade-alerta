const { pool } = require('../db');
const env = require('../config/env');
exports.getVapidKey = (_,res) => res.json({ publicKey: env.vapid.publicKey });
exports.subscribe = async (req,res) => {
  if (!req.body.subscription) return res.status(400).json({ error: 'subscription obrigatório.' });
  await pool.query('UPDATE users SET push_subscription=$1 WHERE id=$2',[JSON.stringify(req.body.subscription),req.user.id]);
  res.json({ message: 'Push subscription salva.' });
};
