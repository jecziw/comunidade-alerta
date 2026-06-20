-- Migration 005: assinaturas de Web Push do cidadão (página pública)
CREATE TABLE IF NOT EXISTS public_subscriptions (
  id           SERIAL PRIMARY KEY,
  endpoint     TEXT UNIQUE NOT NULL,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
