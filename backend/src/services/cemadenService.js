/**
 * cemadenService.js
 * Integração com alertas de desastres do CEMADEN
 * (Centro Nacional de Monitoramento e Alertas de Desastres Naturais)
 *
 * ⚠️  SITUAÇÃO REAL DAS FONTES (importante para produção):
 *
 *   O CEMADEN NÃO publica uma REST API pública documentada para terceiros
 *   consumirem alertas de forma livre. As formas oficiais de receber os
 *   alertas são:
 *
 *   1. IDAP (Interface de Divulgação de Alertas Públicos) — operada pela
 *      Defesa Civil Nacional (MIDR). Distribui via SMS, Telegram, WhatsApp,
 *      Google Alertas Públicos e TV. Requer CADASTRO INSTITUCIONAL da
 *      defesa civil estadual/municipal. → caminho oficial para uma prefeitura.
 *
 *   2. Painel de Alertas (painelalertas.cemaden.gov.br) — webapp público que
 *      consome um endpoint interno de alertas por estado/município. Não é
 *      documentado/estável, mas é acessível. Usado aqui como BEST-EFFORT.
 *
 *   3. Google Public Alerts — agrega alertas oficiais (inclui CEMADEN) e tem
 *      API. Pode ser usado como ponte.
 *
 *   Este serviço tenta o caminho (2) e, em produção real para uma prefeitura,
 *   o recomendado é firmar o convênio IDAP (1) — que dá acesso oficial e
 *   confiável. O método `getModoProducao()` documenta isso para a equipe.
 *
 * Atualização: a cada 10 minutos (alertas de desastre têm janela de horas).
 */

const axios = require('axios');
const { pool } = require('../db');

// Endpoint do Painel de Alertas (best-effort — pode mudar sem aviso)
const CEMADEN_PAINEL = 'https://painelalertas.cemaden.gov.br/api/alerts'; // estrutura aproximada
const POLL_INTERVAL  = 10 * 60 * 1000;

// Municípios da Grande Florianópolis monitorados pelo CEMADEN (cód. IBGE)
const MUNICIPIOS_GF = {
  4205407: 'Florianópolis',  4216602: 'São José',     4211900: 'Palhoça',
  4202305: 'Biguaçu',        4215505: 'Santo Amaro da Imperatriz',
  4206108: 'Governador Celso Ramos', 4218004: 'Tijucas', 4205605: 'Garopaba',
  4207007: 'Imbituba',       4200705: 'Alfredo Wagner', 4201109: 'Anitápolis',
};

// Coordenadas dos municípios (para plotar no mapa)
const COORDS = {
  'Florianópolis':[-27.5954,-48.5482], 'São José':[-27.6005,-48.6264],
  'Palhoça':[-27.6454,-48.6668], 'Biguaçu':[-27.4935,-48.6548],
  'Santo Amaro da Imperatriz':[-27.6877,-48.7787], 'Governador Celso Ramos':[-27.3142,-48.5594],
  'Tijucas':[-27.2397,-48.6364], 'Garopaba':[-28.0260,-48.6150],
  'Imbituba':[-28.2400,-48.6703], 'Alfredo Wagner':[-27.7000,-49.3331], 'Anitápolis':[-27.9028,-49.1289],
};

// Nível CEMADEN → severidade interna
const NIVEL_MAP = {
  'Observação':  { severity: 'low',      nivel: 'verde' },
  'Atenção':     { severity: 'medium',   nivel: 'amarelo' },
  'Alerta':      { severity: 'high',     nivel: 'laranja' },
  'Alerta Máximo':{ severity: 'critical', nivel: 'vermelho' },
  'Moderado':    { severity: 'medium',   nivel: 'amarelo' },
  'Alto':        { severity: 'high',     nivel: 'laranja' },
  'Muito Alto':  { severity: 'critical', nivel: 'vermelho' },
};

/**
 * Tenta buscar alertas do Painel CEMADEN (best-effort).
 * Em caso de falha (endpoint indisponível/mudou), retorna [] sem quebrar.
 */
