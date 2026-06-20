#!/usr/bin/env bash
# Setup do servidor: VAPID + chave de ingestão + tabela de push + rebuild.
# Idempotente: pode rodar várias vezes sem duplicar nada.
set -e
cd ~/comunidade-alerta
echo "== Comunidade Alerta — setup do servidor =="

# 1) Chaves VAPID (geradas dentro do container; só se ainda não existirem no .env)
if ! grep -q "^VAPID_PUBLIC_KEY=" .env 2>/dev/null; then
  echo "-> Gerando chaves VAPID..."
  KEYS=$(docker compose exec -T backend node -e 'const k=require("web-push").generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)')
  PUB=$(echo "$KEYS"  | sed -n '1p' | tr -d "\r")
  PRIV=$(echo "$KEYS" | sed -n '2p' | tr -d "\r")
  if [ -n "$PUB" ] && [ -n "$PRIV" ]; then
    echo "VAPID_PUBLIC_KEY=$PUB"   >> .env
    echo "VAPID_PRIVATE_KEY=$PRIV" >> .env
    echo "   VAPID OK"
  else
    echo "   AVISO: não consegui gerar VAPID (backend rodando?). Push ficará desativado até configurar."
  fi
else
  echo "-> VAPID já configurado, mantendo."
fi

# 2) Chave da ingestão
if ! grep -q "^INGEST_API_KEY=" .env 2>/dev/null; then
  echo "INGEST_API_KEY=$(openssl rand -hex 24)" >> .env
  echo "-> INGEST_API_KEY criada."
else
  echo "-> INGEST_API_KEY já existe."
fi

# 3) Tabela de assinaturas públicas (push do cidadão)
echo "-> Garantindo tabela public_subscriptions..."
docker compose exec -T db psql -U postgres -d comunidade_alerta -c "CREATE TABLE IF NOT EXISTS public_subscriptions (id SERIAL PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, subscription JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());"

# 4) Rebuild + recriar (carrega o .env novo)
echo "-> Rebuild (pode demorar alguns minutos)..."
docker compose build --no-cache frontend backend
docker compose up -d --force-recreate frontend backend

echo "== SETUP CONCLUÍDO =="
