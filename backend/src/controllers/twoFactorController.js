/**
 * twoFactorController.js — Autenticação em dois fatores (2FA / TOTP)
 * O SEGREDO é gerado e validado AQUI no servidor. O frontend nunca cria o secret.
 */
const speakeasy = require('speakeasy');
const qrcode    = require('qrcode');
const db        = require('../db');

// POST /api/auth/2fa/setup  → gera secret + QR (ainda não ativa)
async function setup(req, res, next) {
  try {
    const userId = req.user.id;
    const secret = speakeasy.generateSecret({
      name: `Comunidade Alerta (${req.user.email})`,
      length: 20,
    });
    // Guarda como "pendente" até o usuário confirmar com um código válido
    await db.query(
      'UPDATE users SET two_factor_pending_secret = $1 WHERE id = $2',
      [secret.base32, userId]
    );
    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({
      secret: secret.base32,              // mostrado caso não consiga ler o QR
      otpauthUrl: secret.otpauth_url,
      qr: qrDataUrl,                       // imagem base64 do QR code
    });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/verify { code } → valida e ATIVA o 2FA
async function verify(req, res, next) {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    const { rows } = await db.query(
      'SELECT two_factor_pending_secret FROM users WHERE id = $1', [userId]
    );
    const pending = rows[0]?.two_factor_pending_secret;
    if (!pending) return res.status(400).json({ error: 'Inicie a configuração do 2FA primeiro.' });

    const ok = speakeasy.totp.verify({
      secret: pending, encoding: 'base32', token: String(code || ''), window: 1,
    });
    if (!ok) return res.status(400).json({ error: 'Código inválido. Tente novamente.' });

    await db.query(
      `UPDATE users SET two_factor_secret = two_factor_pending_secret,
       two_factor_enabled = true, two_factor_pending_secret = NULL WHERE id = $1`,
      [userId]
    );
    res.json({ enabled: true });
  } catch (err) { next(err); }
}

// POST /api/auth/2fa/disable → desativa
async function disable(req, res, next) {
  try {
    await db.query(
      `UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL,
       two_factor_pending_secret = NULL WHERE id = $1`,
      [req.user.id]
    );
    res.json({ enabled: false });
  } catch (err) { next(err); }
}

// Helper para o login: valida um código TOTP de um usuário com 2FA ativo
async function validateLoginCode(userId, code) {
  const { rows } = await db.query(
    'SELECT two_factor_secret FROM users WHERE id = $1 AND two_factor_enabled = true', [userId]
  );
  const secret = rows[0]?.two_factor_secret;
  if (!secret) return true; // 2FA não ativo → não bloqueia
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: String(code || ''), window: 1 });
}

module.exports = { setup, verify, disable, validateLoginCode };
