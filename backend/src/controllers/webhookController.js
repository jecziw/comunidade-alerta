const { pool } = require('../db');
const { dispatchWebhook } = require('../services/webhookService');

// Bloqueia URLs que apontam para a própria rede/infra (proteção contra SSRF).
function isSafeWebhookUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!['http:','https:'].includes(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return false;
  if (h === '0.0.0.0' || h === '::1' || /^127\./.test(h)) return false;       // loopback
  if (/^10\./.test(h) || /^192\.168\./.test(h)) return false;                 // privadas
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false;                 // privadas
  if (/^169\.254\./.test(h)) return false;                                    // link-local + metadados AWS
  return true;
}

exports.list   = async (req,res) => { const {rows}=await pool.query('SELECT id,url,events,is_active,created_at FROM webhooks WHERE tenant_id=$1 ORDER BY created_at DESC',[req.tenant.id]); res.json({webhooks:rows}); };
exports.create = async (req,res) => {
  const {url,events='alert.created',secret}=req.body;
  if(!url) return res.status(400).json({error:'url obrigatório.'});
  if(!isSafeWebhookUrl(url)) return res.status(400).json({error:'URL inválida ou aponta para um endereço interno não permitido.'});
  const {rows:[wh]}=await pool.query('INSERT INTO webhooks(tenant_id,url,events,secret) VALUES($1,$2,$3,$4) RETURNING *',[req.tenant.id,url,events,secret]);
  res.status(201).json({webhook:wh});
};
exports.remove = async (req,res) => { await pool.query('DELETE FROM webhooks WHERE id=$1 AND tenant_id=$2',[req.params.id,req.tenant.id]); res.json({message:'Removido.'}); };
exports.test   = async (req,res) => { await dispatchWebhook(req.tenant.id,'webhook.test',{message:'Teste',ts:new Date()}); res.json({message:'Enviado.'}); };
