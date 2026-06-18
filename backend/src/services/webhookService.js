const axios  = require('axios');
const crypto = require('crypto');
const { pool } = require('../db');
async function dispatchWebhook(tenantId, event, payload) {
  const { rows } = await pool.query(
    'SELECT * FROM webhooks WHERE tenant_id=$1 AND is_active=true AND events LIKE $2',
    [tenantId, `%${event.split('.')[0]}%`]
  );
  const body = JSON.stringify({ event, data:payload, ts:new Date().toISOString() });
  await Promise.allSettled(rows.map(async wh => {
    const headers = { 'Content-Type':'application/json' };
    if (wh.secret) headers['X-Signature'] = `sha256=${crypto.createHmac('sha256',wh.secret).update(body).digest('hex')}`;
    try { await axios.post(wh.url, body, { headers, timeout:10000 }); }
    catch(e) { await pool.query('UPDATE webhooks SET last_error=$1 WHERE id=$2',[e.message,wh.id]); }
  }));
}
module.exports = { dispatchWebhook };
