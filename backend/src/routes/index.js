const { Router } = require('express');
const client = require('prom-client');
const { getAlerts, postAlert, stats } = require('../controllers/alertsController');
const { health } = require('../controllers/healthController');

const router = Router();

router.get('/health', health);
router.get('/alerts', getAlerts);
router.post('/alerts', postAlert);
router.get('/stats', stats);
router.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = router;
