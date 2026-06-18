/**
 * inmetService.js
 * Integração REAL com a API oficial do INMET (Instituto Nacional de Meteorologia)
 *
 * Fonte oficial, gratuita, sem necessidade de cadastro:
 *   - Avisos ativos:       https://apiprevmet3.inmet.gov.br/avisos/ativos
 *   - Aviso individual:    https://apiprevmet3.inmet.gov.br/avisos/{id}
 *   - RSS (padrão CAP):    https://apiprevmet3.inmet.gov.br/avisos/rss
 *
 * Os avisos seguem o padrão internacional CAP (Common Alerting Protocol),
 * o mesmo usado por defesas civis no mundo todo. Campos: severidade,
 * urgência, certeza, área de abrangência (polígonos), início e fim.
 *
 * Atualização recomendada: a cada 10 minutos (avisos do INMET têm janela
 * de horas/dias, não precisam de polling mais agressivo).
 *
 * IMPORTANTE: este serviço substitui o antigo "alertaScService". O INMET é
 * a fonte pública oficial documentada disponível para terceiros em SC.
 */

const axios = require('axios');
const pool  = require('../db');

const INMET_ATIVOS = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutos

// ─────────────────────────────────────────────────────────────
// Municípios da Grande Florianópolis (22 municípios) com bbox
// Usado para filtrar quais avisos do INMET tocam a nossa região.
// ─────────────────────────────────────────────────────────────
const MUNICIPIOS_GF = {
  'Florianópolis':            { lat: -27.5954, lng: -48.5482 },
  'São José':                 { lat: -27.6005, lng: -48.6264 },
  'Palhoça':                  { lat: -27.6454, lng: -48.6668 },
  'Biguaçu':                  { lat: -27.4935, lng: -48.6548 },
  'Santo Amaro da Imperatriz':{ lat: -27.6877, lng: -48.7787 },
  'Águas Mornas':             { lat: -27.6969, lng: -48.8236 },
  'São Pedro de Alcântara':   { lat: -27.5664, lng: -48.8047 },
  'Antônio Carlos':           { lat: -27.5172, lng: -48.7656 },
  'Governador Celso Ramos':   { lat: -27.3142, lng: -48.5594 },
  'Tijucas':                  { lat: -27.2397, lng: -48.6364 },
  'Canelinha':                { lat: -27.2647, lng: -48.7656 },
  'São João Batista':         { lat: -27.2767, lng: -48.8497 },
  'Major Gercino':            { lat: -27.4180, lng: -48.9533 },
  'Angelina':                 { lat: -27.5728, lng: -48.9869 },
  'Rancho Queimado':          { lat: -27.6722, lng: -49.0167 },
  'Alfredo Wagner':           { lat: -27.7000, lng: -49.3331 },
  'Anitápolis':               { lat: -27.9028, lng: -49.1289 },
  'São Bonifácio':            { lat: -27.8997, lng: -48.9269 },
  'Paulo Lopes':              { lat: -27.9614, lng: -48.6822 },
  'Garopaba':                 { lat: -28.0260, lng: -48.6150 },
  'Imbituba':                 { lat: -28.2400, lng: -48.6703 },
  'Imaruí':                   { lat: -28.3372, lng: -48.8189 },
};

// Limites aproximados da Grande Florianópolis (bounding box)
const GF_BBOX = { minLat: -28.40, maxLat: -27.10, minLng: -49.40, maxLng: -48.25 };

// Severidade CAP → modelo interno
const SEVERITY_MAP = {
  'Minor':    { severity: 'low',      nivel: 'verde' },
  'Moderate': { severity: 'medium',   nivel: 'amarelo' },
  'Severe':   { severity: 'high',     nivel: 'laranja' },
  'Extreme':  { severity: 'critical', nivel: 'vermelho' },
};

// Mapeia o tipo de aviso do INMET → tipo interno do Comunidade Alerta
function mapTipo(evento = '') {
  const e = evento.toLowerCase();
  if (e.includes('chuva') || e.includes('tempestade') || e.includes('acumulada')) return 'infra';
  if (e.includes('vento') || e.includes('vendaval') || e.includes('ciclone'))     return 'infra';
  if (e.includes('granizo'))                                                       return 'infra';
  if (e.includes('alagamento') || e.includes('inundação') || e.includes('enchente')) return 'infra';
  if (e.includes('deslizamento') || e.includes('massa'))                           return 'infra';
  if (e.includes('temperatura') || e.includes('calor') || e.includes('frio'))      return 'infra';
  return 'infra'; // avisos meteorológicos sempre caem em infraestrutura/defesa civil
}

/**
 * Verifica se um aviso (com lista de municípios ou polígono) toca a Grande Fpolis.
 * O INMET retorna a lista de municípios afetados em `municipios` e/ou um polígono.
 */
function tocaGrandeFloripa(aviso) {
  // 1) Por nome de município
  const munis = aviso.municipios || aviso.descricao_municipios || [];
  const lista = Array.isArray(munis) ? munis : String(munis).split(',');
  for (const m of lista) {
    const nome = String(m).trim();
    if (MUNICIPIOS_GF[nome]) return { nome, ...MUNICIPIOS_GF[nome] };
  }
  // 2) Por estado (SC) + centroide do polígono dentro do bbox
  const estados = aviso.estados || aviso.uf || '';
  if (String(estados).includes('Santa Catarina') || String(estados).includes('SC')) {
    const c = centroideDoPoligono(aviso.poligono || aviso.geometry);
    if (c && c.lat >= GF_BBOX.minLat && c.lat <= GF_BBOX.maxLat &&
            c.lng >= GF_BBOX.minLng && c.lng <= GF_BBOX.maxLng) {
      return { nome: 'Grande Florianópolis', lat: c.lat, lng: c.lng };
    }
  }
  return null;
}

