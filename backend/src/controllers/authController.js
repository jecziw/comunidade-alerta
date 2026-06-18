const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const env    = require('../config/env');
const { sendEmail } = require('../services/emailService');

const SALT = 12;
const sign = (userId, tenantId) => jwt.sign({ userId, tenantId }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

exports.register = async (req, res) => {
  const { name, email, password, orgName, cnpjCpf } = req.body;
  if (!name || !email || !password || !orgName)
    return res.status(400).json({ error: 'Campos obrigatórios: name, email, password, orgName.' });
  if (String(password).length < 8)
    return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email)))
    return res.status(400).json({ error: 'E-mail inválido.' });

  // Normaliza o documento (só dígitos). CPF=11, CNPJ=14.
  const doc = (cnpjCpf || '').replace(/\D/g, '');
  if (doc && doc.length !== 11 && doc.length !== 14)
    return res.status(400).json({ error: 'CPF deve ter 11 dígitos ou CNPJ 14 dígitos.' });

  const PLAN = 'pro'; // plano padrão na criação da conta
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if ((await client.query('SELECT id FROM users WHERE email=$1',[email])).rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    }

    // ── Regra dos Termos: 1 trial por CNPJ/CPF por plano ──
    let trialAllowed = true;
    if (doc) {
      const prev = await client.query(
        'SELECT 1 FROM trial_history WHERE cnpj_cpf=$1 AND plan=$2 LIMIT 1', [doc, PLAN]
      );
      if (prev.rows.length) trialAllowed = false;
    }

    // Cria tenant: com trial (14 dias) se permitido; sem trial se o documento já usou
    const { rows:[tenant] } = await client.query(
      `INSERT INTO tenants(name,slug,plan,billing_status,cnpj_cpf,trial_ends_at,trial_used)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        orgName,
        orgName.toLowerCase().replace(/[^a-z0-9]/g,'-').substring(0,50),
        PLAN,
        trialAllowed ? 'trial' : 'inactive',
        doc || null,
        trialAllowed ? new Date(Date.now() + 14*86400000) : new Date(),
        trialAllowed ? false : true,
      ]
    );

    // Registra o uso do trial para o documento (impede 2º trial no mesmo plano)
    if (doc && trialAllowed) {
      await client.query(
        `INSERT INTO trial_history(cnpj_cpf,plan,tenant_id) VALUES($1,$2,$3)
         ON CONFLICT (cnpj_cpf,plan) DO NOTHING`,
        [doc, PLAN, tenant.id]
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const { rows:[user] } = await client.query(
      `INSERT INTO users(tenant_id,name,email,password_hash,role,email_verify_token)
       VALUES($1,$2,$3,$4,'admin',$5) RETURNING id,name,email,role`,
      [tenant.id, name, email, await bcrypt.hash(password,SALT), token]
    );
    await client.query('COMMIT');
    sendEmail({ to:email, subject:`Bem-vindo, ${name}!`,
      html:`<p>Conta criada. <a href="${env.frontendUrl}/verify?token=${token}">Verificar e-mail</a></p>` }).catch(()=>{});
    res.status(201).json({
      token: sign(user.id, tenant.id),
      user: { ...user, tenantId: tenant.id },
      trial: { granted: trialAllowed, days: trialAllowed ? 14 : 0 }
    });
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email||!password) return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });
  const { rows } = await pool.query(
    `SELECT u.*,t.plan,t.billing_status,t.name AS tenant_name,t.trial_ends_at
     FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=$1 AND u.is_active=true`,[email]
  );
  const user = rows[0];
  if (!user||!(await bcrypt.compare(password,user.password_hash)))
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1',[user.id]);
  res.json({ token: sign(user.id,user.tenant_id),
    user:{id:user.id,name:user.name,email:user.email,role:user.role,tenantId:user.tenant_id,plan:user.plan} });
};

exports.me             = (req,res) => {
  const u = req.user || {};
  res.json({ user: {
    id: u.id, name: u.name, email: u.email, role: u.role,
    tenantId: u.tenant_id, plan: u.plan,
    emailVerified: u.email_verified, twoFactorEnabled: u.two_factor_enabled
  }});
};
exports.updateProfile  = async (req,res) => { const {rows}=await pool.query('UPDATE users SET name=COALESCE($1,name),updated_at=NOW() WHERE id=$2 RETURNING id,name,email',[req.body.name,req.user.id]); res.json({user:rows[0]}); };
exports.changePassword = async (req,res) => {
  const {currentPassword,newPassword}=req.body;
  if(!currentPassword||!newPassword) return res.status(400).json({error:'Campos obrigatórios.'});
  if(String(newPassword).length < 8) return res.status(400).json({error:'A nova senha deve ter ao menos 8 caracteres.'});
  const {rows}=await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
  if(!(await bcrypt.compare(currentPassword,rows[0].password_hash))) return res.status(400).json({error:'Senha atual incorreta.'});
  await pool.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[await bcrypt.hash(newPassword,SALT),req.user.id]);
  res.json({message:'Senha atualizada.'});
};
exports.forgotPassword = async (req,res) => {
  const {rows}=await pool.query('SELECT id,name FROM users WHERE email=$1',[req.body.email]);
  if(rows[0]){
    const token=crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET reset_token=$1,reset_token_exp=$2 WHERE id=$3',[token,new Date(Date.now()+3600000),rows[0].id]);
    sendEmail({to:req.body.email,subject:'Reset de senha',html:`<a href="${env.frontendUrl}/reset-password.html?token=${token}">Redefinir senha</a> (válido 1h)`}).catch(()=>{});
  }
  res.json({message:'Se o e-mail existir, enviaremos as instruções.'});
};
exports.resetPassword = async (req,res) => {
  const {token,newPassword}=req.body;
  if(String(newPassword||'').length < 8) return res.status(400).json({error:'A senha deve ter ao menos 8 caracteres.'});
  const {rows}=await pool.query('SELECT id FROM users WHERE reset_token=$1 AND reset_token_exp>NOW()',[token]);
  if(!rows[0]) return res.status(400).json({error:'Token inválido ou expirado.'});
  await pool.query('UPDATE users SET password_hash=$1,reset_token=NULL,reset_token_exp=NULL WHERE id=$2',[await bcrypt.hash(newPassword,SALT),rows[0].id]);
  res.json({message:'Senha redefinida.'});
};
exports.verifyEmail = async (req,res) => {
  const {rows}=await pool.query('SELECT id FROM users WHERE email_verify_token=$1',[req.query.token]);
  if(!rows[0]) return res.status(400).json({error:'Token inválido.'});
  await pool.query('UPDATE users SET email_verified=true,email_verify_token=NULL WHERE id=$1',[rows[0].id]);
  res.json({message:'E-mail verificado.'});
};
