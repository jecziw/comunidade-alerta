#!/usr/bin/env node
/**
 * geocode.js — Precisão real de coordenadas via OpenStreetMap (Nominatim)
 * ----------------------------------------------------------------------
 * Lê uma lista de endereços e busca a latitude/longitude EXATA de cada um,
 * usando o serviço gratuito Nominatim (OpenStreetMap). É assim que se obtém
 * precisão de rua de verdade — sem chutes.
 *
 * COMO USAR (na sua máquina ou servidor, com Node.js instalado):
 *   1. Salve este arquivo.
 *   2. Edite a lista ENDERECOS abaixo (ou aponte para seu banco/JSON).
 *   3. Rode:  node geocode.js
 *   4. Copie as coordenadas geradas para o seu incidentGeoJSON / delegacias.
 *
 * IMPORTANTE: o Nominatim tem política de uso justo — 1 requisição por segundo.
 * O script já respeita isso. Para alto volume, use uma chave do Google Geocoding
 * ou rode seu próprio Nominatim.
 */

// Endereços reais das delegacias (edite à vontade)
const ENDERECOS = [
  { id: 'DEL-01', nome: '1ª DP da Capital',        endereco: 'Avenida Prefeito Osmar Cunha, 263, Centro, Florianópolis, SC' },
  { id: 'DEL-03', nome: '10ª DP — Lagoa',          endereco: 'Rua Crisógono Vieira da Cruz, Lagoa da Conceição, Florianópolis, SC' },
  { id: 'DEL-05', nome: 'DEIC — São José',         endereco: 'Rua Henrique Alvim Corrêa, 232, Areias, São José, SC' },
  // ... adicione os demais endereços reais aqui ...
];

// Geocodifica um endereço usando Nominatim (OpenStreetMap)
async function geocode(endereco) {
  const url = 'https://nominatim.openstreetmap.org/search'
    + '?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(endereco);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ComunidadeAlerta/1.0 (contato@comunidadealerta.com.br)' }
  });
  const data = await resp.json();
  if (!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), match: data[0].display_name };
}

// Pausa (respeita o limite de 1 req/seg do Nominatim)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Geocodificando endereços via OpenStreetMap...\n');
  const resultados = [];
  for (const item of ENDERECOS) {
    try {
      const geo = await geocode(item.endereco);
      if (geo) {
        // Formato pronto para colar no GeoJSON: [lng, lat]
        console.log(`${item.id}  ${item.nome}`);
        console.log(`   coordinates:[${geo.lng.toFixed(6)}, ${geo.lat.toFixed(6)}]`);
        console.log(`   (OSM: ${geo.match})\n`);
        resultados.push({ ...item, lng: geo.lng, lat: geo.lat });
      } else {
        console.log(`${item.id}  ${item.nome} → ❌ não encontrado (revise o endereço)\n`);
      }
    } catch (e) {
      console.log(`${item.id}  ${item.nome} → erro: ${e.message}\n`);
    }
    await sleep(1100); // 1 req/seg
  }

  // Salva um JSON com todos os resultados
  const fs = require('fs');
  fs.writeFileSync('coordenadas-geocodificadas.json', JSON.stringify(resultados, null, 2));
  console.log(`✅ Pronto! ${resultados.length} endereços geocodificados.`);
  console.log('   Resultado salvo em: coordenadas-geocodificadas.json');
})();
