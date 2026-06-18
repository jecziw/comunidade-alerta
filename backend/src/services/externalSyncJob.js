/**
 * externalSyncJob.js
 * Orquestrador dos jobs de dados externos:
 *   - PRF  → polling a cada 15 min
 *
 * Novos alertas são emitidos via Socket.io para todos os clientes do tenant
 * e disparados como Push Notification + Webhook (se configurado).
 *
 * Uso no server.js:
 *   const { startExternalSync } = require('./services/externalSyncJob');
 *   startExternalSync();
 */

const { syncPRF,      POLL_INTERVAL: PRF_INTERVAL      } = require('./prfService');
const { syncINMET,    POLL_INTERVAL: INMET_INTERVAL    } = require('./inmetService');
const { syncCEMADEN,  POLL_INTERVAL: CEMADEN_INTERVAL  } = require('./cemadenService');
const { emitToAll }    = require('./socketService');
const { notifyTenantUsers }  = require('./pushService');
const { dispatchWebhook }    = require('./webhookService');
const pool = require('../db');

let prfTimer      = null;
let inmetTimer     = null;
let cemadenTimer   = null;
let isRunning     = false;

// ── Busca todos os tenants ativos com plano que permite dados externos ──
async function getActiveTenants() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM tenants
       WHERE status = 'active' AND plan IN ('pro', 'enterprise')
       ORDER BY id`
    );
    return rows;
  } catch (err) {
    console.error('[externalSync] Erro ao buscar tenants:', err.message);
    return [];
  }
}

// ── Enriquece alerta com campos de exibição no frontend ──
function enrichAlert(alert) {
  const sourceLabels = { prf: 'PRF', inmet: 'INMET', cemaden: 'CEMADEN' };
  const sourceColors = { prf: '#FF8F00', alertasc: 'rgba(2,136,209,.15)', inmet: '#0277BD', cemaden: '#6A1B9A' };
  return {
    ...alert,
    source_label: sourceLabels[alert.source] || alert.source,
    source_color: sourceColors[alert.source] || '#888',
    external:     true,
  };
}

// ── Processa novos alertas: Socket.io + Push + Webhook ──
async function processNewAlerts(newAlerts, tenantId) {
  if (newAlerts.length === 0) return;

  for (const raw of newAlerts) {
    const alert = enrichAlert(raw);

    // 1. Emite para todos os clientes WebSocket do tenant
    emitToAll('alert:new', {
      ...alert,
      toast: `[${alert.source_label}] ${alert.description.substring(0, 80)}`,
    });

    // 2. Push Notification para usuários do tenant (somente severity high/critical)
    if (['high', 'critical'].includes(alert.severity)) {
      await notifyTenantUsers(tenantId, {
        title: `[${alert.source_label}] ${alert.type === 'infra' ? '⚠️' : '🚨'} Novo alerta`,
        body:  alert.description.substring(0, 100),
        data:  { alertId: alert.id, type: alert.type, source: alert.source },
      }).catch(err => console.error('[externalSync] Push error:', err.message));
    }

    // 3. Dispara webhooks configurados para este tenant
    await dispatchWebhook(tenantId, 'alert.created.external', alert)
      .catch(err => console.error('[externalSync] Webhook error:', err.message));
  }

  console.log(`[externalSync] ${newAlerts.length} alertas processados para tenant ${tenantId}`);
}

// ── Job PRF ──
async function runPRFJob() {
  const tenants = await getActiveTenants();
  for (const tenant of tenants) {
    try {
      const newAlerts = await syncPRF(tenant.id);
      await processNewAlerts(newAlerts, tenant.id);
    } catch (err) {
      console.error(`[externalSync] PRF job falhou para tenant ${tenant.name}:`, err.message);
    }
  }
}

// ── Job INMET (avisos meteorológicos oficiais) ──
async function runINMETJob() {
  const tenants = await getActiveTenants();
  for (const tenant of tenants) {
    try {
      const { novos } = await syncINMET({ tenantId: tenant.id });
      // syncINMET já persiste; aqui apenas processamos notificações dos novos
      if (novos > 0) {
        const { rows } = await pool.query(
          `SELECT * FROM alerts WHERE source='inmet' AND tenant_id=$1
           ORDER BY created_at DESC LIMIT $2`, [tenant.id, novos]
        );
        await processNewAlerts(rows, tenant.id);
      }
    } catch (err) {
      console.error(`[externalSync] INMET job falhou para tenant ${tenant.name}:`, err.message);
    }
  }
}

// ── Job CEMADEN (risco de desastres — best-effort) ──
async function runCEMADENJob() {
  const tenants = await getActiveTenants();
  for (const tenant of tenants) {
    try {
      const { novos } = await syncCEMADEN({ tenantId: tenant.id });
      if (novos > 0) {
        const { rows } = await pool.query(
          `SELECT * FROM alerts WHERE source='cemaden' AND tenant_id=$1
           ORDER BY created_at DESC LIMIT $2`, [tenant.id, novos]
        );
        await processNewAlerts(rows, tenant.id);
      }
    } catch (err) {
      console.error(`[externalSync] CEMADEN job falhou para tenant ${tenant.name}:`, err.message);
    }
  }
}

// ── Inicia todos os jobs ──
function startExternalSync() {
  if (isRunning) {
    console.warn('[externalSync] Jobs já estão rodando.');
    return;
  }
  isRunning = true;

  console.log('[externalSync] Iniciando jobs de dados externos…');
  console.log(`  PRF     → polling a cada ${PRF_INTERVAL / 60000} min`);
  console.log(`  INMET    → polling a cada ${INMET_INTERVAL / 60000} min`);
  console.log(`  CEMADEN  → polling a cada ${CEMADEN_INTERVAL / 60000} min (best-effort)`);

  // Executa imediatamente na inicialização
  runPRFJob();
  runINMETJob();
  runCEMADENJob();

  // Agenda polling recorrente
  prfTimer      = setInterval(runPRFJob,      PRF_INTERVAL);
  inmetTimer     = setInterval(runINMETJob,     INMET_INTERVAL);
  cemadenTimer   = setInterval(runCEMADENJob,   CEMADEN_INTERVAL);
}

// ── Para os jobs (útil em testes e graceful shutdown) ──
function stopExternalSync() {
  clearInterval(prfTimer);
  clearInterval(inmetTimer);
  clearInterval(cemadenTimer);
  isRunning = false;
  console.log('[externalSync] Jobs externos parados.');
}

// ── Graceful shutdown ──
process.on('SIGTERM', stopExternalSync);
process.on('SIGINT',  stopExternalSync);

module.exports = { startExternalSync, stopExternalSync, runPRFJob };

/*
─────────────────────────────────────────────────────────────
  COMO INTEGRAR NO server.js:

  // No final do server.js, após inicializar Socket.io:
  const { startExternalSync } = require('./services/externalSyncJob');
  if (process.env.ENABLE_EXTERNAL_SYNC !== 'false') {
    startExternalSync();
  }

─────────────────────────────────────────────────────────────
  MIGRATION NECESSÁRIA (adicionar ao schema.sql):

  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source      VARCHAR(50) DEFAULT 'interno';
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS external_id VARCHAR(100) UNIQUE;
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS severity    VARCHAR(20) DEFAULT 'medium';
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS latitude    DECIMAL(10,7);
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS longitude   DECIMAL(10,7);
  ALTER TABLE alerts ADD COLUMN IF NOT EXISTS raw_data    TEXT;

  CREATE INDEX IF NOT EXISTS idx_alerts_source      ON alerts(source);
  CREATE INDEX IF NOT EXISTS idx_alerts_external_id ON alerts(external_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_severity    ON alerts(severity);

─────────────────────────────────────────────────────────────
  .env additions:

  ENABLE_EXTERNAL_SYNC=true

─────────────────────────────────────────────────────────────
  npm install necessário:

  npm install jsdom

─────────────────────────────────────────────────────────────
*/
