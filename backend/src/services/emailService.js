const { Resend } = require('resend');
const env = require('../config/env');
let resend = null;
function client() {
  if (!resend && env.resend.apiKey) resend = new Resend(env.resend.apiKey);
  return resend;
}
async function sendEmail({ to, subject, html }) {
  if (!env.resend.apiKey || env.nodeEnv === 'test') { console.log(`[email:mock] ${to} | ${subject}`); return; }
  try { await client().emails.send({ from:`${env.resend.fromName} <${env.resend.from}>`,to,subject,html }); }
  catch(e) { console.error('[email]',e.message); }
}
module.exports = { sendEmail };
