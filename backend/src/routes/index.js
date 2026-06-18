const express  = require('express');
const router   = express.Router();
const auth     = require('../controllers/authController');
const alerts   = require('../controllers/alertsController');
const workflow = require('../controllers/workflowController');
const billing  = require('../controllers/billingController');
const stats    = require('../controllers/statsController');
const push     = require('../controllers/pushController');
const webhooks = require('../controllers/webhookController');
const twofa    = require('../controllers/twoFactorController');
const { authenticateToken, optionalAuth, requireRole, checkPlanLimit } = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimit');
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 }); // 10 tentativas / 15 min

// Auth
router.post  ('/auth/login',           authLimiter, auth.login);
router.post  ('/auth/register',        authLimiter, auth.register);
router.get   ('/auth/me',              authenticateToken, auth.me);
router.post  ('/auth/forgot-password', authLimiter, auth.forgotPassword);
router.post  ('/auth/reset-password',  authLimiter, auth.resetPassword);
router.get   ('/auth/verify-email',    auth.verifyEmail);
router.patch ('/auth/profile',         authenticateToken, auth.updateProfile);
router.patch ('/auth/change-password', authenticateToken, auth.changePassword);
router.post  ('/auth/2fa/setup',       authenticateToken, twofa.setup);
router.post  ('/auth/2fa/verify',      authenticateToken, twofa.verify);
router.post  ('/auth/2fa/disable',     authenticateToken, twofa.disable);

// Alerts
router.get   ('/alerts',             authenticateToken, alerts.list);
router.post  ('/alerts',             authenticateToken, checkPlanLimit, alerts.create);
router.patch ('/alerts/:id/status',  authenticateToken, workflow.updateStatus);
router.post  ('/alerts/:id/assign',  authenticateToken, workflow.assignAlert);
router.get   ('/alerts/:id/history', authenticateToken, workflow.getHistory);

// Stats
router.get('/stats', authenticateToken, stats.getStats);

// Billing
router.post('/billing/checkout', authenticateToken, requireRole('admin'), billing.createCheckoutSession);
router.post('/billing/portal',   authenticateToken, requireRole('admin'), billing.createPortalSession);
router.get ('/billing/status',   authenticateToken, billing.getBillingStatus);
router.get ('/billing/invoices', authenticateToken, requireRole('admin'), billing.listInvoices);
router.post('/billing/webhook',  billing.stripeWebhook);

// Webhooks
router.get   ('/webhooks',          authenticateToken, webhooks.list);
router.post  ('/webhooks',          authenticateToken, requireRole('admin'), webhooks.create);
router.delete('/webhooks/:id',      authenticateToken, requireRole('admin'), webhooks.remove);
router.post  ('/webhooks/:id/test', authenticateToken, requireRole('admin'), webhooks.test);

// Push
router.post('/push/subscribe', authenticateToken, push.subscribe);
router.get ('/push/vapid-key', push.getVapidKey);

// Health
router.get('/health', (_, res) => res.json({ status:'ok', ts:new Date() }));

module.exports = router;