async function fetchAlertasCEMADEN() {
  try {
    const { data } = await axios.get(CEMADEN_PAINEL, {
      params: { uf: 'SC' },
      timeout: 12000,
      headers: { 'User-Agent': 'ComunidadeAlerta/1.0 (defesa civil municipal)' },
    });

    const lista = Array.isArray(data) ? data : (data?.alertas || data?.features || []);
    const alertas = [];

    for (const item of lista) {
      const p = item.properties || item;
      const codMun = p.geocodigo || p.municipio_id || p.codIbge;
      const nomeMun = MUNICIPIOS_GF[codMun] || (COORDS[p.municipio] ? p.municipio : null);
      if (!nomeMun) continue; // fora da Grande Florianópolis

      const nivel = NIVEL_MAP[p.nivel] || NIVEL_MAP[p.severidade] || NIVEL_MAP['Atenção'];
      const coord = COORDS[nomeMun] || [-27.595, -48.548];

      alertas.push({
        external_id: `cemaden:${p.id || p.alerta_id || `${codMun}-${p.inicio || Date.now()}`}`,
        source:      'cemaden',
        type:        'infra',
        label:       p.tipo || p.processo || 'Risco de desastre',
        description: `${p.tipo || 'Risco'} — ${p.descricao || p.mensagem || 'Monitoramento CEMADEN'} · ${nomeMun}`,
        severity:    nivel.severity,
        nivel:       nivel.nivel,
        status:      'open',
        lat:         coord[0],
        lng:         coord[1],
        municipio:   nomeMun,
        starts_at:   p.inicio || p.data_inicio || null,
        raw:         JSON.stringify(p).slice(0, 4000),
        created_at:  new Date().toISOString(),
      });
    }
    return alertas;
  } catch (err) {
    // Endpoint indisponível é esperado (não é API oficial estável)
    console.warn('[CEMADEN] Painel indisponível (esperado sem convênio IDAP):', err.message);
    return [];
  }
}

async function salvarAlertas(alertas, tenantId = null) {
  if (!alertas.length) return 0;
  let novos = 0;
  for (const a of alertas) {
    try {
      const res = await pool.query(
        `INSERT INTO alerts
           (external_id, source, type, description, severity, status, latitude, longitude, location, raw_data, tenant_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tenant_id, external_id) WHERE external_id IS NOT NULL DO UPDATE
           SET status = EXCLUDED.status, severity = EXCLUDED.severity
         RETURNING (xmax = 0) AS inserted`,
        [a.external_id, a.source, a.type, (a.label ? a.label+' — ' : '')+a.description, a.severity, a.status,
         a.lat, a.lng, a.municipio, a.raw, tenantId, a.created_at]
      );
      if (res.rows[0] && res.rows[0].inserted) novos++;
    } catch (err) {
      console.error('[CEMADEN] Erro ao salvar:', err.message);
    }
  }
  return novos;
}

async function syncCEMADEN(opts = {}) {
  // O CEMADEN NÃO possui API pública de alertas vigentes (confirmado pela própria
  // ouvidoria via LAI): os alertas são entregues apenas às Defesas Civis via CENAD.
  // Portanto não há endpoint a consultar. Mantemos a função como no-op para não
  // bater numa URL fictícia. Para ingerir CEMADEN de verdade, ver getModoProducao()
  // (convênio IDAP / Google Public Alerts → encaminhar para /api/alerts/ingest).
  return { total: 0, novos: 0, disabled: true };
}

/**
 * Documenta para a equipe como ativar o modo de produção real.
 */
function getModoProducao() {
  return {
    recomendado: 'Convênio IDAP (Defesa Civil Nacional / MIDR)',
    passos: [
      '1. A prefeitura/defesa civil municipal se cadastra na IDAP (gratuito).',
      '2. Recebe acesso aos alertas oficiais via Telegram/WhatsApp/Google Public Alerts.',
      '3. Configurar um webhook/bot que encaminha esses alertas para o endpoint /api/alerts/ingest.',
      'Alternativa: usar a Google Public Alerts API, que agrega dados do CEMADEN.',
    ],
    observacao: 'O painelalertas.cemaden.gov.br é best-effort e não tem SLA para terceiros.',
  };
}

let _timer = null;
function startPolling(opts = {}) {
  if (_timer) return;
  syncCEMADEN(opts);
  _timer = setInterval(() => syncCEMADEN(opts), POLL_INTERVAL);
  console.log(`[CEMADEN] Polling best-effort iniciado — a cada ${POLL_INTERVAL/60000} min`);
}
function stopPolling() { if (_timer) { clearInterval(_timer); _timer = null; } }

module.exports = {
  fetchAlertasCEMADEN,
  syncCEMADEN,
  startPolling,
  stopPolling,
  getModoProducao,
  MUNICIPIOS_GF,
  POLL_INTERVAL,
};
