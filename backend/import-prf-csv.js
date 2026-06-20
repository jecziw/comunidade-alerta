#!/usr/bin/env node
/**
 * Importador REAL do CSV de acidentes da PRF (dados abertos, datatran).
 * Histórico/acumulado (não tempo real). Insere como source='prf'. Sem emit/push.
 * Lida com o formato da PRF: ISO-8859-1, separador ';' e CADA CAMPO ENTRE ASPAS.
 * Uso (dentro do container backend):  node import-prf-csv.js /tmp/prf.csv
 */
const fs = require('fs');
const { pool } = require('./src/db');

// remove aspas em volta do campo
const unq = s => (s==null?'':s.toString()).trim().replace(/^"(.*)"$/s, '$1').trim();
const numCoord = s => { const v = parseFloat(unq(s).replace(',', '.')); return isNaN(v) ? null : v; };
const toInt = s => { const v = parseInt(unq(s),10); return isNaN(v) ? 0 : v; };

const GF = { latMin:-28.15, latMax:-27.15, lngMin:-49.10, lngMax:-48.35 };

async function main() {
  const path = process.argv[2];
  if (!path) { console.error('Uso: node import-prf-csv.js <arquivo.csv>'); process.exit(1); }

  let raw = fs.readFileSync(path, 'latin1');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) { console.error('CSV vazio'); process.exit(1); }

  const delim = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
  const header = lines[0].split(delim).map(h => unq(h).toLowerCase());
  const col = n => header.indexOf(n);
  const ci = {
    id: col('id'), lat: col('latitude'), lng: col('longitude'), mun: col('municipio'),
    data: col('data_inversa'), hora: col('horario'), br: col('br'), km: col('km'),
    tipo: col('tipo_acidente'), causa: col('causa_acidente'),
    mortos: col('mortos'), fg: col('feridos_graves'), feridos: col('feridos'),
  };
  console.log('Delimitador:', JSON.stringify(delim), '| Colunas:', header.length);
  if (ci.lat < 0 || ci.lng < 0) {
    console.error('ERRO: não achei latitude/longitude. Cabeçalho lido:\n', header.join(' | '));
    process.exit(1);
  }

  const { rows: tenants } = await pool.query(
    `SELECT id FROM tenants WHERE billing_status IN ('active','trial') AND plan IN ('pro','enterprise')`
  );
  if (!tenants.length) { console.error('Nenhum tenant ativo — crie uma conta antes de importar.'); process.exit(1); }
  console.log('Tenants ativos:', tenants.length);

  let read=0, gf=0, inserted=0, noCoord=0;
  for (let i=1; i<lines.length; i++) {
    const f = lines[i].split(delim).map(unq);
    read++;
    const lat = numCoord(f[ci.lat]), lng = numCoord(f[ci.lng]);
    if (lat===null || lng===null) { noCoord++; continue; }
    if (lat<GF.latMin || lat>GF.latMax || lng<GF.lngMin || lng>GF.lngMax) continue;
    gf++;

    const mun = ci.mun>=0 ? f[ci.mun] : '';
    const tipo = ci.tipo>=0 ? (f[ci.tipo]||'Acidente') : 'Acidente';
    const causa = ci.causa>=0 ? (f[ci.causa]||'') : '';
    const br = ci.br>=0 ? f[ci.br] : '';
    const km = ci.km>=0 ? f[ci.km] : '';
    const mortos = ci.mortos>=0 ? toInt(f[ci.mortos]) : 0;
    const fg = ci.fg>=0 ? toInt(f[ci.fg]) : 0;
    const feridos = ci.feridos>=0 ? toInt(f[ci.feridos]) : 0;
    const sev = mortos>0 ? 'critical' : fg>0 ? 'high' : feridos>0 ? 'medium' : 'low';
    const extId = 'prf-' + (ci.id>=0 ? (f[ci.id]||i) : i);
    const desc = [tipo, causa].filter(Boolean).join(' — ') || 'Acidente PRF';
    const loc = [br?`BR-${br}`:'', km?`km ${km}`:'', mun].filter(Boolean).join(' · ');

    let created = null;
    if (ci.data>=0) {
      const d=f[ci.data], h=(ci.hora>=0?(f[ci.hora]||'00:00:00'):'00:00:00');
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T${h||'00:00:00'}`
                : /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? `${d.split('/').reverse().join('-')}T${h||'00:00:00'}` : null;
      if (iso && !isNaN(Date.parse(iso))) created = iso;
    }

    for (const t of tenants) {
      try {
        const { rows:[a] } = await pool.query(
          `INSERT INTO alerts (external_id, source, type, description, severity, status, latitude, longitude, location, tenant_id, created_at)
           VALUES ($1,'prf','prf',$2,$3,'open',$4,$5,$6,$7, COALESCE($8::timestamptz, NOW()))
           ON CONFLICT (tenant_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [extId, desc, sev, lat, lng, loc, t.id, created]
        );
        if (a) inserted++;
      } catch(e){ console.error('insert erro:', e.message); }
    }
  }
  console.log(`\nResumo: ${read} linhas | ${gf} na Grande Floripa | ${inserted} inseridos (x${tenants.length} tenant) | ${noCoord} sem coordenadas`);
  await pool.end();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
