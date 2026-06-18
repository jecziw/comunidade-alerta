/**
 * whatsappService.js
 * Notificações via WhatsApp Business API (Meta / Twilio)
 *
 * Suporta dois providers:
 *   - Meta Cloud API (oficial, requer aprovação de templates)
 *   - Twilio WhatsApp Sandbox (desenvolvimento/testes)
 *
 * Setup no .env:
 *   WHATSAPP_PROVIDER=meta  # ou 'twilio'
 *   WHATSAPP_TOKEN=EAAxxxxx  # Meta: token de acesso permanente
 *   WHATSAPP_PHONE_ID=1234567890  # Meta: phone number ID
 *   TWILIO_ACCOUNT_SID=ACxxxxx    # Twilio: account SID
 *   TWILIO_AUTH_TOKEN=xxxxxxx      # Twilio: auth token
 *   TWILIO_FROM=whatsapp:+14155238886  # Twilio: sandbox number
 */

const axios = require('axios');
const { pool } = require('../db');

const PROVIDER      = process.env.WHATSAPP_PROVIDER || 'meta';
const META_TOKEN    = process.env.WHATSAPP_TOKEN;
const META_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_FROM;

// Emojis por tipo de incidente para mensagens mais legíveis
const TYPE_EMOJI = {
  crime:       '🚨',
  furto:       '🔓',
  transito:    '🚗',
  infra:       '🔧',
  feminicidio: '🆘',
  prf:         '🚔',
  alertasc:    '⚠️',
  delegacia:   '🏛️',
};

const SEV_EMOJI = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🟢',
};

/**
 * Envia mensagem via Meta Cloud API
 */
async function sendMetaMessage(to, body) {
  const phone = to.replace(/\D/g, '');
  const url   = `https://graph.facebook.com/v18.0/${META_PHONE_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'text',
    text:              { preview_url: false, body },
  };

  const { data } = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${META_TOKEN}`,
      'Content-Type':  'application/json',
    },
    timeout: 10000,
  });

  return data;
}

/**
 * Envia mensagem via Twilio WhatsApp
 */
async function sendTwilioMessage(to, body) {
  const phone = 'whatsapp:+55' + to.replace(/\D/g, '');
  const url   = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

  const params = new URLSearchParams({
    From: TWILIO_FROM,
    To:   phone,
    Body: body,
  });

  const { data } = await axios.post(url, params.toString(), {
    auth:    { username: TWILIO_SID, password: TWILIO_TOKEN },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });

  return data;
}

/**
 * Função principal — envia mensagem independente do provider
 */
