/**
 * accountController.js — direitos do titular (LGPD)
 *
 * Implementa dois direitos do art. 18:
 *   V  — portabilidade / acesso: exportar os proprios dados
 *   VI — eliminacao: excluir a conta
 *
 * PRINCIPIO QUE GUIA ESTE ARQUIVO:
 * Dado PESSOAL do titular e apagado. Dado de OCORRENCIA (PRF, INMET,
 * delegacias) e preservado e desvinculado — sao registros de interesse
 * publico (art. 16 da LGPD e Lei de Acesso a Informacao), nao pertencem
 * a uma pessoa. Apagar 753 alertas porque um usuario saiu destruiria
 * dado publico que nao e dele.
 */

const crypto = require('crypto');
const { pool } = require('../db');

const DIAS_ATE_ELIMINAR = 30;

const hashTitular = (email) =>
  crypto.createHash('sha256').update(String(email).toLowerCase().trim()).digest('hex');

/**
 * GET /api/account/export
 * Art. 18, V — o titular pode obter os proprios dados.
 */
exports.exportarDados = async (req, res) => {
  try {
    const { rows: [u] } = await pool.query(
      `SELECT id, name, email, role, is_active, email_verified,
              last_login_at, created_at, updated_at, tenant_id
         FROM users WHERE id = $1`, [req.user.id]);

    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const { rows: [t] } = await pool.query(
      `SELECT name, plan, billing_status, created_at FROM tenants WHERE id = $1`,
      [u.tenant_id]);

    const { rows: criados } = await pool.query(
      `SELECT external_id, source, type, description, location, status, created_at
         FROM alerts WHERE created_by = $1 ORDER BY created_at DESC`, [req.user.id]);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="meus-dados-${new Date().toISOString().slice(0,10)}.json"`);

    res.json({
      gerado_em: new Date().toISOString(),
      observacao: 'Exportação conforme art. 18, V da LGPD.',
      titular: u,
      organizacao: t || null,
      ocorrencias_que_registrei: criados,
      nota_sobre_ocorrencias:
        'Ocorrências registradas por você permanecem na plataforma como dado de ' +
        'interesse público, mas deixam de ser vinculadas à sua identidade caso ' +
        'você solicite a exclusão da conta.'
    });
  } catch (err) {
    console.error('[conta] exportar erro:', err.message);
    res.status(500).json({ error: 'Não foi possível gerar a exportação.' });
  }
};

/**
 * POST /api/account/delete
 * Art. 18, VI — solicitar eliminacao.
 *
 * A conta e desativada IMEDIATAMENTE (o titular perde o acesso na hora),
 * mas a eliminacao definitiva ocorre apos 30 dias. Esse intervalo protege
 * contra exclusao acidental e contra pedido feito por quem invadiu a conta.
 */
exports.solicitarExclusao = async (req, res) => {
  const { senha } = req.body || {};
  if (!senha) return res.status(400).json({ error: 'Confirme sua senha para prosseguir.' });

  const cliente = await pool.connect();
  try {
    const { rows: [u] } = await cliente.query(
      'SELECT id, email, password_hash, role, tenant_id FROM users WHERE id = $1',
      [req.user.id]);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const bcrypt = require('bcrypt');
    if (!(await bcrypt.compare(senha, u.password_hash)))
      return res.status(401).json({ error: 'Senha incorreta.' });

    // Se e o unico admin, o tenant ficaria sem responsavel — e os dados da
    // organizacao sem quem os administre. Melhor barrar e orientar.
    if (u.role === 'admin') {
      const { rows: [{ total }] } = await cliente.query(
        `SELECT COUNT(*)::int AS total FROM users
          WHERE tenant_id = $1 AND role = 'admin' AND is_active = true
            AND deletion_requested_at IS NULL AND id <> $2`,
        [u.tenant_id, u.id]);
      if (total === 0) {
        return res.status(409).json({
          error: 'Você é o único administrador desta organização.',
          code: 'ULTIMO_ADMIN',
          orientacao: 'Promova outro usuário a administrador antes de excluir sua conta, ' +
                      'ou entre em contato para encerrar a organização inteira.'
        });
      }
    }

    const agora = new Date();
    const quando = new Date(agora.getTime() + DIAS_ATE_ELIMINAR * 864e5);

    await cliente.query(
      `UPDATE users SET deletion_requested_at = $1, deletion_scheduled_at = $2,
              is_active = false, updated_at = NOW() WHERE id = $3`,
      [agora, quando, u.id]);

    res.json({
      ok: true,
      solicitado_em: agora.toISOString(),
      eliminacao_em: quando.toISOString(),
      mensagem: `Sua conta foi desativada. A eliminação definitiva ocorrerá em ${DIAS_ATE_ELIMINAR} dias. ` +
                'Até lá, você pode cancelar entrando em contato com o suporte.'
    });
  } catch (err) {
    console.error('[conta] exclusao erro:', err.message);
    res.status(500).json({ error: 'Não foi possível processar a solicitação.' });
  } finally {
    cliente.release();
  }
};

/**
 * Executa as eliminacoes vencidas. Chamado por rotina diaria.
 *
 * NAO apaga a linha do usuario: apaga o CONTEUDO PESSOAL dela.
 * Motivo: alerts.created_by aponta para users. Remover a linha
 * dispararia SET NULL e perderiamos a informacao de que aquele alerta
 * teve um autor — o que atrapalha auditoria. Anonimizar preserva a
 * cadeia sem preservar a identidade.
 */
exports.executarEliminacoesVencidas = async () => {
  const cliente = await pool.connect();
  let feitas = 0;
  try {
    const { rows: vencidos } = await cliente.query(
      `SELECT id, email, tenant_id, deletion_requested_at FROM users
        WHERE deletion_scheduled_at IS NOT NULL
          AND deletion_scheduled_at <= NOW()
          AND anonymized_at IS NULL`);

    for (const u of vencidos) {
      await cliente.query('BEGIN');
      try {
        const { rows: [{ mantidos }] } = await cliente.query(
          `SELECT COUNT(*)::int AS mantidos FROM alerts WHERE created_by = $1`, [u.id]);

        // Apaga o dado pessoal, mantem a linha (integridade referencial)
        await cliente.query(
          `UPDATE users SET
             name = 'Usuário removido',
             email = 'removido+' || id || '@invalido.local',
             password_hash = '!',
             push_subscription = NULL,
             email_verify_token = NULL,
             reset_token = NULL,
             reset_token_exp = NULL,
             last_login_at = NULL,
             is_active = false,
             anonymized_at = NOW(),
             updated_at = NOW()
           WHERE id = $1`, [u.id]);

        // Comprovante sem dado pessoal
        await cliente.query(
          `INSERT INTO deletion_log (subject_hash, tenant_id, requested_at, records_kept, notes)
           VALUES ($1,$2,$3,$4,$5)`,
          [hashTitular(u.email), u.tenant_id, u.deletion_requested_at, mantidos,
           'Dados pessoais eliminados. Ocorrências preservadas e desvinculadas (interesse público).']);

        await cliente.query('COMMIT');
        feitas++;
        console.log(`[LGPD] conta ${u.id} anonimizada — ${mantidos} ocorrência(s) preservada(s)`);
      } catch (e) {
        await cliente.query('ROLLBACK');
        console.error(`[LGPD] falha ao anonimizar ${u.id}:`, e.message);
      }
    }
  } finally {
    cliente.release();
  }
  return feitas;
};

/** GET /api/account/deletion-status */
exports.statusExclusao = async (req, res) => {
  try {
    const { rows: [u] } = await pool.query(
      'SELECT deletion_requested_at, deletion_scheduled_at FROM users WHERE id = $1',
      [req.user.id]);
    res.json({
      pendente: !!u?.deletion_requested_at,
      solicitado_em: u?.deletion_requested_at || null,
      eliminacao_em: u?.deletion_scheduled_at || null
    });
  } catch {
    res.status(500).json({ error: 'Erro ao consultar.' });
  }
};
