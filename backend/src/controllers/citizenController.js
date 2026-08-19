/**
 * citizenController.js — canal do cidadão (modelo CityProtect)
 *
 * REGRA CENTRAL: nada que o cidadão envia aparece no mapa público
 * automaticamente. Toda denúncia entra como 'pending' e só é publicada
 * depois que a equipe aprova.
 *
 * Sem essa etapa, um único mal-intencionado enche o mapa de ocorrências
 * falsas — e o dano não fica só nelas: o público passa a duvidar também
 * dos dados reais da PRF e do INMET que estão ao lado.
 */

const crypto = require('crypto');
const { pool } = require('../db');

// Limites contra abuso
const MAX_POR_IP_HORA = 5;
const MAX_DESCRICAO   = 1000;

const TIPOS_ACEITOS = ['crime','furto','transito','infra','feminicidio','outro'];

// Hash do IP com sal do ambiente: permite contar envios sem guardar o IP.
const hashIp = (ip) =>
  crypto.createHash('sha256')
        .update(String(ip) + (process.env.JWT_SECRET || 'sal-local'))
        .digest('hex');

/**
 * POST /api/public/report — qualquer pessoa, sem login.
 */
exports.receberDenuncia = async (req, res) => {
  const { type, description, location, latitude, longitude, occurred_at, contact_email } = req.body || {};

  // ── validação ──
  if (!description || String(description).trim().length < 15)
    return res.status(400).json({ error: 'Descreva o ocorrido com pelo menos 15 caracteres.' });

  if (String(description).length > MAX_DESCRICAO)
    return res.status(400).json({ error: `Descrição muito longa (máximo ${MAX_DESCRICAO} caracteres).` });

  if (!type || !TIPOS_ACEITOS.includes(type))
    return res.status(400).json({ error: 'Selecione um tipo válido de ocorrência.' });

  if (!location || String(location).trim().length < 3)
    return res.status(400).json({ error: 'Informe o local aproximado.' });

  if (contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact_email))
    return res.status(400).json({ error: 'E-mail inválido. Deixe em branco para denunciar anonimamente.' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const ipH = hashIp(ip);

  try {
    // ── freio contra enxurrada de envios ──
    const { rows: [{ recentes }] } = await pool.query(
      `SELECT COUNT(*)::int AS recentes FROM citizen_reports
        WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [ipH]);

    if (recentes >= MAX_POR_IP_HORA)
      return res.status(429).json({
        error: 'Você enviou muitas denúncias na última hora. Tente novamente mais tarde.',
        code: 'LIMITE_ATINGIDO'
      });

    const { rows: [r] } = await pool.query(
      `INSERT INTO citizen_reports
         (type, description, location, latitude, longitude, occurred_at,
          contact_email, ip_hash, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, created_at`,
      [type, String(description).trim(), String(location).trim(),
       latitude || null, longitude || null, occurred_at || null,
       contact_email ? String(contact_email).trim() : null,
       ipH, String(req.headers['user-agent'] || '').slice(0, 200)]);

    // Protocolo curto: a pessoa pode acompanhar sem se identificar
    const protocolo = r.id.split('-')[0].toUpperCase();

    res.status(201).json({
      ok: true,
      protocolo,
      mensagem: 'Denúncia recebida. Ela será analisada pela equipe antes de aparecer no mapa público.',
      anonima: !contact_email
    });
  } catch (err) {
    console.error('[cidadao] receber erro:', err.message);
    res.status(500).json({ error: 'Não foi possível registrar agora. Tente novamente.' });
  }
};

/**
 * GET /api/public/report/:protocolo — consulta pública do andamento.
 * Devolve só o status, nunca o conteúdo — o protocolo é curto e
 * adivinhável, então não pode expor a denúncia em si.
 */
exports.consultarProtocolo = async (req, res) => {
  const { protocolo } = req.params;
  if (!/^[0-9A-F]{8}$/i.test(protocolo))
    return res.status(400).json({ error: 'Protocolo inválido.' });

  try {
    const { rows: [r] } = await pool.query(
      `SELECT status, created_at, reviewed_at FROM citizen_reports
        WHERE id::text LIKE $1 || '%' LIMIT 1`, [protocolo.toLowerCase()]);

    if (!r) return res.status(404).json({ error: 'Protocolo não encontrado.' });

    const textos = {
      pending:   'Em análise pela equipe',
      approved:  'Aprovada e publicada no mapa',
      rejected:  'Não publicada após análise',
      duplicate: 'Já havia registro semelhante'
    };
    res.json({
      protocolo: protocolo.toUpperCase(),
      status: r.status,
      situacao: textos[r.status] || r.status,
      recebida_em: r.created_at,
      analisada_em: r.reviewed_at
    });
  } catch (err) {
    console.error('[cidadao] consulta erro:', err.message);
    res.status(500).json({ error: 'Erro ao consultar.' });
  }
};

/**
 * GET /api/reports/pending — fila de triagem (equipe autenticada).
 */
exports.listarPendentes = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, description, location, latitude, longitude,
              occurred_at, created_at,
              (contact_email IS NOT NULL) AS tem_contato
         FROM citizen_reports
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 100`);
    res.json({ pendentes: rows, total: rows.length });
  } catch (err) {
    console.error('[cidadao] fila erro:', err.message);
    res.status(500).json({ error: 'Erro ao carregar a fila.' });
  }
};

/**
 * POST /api/reports/:id/review — aprovar ou recusar.
 * Aprovar cria o alerta de verdade, com source='cidadao' para que
 * fique claro na origem que veio da população, não de órgão oficial.
 */
exports.revisarDenuncia = async (req, res) => {
  const { id } = req.params;
  const { decisao, nota } = req.body || {};

  if (!['approved','rejected','duplicate'].includes(decisao))
    return res.status(400).json({ error: 'Decisão inválida.' });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const { rows: [d] } = await cliente.query(
      `SELECT * FROM citizen_reports WHERE id = $1 AND status = 'pending' FOR UPDATE`, [id]);
    if (!d) { await cliente.query('ROLLBACK');
      return res.status(404).json({ error: 'Denúncia não encontrada ou já analisada.' }); }

    let alertaId = null;

    if (decisao === 'approved') {
      const { rows: [a] } = await cliente.query(
        `INSERT INTO alerts
           (external_id, source, type, description, location, latitude, longitude,
            severity, status, tenant_id, created_by, created_at)
         VALUES ($1,'cidadao',$2,$3,$4,$5,$6,'medium','open',$7,$8,NOW())
         RETURNING id`,
        ['cidadao:' + d.id.split('-')[0], d.type, d.description, d.location,
         d.latitude, d.longitude, req.tenant.id, req.user.id]);
      alertaId = a.id;
    }

    await cliente.query(
      `UPDATE citizen_reports
          SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
              review_note = $3, published_alert_id = $4
        WHERE id = $5`,
      [decisao, req.user.id, nota || null, alertaId, id]);

    await cliente.query('COMMIT');

    // Avisa o cidadão, se ele deixou contato
    if (d.contact_email) {
      try {
        const { sendEmail } = require('../services/emailService');
        const protocolo = d.id.split('-')[0].toUpperCase();
        sendEmail({
          to: d.contact_email,
          subject: `Sua denúncia ${protocolo} foi analisada`,
          html: decisao === 'approved'
            ? `<p>Sua denúncia <strong>${protocolo}</strong> foi verificada e já aparece no mapa público.</p><p>Obrigado por colaborar.</p>`
            : `<p>Sua denúncia <strong>${protocolo}</strong> foi analisada e não será publicada.</p>${nota ? `<p>${nota}</p>` : ''}<p>Em caso de emergência, ligue 190.</p>`
        }).catch(() => {});
      } catch(_) {}
    }

    res.json({ ok: true, decisao, alerta_publicado: alertaId });
  } catch (err) {
    await cliente.query('ROLLBACK');
    console.error('[cidadao] revisao erro:', err.message);
    res.status(500).json({ error: 'Erro ao registrar a decisão.' });
  } finally {
    cliente.release();
  }
};
