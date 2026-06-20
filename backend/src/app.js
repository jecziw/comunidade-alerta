const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const morgan    = require('morgan');
const client    = require('prom-client');
const env       = require('./config/env');
const routes    = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();
app.set('trust proxy', 1); // atrás do nginx: usa X-Forwarded-For p/ req.ip (rate limit por IP real)
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5],
  registers: [register],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode }));
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:     ["'self'", "data:", "blob:", "https://*.basemaps.cartocdn.com", "https://unpkg.com", "https://*.openstreetmap.org"],
      connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "ws:", "wss:"],
      workerSrc:  ["'self'"],
      objectSrc:  ["'none'"],
      baseUri:    ["'self'"],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: [env.frontendUrl,'http://localhost:8080'], credentials: true }));
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api', routes);
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use(errorHandler);

module.exports = app;
