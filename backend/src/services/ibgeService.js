/**
 * ibgeService.js
 * Integração REAL com a API pública do IBGE (servicodados.ibge.gov.br)
 *
 * APIs oficiais, gratuitas, sem chave:
 *   - Localidades:  https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{id}
 *   - População (SIDRA tabela 6579 — estimativas):
 *       https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-6/variaveis/9324?localidades=N6[{cod}]
 *
 * Uso no produto: enriquecer as estatísticas com população por município,
 * permitindo métricas relativas como "incidentes por 100 mil habitantes",
 * que dão contexto real ao gestor público (compara cidades de tamanhos diferentes).
 *
 * Os dados de população mudam 1x por ano — fazemos cache de 24h.
 */

const axios = require('axios');

const IBGE_LOCALIDADES = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';
const IBGE_AGREGADOS   = 'https://servicodados.ibge.gov.br/api/v3/agregados';

// Códigos IBGE (7 dígitos) dos 22 municípios da Grande Florianópolis
const MUNICIPIOS_GF = {
  'Florianópolis':            4205407,
  'São José':                 4216602,
  'Palhoça':                  4211900,
  'Biguaçu':                  4202305,
  'Santo Amaro da Imperatriz':4215505,
  'Águas Mornas':             4200606,
  'São Pedro de Alcântara':   4216909,
  'Antônio Carlos':           4201307,
  'Governador Celso Ramos':   4206108,
  'Tijucas':                  4218004,
  'Canelinha':                4203501,
  'São João Batista':         4216107,
  'Major Gercino':            4210258,
  'Angelina':                 4201000,
  'Rancho Queimado':          4214003,
  'Alfredo Wagner':           4200705,
  'Anitápolis':               4201109,
  'São Bonifácio':            4216008,
  'Paulo Lopes':              4212007,
  'Garopaba':                 4205605,
  'Imbituba':                 4207007,
  'Imaruí':                   4206807,
};

// Cache simples em memória (24h)
let _cache = { populacao: null, ts: 0 };
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Busca a população estimada mais recente de um município.
 * Tabela 6579 = Estimativas de população; variável 9324 = população residente estimada.
 * Período -6 pede os 6 períodos mais recentes; pegamos o último disponível.
 */
async function fetchPopulacaoMunicipio(codIbge) {
  try {
    const url = `${IBGE_AGREGADOS}/6579/periodos/-6/variaveis/9324?localidades=N6[${codIbge}]`;
    const { data } = await axios.get(url, {
      timeout: 12000,
      headers: { 'User-Agent': 'ComunidadeAlerta/1.0' },
    });
    // Estrutura: [{ variavel, resultados:[{ series:[{ serie:{ "2024":"516524", ... } }] }] }]
    const serie = data?.[0]?.resultados?.[0]?.series?.[0]?.serie || {};
    const anos = Object.keys(serie).sort();
    const ultimoAno = anos[anos.length - 1];
    const valor = serie[ultimoAno];
    return valor ? { ano: ultimoAno, populacao: parseInt(valor, 10) } : null;
  } catch (err) {
    console.error(`[IBGE] Erro população município ${codIbge}:`, err.message);
    return null;
  }
}

/**
 * Busca a população de todos os 22 municípios da Grande Florianópolis.
 * Retorna { 'Florianópolis': { ano, populacao }, ... } e o total da região.
 */
async function fetchPopulacaoGF(opts = {}) {
  // Usa cache se válido
  if (!opts.force && _cache.populacao && (Date.now() - _cache.ts) < CACHE_TTL) {
    return _cache.populacao;
  }

  const entries = Object.entries(MUNICIPIOS_GF);
  const resultado = {};
  let total = 0;

  // Busca em paralelo (com limite implícito — são só 22)
  const promises = entries.map(async ([nome, cod]) => {
    const pop = await fetchPopulacaoMunicipio(cod);
    if (pop) { resultado[nome] = { ...pop, codIbge: cod }; total += pop.populacao; }
  });
  await Promise.all(promises);

  const payload = {
    municipios: resultado,
    total,
    fonte: 'IBGE — Estimativas de População',
    atualizado_em: new Date().toISOString(),
  };
  _cache = { populacao: payload, ts: Date.now() };
  return payload;
}

/**
 * Calcula a taxa de incidentes por 100 mil habitantes.
 * Permite comparar municípios de tamanhos diferentes de forma justa.
 */
function taxaPor100k(numIncidentes, populacao) {
  if (!populacao || populacao <= 0) return null;
  return +((numIncidentes / populacao) * 100000).toFixed(1);
}

/**
 * Enriquece um ranking de municípios (por contagem de incidentes) com
 * a população e a taxa por 100k — o número que realmente importa pro gestor.
 */
async function enriquecerRankingComPopulacao(ranking) {
  // ranking: [{ municipio, incidentes }, ...]
  const pop = await fetchPopulacaoGF();
  return ranking.map(item => {
    const dados = pop.municipios[item.municipio];
    const populacao = dados ? dados.populacao : null;
    return {
      ...item,
      populacao,
      taxa_100k: taxaPor100k(item.incidentes, populacao),
    };
  });
}

/**
 * Dados cadastrais de um município (nome oficial, microrregião, UF).
 */
async function fetchDadosMunicipio(codIbge) {
  try {
    const { data } = await axios.get(`${IBGE_LOCALIDADES}/${codIbge}`, {
      timeout: 10000, headers: { 'User-Agent': 'ComunidadeAlerta/1.0' },
    });
    return {
      nome:        data.nome,
      microrregiao:data?.microrregiao?.nome,
      mesorregiao: data?.microrregiao?.mesorregiao?.nome,
      uf:          data?.microrregiao?.mesorregiao?.UF?.sigla,
    };
  } catch (err) {
    console.error(`[IBGE] Erro dados município ${codIbge}:`, err.message);
    return null;
  }
}

module.exports = {
  fetchPopulacaoMunicipio,
  fetchPopulacaoGF,
  enriquecerRankingComPopulacao,
  taxaPor100k,
  fetchDadosMunicipio,
  MUNICIPIOS_GF,
};
