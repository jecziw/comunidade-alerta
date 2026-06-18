const webpush = require('web-push');
const { pool } = require('../db');
const env = require('../config/env');
if (env.vapid.publicKey && env.vapid.privateKey)
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
async function sendPush(subscription, payload) {
  try { await webpush.sendNotification(subscription, JSON.stringify(payload)); }
  catch(e) { if (e.statusCode===410) await pool.query('UPDATE users SET push_subscription=NULL WHERE push_subscription::text LIKE $1',[`%${subscription.endpoint}%`]); }
}
async function notifyTenantUsers(tenantId, payload) {
  const { rows } = await pool.query('SELECT push_subscription FROM users WHERE tenant_id=$1 AND push_subscription IS NOT NULL AND is_active=true',[tenantId]);
  await Promise.allSettled(rows.map(u => sendPush(u.push_subscription, payload)));
}
module.exports = { sendPush, notifyTenantUsers };
