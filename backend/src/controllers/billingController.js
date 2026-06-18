// backend/src/controllers/billingController.js
// Versão atualizada para o novo frontend (portal session, trial flow, webhooks completos)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool   = require('../db');
const { sendEmail } = require('../services/emailService');

// ── Planos Stripe (IDs do dashboard Stripe — ajuste para os seus) ──
const PLANS = {
  pro:        { priceId: process.env.STRIPE_PRO_PRICE_ID,   name: 'Profissional', limit: -1 },
  enterprise: { priceId: process.env.STRIPE_ENT_PRICE_ID,   name: 'Corporativo',  limit: -1 },
  free:       { priceId: null,                               name: 'Básico',       limit: 50 },
};

// ────────────────────────────────────────────
// POST /billing/checkout
// Cria sessão de Stripe Checkout para upgrade/ativação após trial
// ────────────────────────────────────────────
exports.createCheckoutSession = async (req, res) => {
  try {
    const { planId = 'pro' } = req.body;
    const plan = PLANS[planId];
    if (!plan || !plan.priceId) {
      return res.status(400).json({ error: 'Plano inválido ou sem cobrança.' });
    }

    const tenant = req.tenant; // injetado pelo middleware auth.js

    // Busca ou cria customer Stripe
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    req.user.email,
        name:     tenant.name,
        metadata: { tenant_id: tenant.id, user_id: req.user.id },
      });
      customerId = customer.id;
      await pool.query(
        'UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, tenant.id]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      mode:                 'subscription',
      line_items: [{
        price:    plan.priceId,
        quantity: 1,
      }],
      subscription_data: {
        trial_period_days: tenant.trial_used ? 0 : 14,
        metadata: { tenant_id: tenant.id, plan: planId },
      },
      success_url: `${process.env.FRONTEND_URL}/index.html?billing=success&plan=${planId}`,
      cancel_url:  `${process.env.FRONTEND_URL}/index.html?billing=cancelled`,
      metadata: { tenant_id: tenant.id, plan: planId },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[billingController] checkout error:', err);
    res.status(500).json({ error: 'Erro ao criar sessão de checkout.' });
  }
};

// ────────────────────────────────────────────
// POST /billing/portal
// Cria sessão do Stripe Billing Portal (gerenciar cartão, cancelar, ver faturas)
// ────────────────────────────────────────────
exports.createPortalSession = async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant.stripe_customer_id) {
      return res.status(400).json({
        error: 'Nenhum método de pagamento cadastrado.',
        code:  'NO_STRIPE_CUSTOMER',
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   tenant.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/index.html?section=faturamento`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billingController] portal error:', err);
    res.status(500).json({ error: 'Erro ao abrir portal de assinatura.' });
  }
};

// ────────────────────────────────────────────
// GET /billing/status
// Retorna estado atual do plano/trial para o frontend
// ────────────────────────────────────────────
exports.getBillingStatus = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT plan, trial_ends_at, stripe_customer_id,
              stripe_subscription_id, billing_status, trial_used
       FROM tenants WHERE id = $1`,
      [req.tenant.id]
    );
    const t = rows[0];
    if (!t) return res.status(404).json({ error: 'Tenant não encontrado.' });

    const now        = new Date();
    const trialEnds  = t.trial_ends_at ? new Date(t.trial_ends_at) : null;
    const trialDays  = trialEnds ? Math.max(0, Math.ceil((trialEnds - now) / 86400000)) : 0;
    const inTrial    = trialEnds && trialEnds > now;

    res.json({
      plan:               t.plan || 'free',
      billing_status:     t.billing_status || 'trial',
      in_trial:           inTrial,
      trial_days_left:    trialDays,
      trial_ends_at:      t.trial_ends_at,
      has_payment_method: !!t.stripe_customer_id,
      has_subscription:   !!t.stripe_subscription_id,
    });
  } catch (err) {
    console.error('[billingController] status error:', err);
    res.status(500).json({ error: 'Erro ao buscar status do plano.' });
  }
};

