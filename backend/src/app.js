const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const client = require('prom-client');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');

client.collectDefaultMetrics();

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duração das requisições HTTP em ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 400, 800, 1500]
});

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status_code: res.statusCode });
  });
  next();
});

app.use('/api', routes);
app.use(errorHandler);

module.exports = app;
