const webpush = require('web-push');
const { pool } = require('../db');
const env = require('../config/env');
if (env.vapid.publicKey && env.vapid.privateKey) {
  try { webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey); }
  catch (e) { console.error('[push] VAPID inválido — push desativado:', e.message); }
}
async function sendPush(subscription, payload) {
  try { await webpush.sendNotification(subscription, JSON.stringify(payload)); }
  catch(e) { if (e.statusCode===410) await pool.query('UPDATE users SET push_subscription=NULL WHERE push_subscription::text LIKE $1',[`%${subscription.endpoint}%`]); }
}
async function notifyTenantUsers(tenantId, payload) {
  const { rows } = await pool.query('SELECT push_subscription FROM users WHERE tenant_id=$1 AND push_subscription IS NOT NULL AND is_active=true',[tenantId]);
  await Promise.allSettled(rows.map(u => sendPush(u.push_subscription, payload)));
}
async function notifyPublicSubscribers(payload) {
  try {
    const { rows } = await pool.query('SELECT endpoint, subscription FROM public_subscriptions');
    await Promise.allSettled(rows.map(async r => {
      try { await webpush.sendNotification(r.subscription, JSON.stringify(payload)); }
      catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404)
          await pool.query('DELETE FROM public_subscriptions WHERE endpoint=$1', [r.endpoint]);
      }
    }));
  } catch (e) { console.error('[push] notifyPublicSubscribers:', e.message); }
}
module.exports = { sendPush, notifyTenantUsers, notifyPublicSubscribers };