function centroideDoPoligono(poly) {
  if (!poly) return null;
  let pts = [];
  try {
    if (typeof poly === 'string') {
      // "lat,lng lat,lng ..." ou "lng,lat ..."
      pts = poly.trim().split(/\s+/).map(p => {
        const [a, b] = p.split(',').map(Number);
        return { lat: a, lng: b };
      });
    } else if (Array.isArray(poly)) {
      pts = poly.map(p => Array.isArray(p) ? { lat: p[1], lng: p[0] } : p);
    }
  } catch (_) { return null; }
  if (!pts.length) return null;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  return { lat, lng };
}

/**
 * Converte um aviso CAP do INMET para o formato de alerta do Comunidade Alerta.
 */
function avisoParaAlerta(aviso, local) {
  const sev = SEVERITY_MAP[aviso.severidade] || SEVERITY_MAP[aviso.severity] || SEVERITY_MAP['Moderate'];
  const evento = aviso.descricao || aviso.evento || aviso.event || 'Aviso meteorológico';
  return {
    external_id:  `inmet:${aviso.id || aviso.identificador || aviso.sequencia}`,
    source:       'inmet',
    type:         mapTipo(evento),
    label:        evento,
    description:  `${evento} — ${aviso.risco || aviso.instrucao || aviso.descricao_completa || 'Aviso da Defesa Civil / INMET'} · ${local.nome}`,
    severity:     sev.severity,
    nivel:        sev.nivel,
    status:       'open',
    lat:          local.lat,
    lng:          local.lng,
    municipio:    local.nome,
    starts_at:    aviso.inicio || aviso.onset || null,
    ends_at:      aviso.fim || aviso.expires || null,
    raw:          JSON.stringify(aviso).slice(0, 4000),
    created_at:   new Date().toISOString(),
  };
}

/**
 * Busca os avisos ativos do INMET e filtra pela Grande Florianópolis.
 */
async function fetchAvisosINMET() {
  try {
    const { data } = await axios.get(INMET_ATIVOS, {
      timeout: 15000,
      headers: { 'User-Agent': 'ComunidadeAlerta/1.0 (monitoramento urbano SC)' },
    });

    // A API pode retornar { hoje: [...], futuro: [...] } ou um array direto
    let avisos = [];
    if (Array.isArray(data)) avisos = data;
    else if (data && Array.isArray(data.hoje))   avisos = avisos.concat(data.hoje);
    else if (data && Array.isArray(data.avisos))  avisos = data.avisos;
    if (data && Array.isArray(data.futuro)) avisos = avisos.concat(data.futuro);

    const alertas = [];
    for (const aviso of avisos) {
      const local = tocaGrandeFloripa(aviso);
      if (local) alertas.push(avisoParaAlerta(aviso, local));
    }
    return alertas;
  } catch (err) {
    console.error('[INMET] Erro ao buscar avisos:', err.message);
    return [];
  }
}

/**
 * Persiste os alertas no banco (upsert por external_id para evitar duplicatas).
 */
async function salvarAlertas(alertas, tenantId = null) {
  if (!alertas.length) return 0;
  let inseridos = 0;
  for (const a of alertas) {
    try {
      const res = await pool.query(
        `INSERT INTO alerts
           (external_id, source, type, label, description, severity, status, lat, lng, municipio, starts_at, ends_at, raw, tenant_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (external_id) DO UPDATE
           SET status = EXCLUDED.status, ends_at = EXCLUDED.ends_at, severity = EXCLUDED.severity
         RETURNING (xmax = 0) AS inserted`,
        [a.external_id, a.source, a.type, a.label, a.description, a.severity, a.status,
         a.lat, a.lng, a.municipio, a.starts_at, a.ends_at, a.raw, tenantId, a.created_at]
      );
      if (res.rows[0] && res.rows[0].inserted) inseridos++;
    } catch (err) {
      console.error('[INMET] Erro ao salvar alerta:', err.message);
    }
  }
  return inseridos;
}

/**
 * Ciclo completo: busca → filtra → salva → notifica.
 * Retorna { total, novos } para logging.
 */
async function syncINMET(opts = {}) {
  const alertas = await fetchAvisosINMET();
  const novos = await salvarAlertas(alertas, opts.tenantId);
  if (novos > 0) {
    console.log(`[INMET] ${novos} novo(s) aviso(s) para a Grande Florianópolis`);
    // Dispara notificações em tempo real, se o socket estiver disponível
    try {
      const socket = require('./socketService');
      if (socket && socket.broadcastNewAlerts) socket.broadcastNewAlerts(alertas.slice(0, novos));
    } catch (_) {}
  }
  return { total: alertas.length, novos };
}

/**
 * Inicia o polling automático a cada 10 minutos.
 */
let _timer = null;
function startPolling(opts = {}) {
  if (_timer) return;
  syncINMET(opts); // primeira execução imediata
  _timer = setInterval(() => syncINMET(opts), POLL_INTERVAL);
  console.log(`[INMET] Polling iniciado — a cada ${POLL_INTERVAL / 60000} min`);
}
function stopPolling() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = {
  fetchAvisosINMET,
  syncINMET,
  startPolling,
  stopPolling,
  avisoParaAlerta,
  tocaGrandeFloripa,
  MUNICIPIOS_GF,
  POLL_INTERVAL,
  INMET_ATIVOS,
};