async function sendWhatsApp(to, message) {
  if (!to || !message) throw new Error('Telefone e mensagem são obrigatórios.');

  if (process.env.NODE_ENV === 'test') {
    console.log(`[whatsapp:mock] Para: ${to} | ${message.substring(0, 60)}`);
    return { mock: true };
  }

  try {
    if (PROVIDER === 'twilio') {
      return await sendTwilioMessage(to, message);
    } else {
      return await sendMetaMessage(to, message);
    }
  } catch (err) {
    console.error('[whatsappService] Erro ao enviar:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Notifica todos os usuários do tenant com WhatsApp cadastrado
 */
async function notifyTenantWhatsApp(tenantId, alert) {
  // Busca usuários com telefone cadastrado
  const { rows } = await pool.query(
    `SELECT name, phone FROM users
     WHERE tenant_id = $1 AND phone IS NOT NULL AND is_active = true`,
    [tenantId]
  );

  if (!rows.length) return;

  const typeEmoji = TYPE_EMOJI[alert.type] || '📍';
  const sevEmoji  = SEV_EMOJI[alert.severity] || '🟡';
  const now       = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const message = [
    `${sevEmoji} *COMUNIDADE ALERTA* ${sevEmoji}`,
    ``,
    `${typeEmoji} *${alert.label || alert.type.toUpperCase()}*`,
    `📍 ${alert.loc || alert.location}`,
    `🕐 ${now}`,
    ``,
    `${alert.desc || alert.description}`,
    ``,
    `Status: ${alert.status === 'open' ? '🔴 Em aberto' : '🟡 Em andamento'}`,
    `Fonte: ${alert.source === 'prf' ? 'PRF' : alert.source === 'alertasc' ? 'AlertaSC' : 'Manual'}`,
    ``,
    `_Comunidade Alerta · Grande Florianópolis_`,
  ].join('\n');

  const results = await Promise.allSettled(
    rows.map(u => sendWhatsApp(u.phone, message))
  );

  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`[whatsapp] Tenant ${tenantId}: ${sent} enviados, ${failed} falhos`);
  return { sent, failed };
}

/**
 * Envia relatório diário resumido para o admin do tenant
 */
async function sendDailyReport(tenantId) {
  const { rows: [admin] } = await pool.query(
    `SELECT name, phone FROM users
     WHERE tenant_id = $1 AND role = 'admin' AND phone IS NOT NULL LIMIT 1`,
    [tenantId]
  );
  if (!admin?.phone) return;

  const { rows: stats } = await pool.query(
    `SELECT
       COUNT(*) total,
       COUNT(*) FILTER (WHERE status = 'open')     open,
       COUNT(*) FILTER (WHERE status = 'resolved') resolved,
       COUNT(*) FILTER (WHERE type = 'crime')      crimes,
       COUNT(*) FILTER (WHERE type = 'feminicidio') feminicidio
     FROM alerts
     WHERE tenant_id = $1
       AND created_at >= CURRENT_DATE`,
    [tenantId]
  );

  const s = stats[0];
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

  const message = [
    `📊 *Resumo do dia — ${today}*`,
    ``,
    `Total de incidentes: *${s.total}*`,
    `🔴 Em aberto: *${s.open}*`,
    `✅ Resolvidos: *${s.resolved}*`,
    ``,
    `Por tipo:`,
    `• Crimes: ${s.crimes}`,
    `• Feminicídio: ${s.feminicidio}`,
    ``,
    `_Comunidade Alerta · Relatório automático_`,
  ].join('\n');

  await sendWhatsApp(admin.phone, message);
  console.log(`[whatsapp] Relatório diário enviado para tenant ${tenantId}`);
}

module.exports = {
  sendWhatsApp,
  notifyTenantWhatsApp,
  sendDailyReport,
};

/*
──────────────────────────────────────────────────────────────
  .env additions:

  # Provider: 'meta' (produção) ou 'twilio' (sandbox/dev)
  WHATSAPP_PROVIDER=meta

  # Meta Cloud API
  WHATSAPP_TOKEN=EAAxxxxx
  WHATSAPP_PHONE_ID=123456789012345

  # OU Twilio Sandbox
  TWILIO_ACCOUNT_SID=ACxxxxx
  TWILIO_AUTH_TOKEN=xxxxxxxx
  TWILIO_FROM=whatsapp:+14155238886

──────────────────────────────────────────────────────────────
  Schema — adicionar campo phone em users:

  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

──────────────────────────────────────────────────────────────
  Integrar no externalSyncJob.js (alertas high/critical):

  const { notifyTenantWhatsApp } = require('./whatsappService');
  // Após pushNotification:
  if (['high','critical'].includes(alert.severity)) {
    await notifyTenantWhatsApp(tenantId, alert).catch(()=>{});
  }

──────────────────────────────────────────────────────────────
  Relatório diário — adicionar em server.js (uma vez/dia):

  const { sendDailyReport } = require('./services/whatsappService');
  setInterval(async () => {
    const h = new Date().getHours();
    if (h === 7) { // 07:00 todos os dias
      const { rows } = await pool.query("SELECT id FROM tenants WHERE status='active'");
      for (const t of rows) await sendDailyReport(t.id).catch(()=>{});
    }
  }, 3600000); // checa a cada hora
──────────────────────────────────────────────────────────────
*/