// ────────────────────────────────────────────
// GET /billing/invoices
// Lista faturas do cliente no Stripe
// ────────────────────────────────────────────
exports.listInvoices = async (req, res) => {
  try {
    const tenant = req.tenant;
    if (!tenant.stripe_customer_id) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: tenant.stripe_customer_id,
      limit:    12,
    });

    const formatted = invoices.data.map(inv => ({
      id:          inv.id,
      number:      inv.number,
      period:      new Date(inv.period_start * 1000).toLocaleDateString('pt-BR', { month:'long', year:'numeric' }),
      amount:      (inv.amount_paid / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' }),
      due_date:    inv.due_date ? new Date(inv.due_date * 1000).toLocaleDateString('pt-BR') : '—',
      status:      inv.status,   // draft | open | paid | void | uncollectible
      pdf_url:     inv.invoice_pdf,
      hosted_url:  inv.hosted_invoice_url,
    }));

    res.json({ invoices: formatted });
  } catch (err) {
    console.error('[billingController] invoices error:', err);
    res.status(500).json({ error: 'Erro ao buscar faturas.' });
  }
};

// ────────────────────────────────────────────
// POST /billing/webhook   (Stripe → nosso backend)
// Processa eventos do Stripe de forma idempotente
// ────────────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[billingController] webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const tenantId = event.data?.object?.metadata?.tenant_id;

  try {
    switch (event.type) {

      // Checkout concluído → ativa plano
      case 'checkout.session.completed': {
        const session = event.data.object;
        const plan    = session.metadata?.plan || 'pro';
        if (tenantId) {
          await pool.query(
            `UPDATE tenants
             SET plan = $1, billing_status = 'active',
                 stripe_subscription_id = $2, trial_used = true
             WHERE id = $3`,
            [plan, session.subscription, tenantId]
          );
          console.log(`[billing] Tenant ${tenantId} ativado no plano ${plan}`);
        }
        break;
      }

      // Fatura paga
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (tenantId) {
          await pool.query(
            `UPDATE tenants SET billing_status = 'active' WHERE id = $1`,
            [tenantId]
          );
          // Notifica o admin por e-mail
          const { rows } = await pool.query(
            `SELECT u.email, u.name FROM users u
             JOIN tenants t ON t.id = u.tenant_id
             WHERE t.id = $1 AND u.role = 'admin' LIMIT 1`,
            [tenantId]
          );
          if (rows[0]) {
            await sendEmail({
              to:      rows[0].email,
              subject: 'Fatura paga — Comunidade Alerta',
              html:    `<p>Olá ${rows[0].name}, sua fatura de R$ ${(invoice.amount_paid/100).toFixed(2).replace('.',',')} foi paga com sucesso.</p>`,
            });
          }
        }
        break;
      }

      // Fatura falhou
      case 'invoice.payment_failed': {
        if (tenantId) {
          await pool.query(
            `UPDATE tenants SET billing_status = 'past_due' WHERE id = $1`,
            [tenantId]
          );
        }
        break;
      }

      // Assinatura cancelada
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        if (tenantId) {
          await pool.query(
            `UPDATE tenants
             SET plan = 'free', billing_status = 'cancelled',
                 stripe_subscription_id = NULL
             WHERE id = $1`,
            [tenantId]
          );
        }
        break;
      }

      // Trial terminando (Stripe avisa 3 dias antes)
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object;
        if (tenantId) {
          const { rows } = await pool.query(
            `SELECT u.email, u.name FROM users u
             WHERE u.tenant_id = $1 AND u.role = 'admin' LIMIT 1`,
            [tenantId]
          );
          if (rows[0]) {
            await sendEmail({
              to:      rows[0].email,
              subject: '⏰ Seu trial encerra em 3 dias — Comunidade Alerta',
              html: `<p>Olá ${rows[0].name}!</p>
                     <p>Seu período de teste gratuito encerra em <strong>3 dias</strong>.</p>
                     <p>Para continuar usando sem interrupção, adicione um cartão de crédito no painel.</p>
                     <a href="${process.env.FRONTEND_URL}/index.html?section=faturamento">Gerenciar assinatura →</a>`,
            });
          }
        }
        break;
      }

      default:
        // Ignora eventos não tratados
        break;
    }

    res.json({ received: true, type: event.type });
  } catch (err) {
    console.error('[billingController] webhook processing error:', err);
    res.status(500).json({ error: 'Erro ao processar webhook.' });
  }
};
