const { pool } = require('../db');
const env = require('../config/env');
const { emitToTenant, emitPublic } = require('../services/socketService');
const { notifyPublicSubscribers } = require('../services/pushService');

/**
 * GET /api/public/alerts  (SEM autenticação)
 * Retorna SOMENTE alertas de fontes externas/públicas (nunca os internos/manuais
 * de um tenant), deduplicados por external_id. É o feed do cidadão.
 */
exports.listPublic = async (req, res) => {
  try {
    // Totais reais (sem limite) para os cards de estatística do site
    const { rows: countRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'open')::int AS total_open,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS total_resolved
       FROM alerts
       WHERE source NOT IN ('interno','manual')`
    );
    const { total, total_open, total_resolved } = countRows[0];

    const { rows } = await pool.query(
      `SELECT id, external_id, source, type, description, location,
              latitude, longitude, severity, status, created_at
         FROM alerts
        WHERE source NOT IN ('interno','manual')
        ORDER BY created_at DESC
        LIMIT 1000`
    );
    // Dedup por external_id mantendo o mais recente (sem corte artificial de 200)
    const seen = new Set();
    const alerts = [];
    for (const a of rows) {
      const key = a.external_id || `id:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      alerts.push(a);
    }
    res.json({ alerts, total, total_open, total_resolved });
  } catch (err) {
    console.error('[public] listPublic erro:', err.message);
    res.status(500).json({ error: 'erro ao listar alertas públicos' });
  }
};

/**
 * POST /api/alerts/ingest  (autenticado por chave X-API-Key)
 * Canal REAL de ingestão para fontes externas que cheguem por bot/convênio/
 * agregador (ex.: Google Public Alerts, encaminhador de Defesa Civil).
 * Insere o alerta para todos os tenants ativos e emite em tempo real
 * (tenant + sala pública). Dedup por external_id.
 */
exports.ingest = async (req, res) => {
  if (!env.ingestKey || req.headers['x-api-key'] !== env.ingestKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const {
    source = 'externo', type = 'outro', description,
    location = null, latitude = null, longitude = null,
    severity = 'medium', status = 'open', external_id = null,
  } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description obrigatório' });

  try {
    const { rows: tenants } = await pool.query(
      `SELECT id FROM tenants
        WHERE billing_status IN ('active','trial') AND plan IN ('pro','enterprise')`
    );
    let inserted = 0;
    for (const t of tenants) {
      try {
        const { rows: [alert] } = await pool.query(
          `INSERT INTO alerts
             (external_id, source, type, description, severity, status, latitude, longitude, location, tenant_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (tenant_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
           RETURNING *`,
          [external_id, source, type, description, severity, status, latitude, longitude, location, t.id]
        );
        if (alert) { inserted++; emitToTenant(t.id, 'alert:new', alert); }
      } catch (e) {
        console.error('[public] ingest insert erro (tenant ' + t.id + '):', e.message);
      }
    }
    // Emite uma vez para a sala pública (cidadão) + push pros inscritos
    emitPublic('alert:new', { source, type, description, location, latitude, longitude, severity, status, external_id });
    notifyPublicSubscribers({
      title: `🚨 Alerta: ${type}`,
      body: description.substring(0, 120),
      url: './comunidade-alerta.html',
      id: external_id || undefined,
    }).catch(() => {});
    res.json({ ok: true, tenants: tenants.length, inserted });
  } catch (err) {
    console.error('[public] ingest erro:', err.message);
    res.status(500).json({ error: 'erro na ingestão' });
  }
};

/**
 * GET /api/public/vapid-key — chave pública VAPID para o cidadão assinar push.
 */
exports.getVapidKey = (req, res) => {
  res.json({ key: env.vapid.publicKey || null });
};

/**
 * POST /api/public/subscribe — salva a assinatura de Web Push do cidadão.
 */
exports.subscribe = async (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'subscription inválida' });
  try {
    await pool.query(
      `INSERT INTO public_subscriptions (endpoint, subscription)
       VALUES ($1, $2)
       ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription`,
      [sub.endpoint, sub]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[public] subscribe erro:', err.message);
    res.status(500).json({ error: 'erro ao salvar inscrição' });
  }
};
