/**
 * prfService.js
 * Integração com a API pública da Polícia Rodoviária Federal
 * Filtra acidentes nas rodovias federais de SC (BR-101, BR-282, BR-470...)
 *
 * API PRF: https://api.prf.gov.br/api/v1/acidentes
 * Documentação: https://www.prf.gov.br/portal/dados-abertos
 * Sem autenticação necessária — dados abertos.
 */

const axios = require('axios');
const pool  = require('../db');

const PRF_BASE_URL  = 'https://api.prf.gov.br/api/v1';
const UF_SC         = 'SC';
const RODOVIAS_SC   = ['BR-101', 'BR-282', 'BR-470', 'BR-116', 'BR-153'];
const POLL_INTERVAL = 15 * 60 * 1000; // 15 minutos

// Mapeamento de tipo PRF → tipo interno
const TIPO_MAP = {
  'Colisão traseira':             'transito',
  'Colisão frontal':              'transito',
  'Colisão lateral':              'transito',
  'Atropelamento de pedestre':    'crime',
  'Saída de leito carroçável':    'transito',
  'Capotamento':                  'transito',
  'Tombamento':                   'transito',
  'Incêndio':                     'infra',
  'Danos eventuais':              'infra',
};

// Grande Florianópolis — bounding box aproximado
const BBOX = {
  latMin: -28.2,
  latMax: -27.3,
  lngMin: -49.0,
  lngMax: -48.3,
};

/**
 * Normaliza um acidente PRF para o formato interno de alert
 */
function normalizePRF(acidente) {
  const tipo = TIPO_MAP[acidente.tipo_acidente] || 'transito';
  return {
    type:        tipo,
    source:      'prf',
    external_id: `PRF-${acidente.id}`,
    description: buildDescription(acidente),
    location:    buildLocation(acidente),
    lat:         parseFloat(acidente.latitude?.replace(',', '.')),
    lng:         parseFloat(acidente.longitude?.replace(',', '.')),
    severity:    acidente.mortos > 0 ? 'critical' : acidente.feridos_graves > 0 ? 'high' : 'medium',
    raw_data:    JSON.stringify(acidente),
    status:      'open',
  };
}

function buildDescription(a) {
  const partes = [a.tipo_acidente];
  if (a.causa_acidente) partes.push(`Causa: ${a.causa_acidente}`);
  if (a.mortos > 0)      partes.push(`${a.mortos} vítima(s) fatal(is)`);
  if (a.feridos_graves > 0) partes.push(`${a.feridos_graves} ferido(s) grave(s)`);
  if (a.feridos_leves > 0)  partes.push(`${a.feridos_leves} ferido(s) leve(s)`);
  return partes.join(' · ');
}

function buildLocation(a) {
  const rodovia = a.br ? `BR-${a.br}` : '';
  const km      = a.km ? `km ${a.km}` : '';
  const muni    = a.municipio || '';
  return [rodovia, km, muni].filter(Boolean).join(' · ');
}

function isInGrandeFlorianopolis(lat, lng) {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;
  return lat >= BBOX.latMin && lat <= BBOX.latMax &&
         lng >= BBOX.lngMin && lng <= BBOX.lngMax;
}

/**
 * Busca acidentes do dia atual na API PRF
 */
async function fetchPRFAccidents() {
  const today = new Date().toISOString().split('T')[0];
  const url   = `${PRF_BASE_URL}/acidentes?ano=${new Date().getFullYear()}&uf=${UF_SC}`;

  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const acidentes = Array.isArray(data) ? data : data.results || [];

    // Filtra por região e data de hoje
    return acidentes
      .filter(a => {
        const lat = parseFloat(a.latitude?.replace(',', '.'));
        const lng = parseFloat(a.longitude?.replace(',', '.'));
        const dataAcidente = a.data_inversa || a.data || '';
        return isInGrandeFlorianopolis(lat, lng) && dataAcidente.includes(today);
      })
      .map(normalizePRF)
      .filter(a => !isNaN(a.lat) && !isNaN(a.lng));
  } catch (err) {
    console.error('[prfService] Erro ao buscar acidentes PRF:', err.message);
    return [];
  }
}

/**
 * Salva acidente no banco se ainda não existir (idempotente por external_id)
 * Retorna o alerta salvo ou null se já existia
 */
async function upsertPRFAlert(alert, tenantId) {
  const client = await pool.connect();
  try {
    // Verifica se já existe
    const exists = await client.query(
      'SELECT id FROM alerts WHERE external_id = $1 AND tenant_id = $2',
      [alert.external_id, tenantId]
    );
    if (exists.rows.length > 0) return null;

    const { rows } = await client.query(
      `INSERT INTO alerts
         (tenant_id, type, source, external_id, description, location,
          latitude, longitude, severity, status, raw_data, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       RETURNING *`,
      [
        tenantId,
        alert.type,
        alert.source,
        alert.external_id,
        alert.description,
        alert.location,
        alert.lat,
        alert.lng,
        alert.severity,
        alert.status,
        alert.raw_data,
      ]
    );
    return rows[0];
  } finally {
    client.release();
  }
}

/**
 * Job principal — busca, filtra e persiste alertas PRF
 * Retorna array de novos alertas salvos (para emitir via Socket.io)
 */
async function syncPRF(tenantId) {
  console.log('[prfService] Sincronizando dados PRF…');
  const accidents = await fetchPRFAccidents();
  console.log(`[prfService] ${accidents.length} acidentes encontrados na Grande Florianópolis`);

  const newAlerts = [];
  for (const alert of accidents) {
    const saved = await upsertPRFAlert(alert, tenantId);
    if (saved) newAlerts.push(saved);
  }

  console.log(`[prfService] ${newAlerts.length} novos alertas PRF persistidos`);
  return newAlerts;
}

module.exports = { syncPRF, fetchPRFAccidents, POLL_INTERVAL };
