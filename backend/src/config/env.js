require('dotenv').config();
module.exports = {
  port:        process.env.PORT || 3000,
  nodeEnv:     process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
  db: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
  },
  jwt: {
    secret:         process.env.JWT_SECRET,
    expiresIn:      process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret:  process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  stripe: {
    secretKey:     process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    proPriceId:    process.env.STRIPE_PRO_PRICE_ID,
    entPriceId:    process.env.STRIPE_ENT_PRICE_ID,
  },
  resend: {
    apiKey:   process.env.RESEND_API_KEY,
    from:     process.env.RESEND_FROM || 'noreply@comunidadealerta.com.br',
    fromName: process.env.RESEND_FROM_NAME || 'Comunidade Alerta',
  },
  vapid: {
    publicKey:  process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject:    process.env.VAPID_SUBJECT || 'mailto:admin@comunidadealerta.com.br',
  },
  externalSync: process.env.ENABLE_EXTERNAL_SYNC !== 'false',
  ingestKey:    process.env.INGEST_API_KEY || null,
};
