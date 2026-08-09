#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# healthcheck.sh — verifica se o sistema esta realmente saudavel
#
# Motivo: o polling do INMET roda a cada 5 min. Se parar (API fora,
# contrato mudou, container reiniciado), ninguem fica sabendo — o
# painel simplesmente para de receber alertas novos, em silencio.
#
# Instalar:
#   crontab -e
#   */30 * * * * /home/ubuntu/comunidade-alerta/infra/healthcheck.sh >> /home/ubuntu/health.log 2>&1
# ─────────────────────────────────────────────────────────────
set -uo pipefail

DB="comunidade-alerta-db-1"
BACK="comunidade-alerta-backend-1"
FRONT="comunidade-alerta-frontend-1"
HORAS_SEM_INMET=6          # alerta se nao entrar aviso INMET nesse periodo
FALHAS=0

erro() { echo "[$(date '+%F %T')] FALHA: $*"; FALHAS=$((FALHAS+1)); }
ok()   { echo "[$(date '+%F %T')] ok    $*"; }

# 1. containers de pe
for ct in "$DB" "$BACK" "$FRONT"; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$ct" 2>/dev/null)" = "true" ]; then
    ok "container $ct"
  else
    erro "container $ct NAO esta rodando"
  fi
done

# 2. API respondendo
COD=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:3000/api/health || echo 000)
[ "$COD" = "200" ] && ok "API /health ($COD)" || erro "API /health devolveu $COD"

# 3. site no ar
COD=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:8080/ || echo 000)
[ "$COD" = "200" ] && ok "site :8080 ($COD)" || erro "site :8080 devolveu $COD"

# 4. banco aceitando consulta
if docker exec "$DB" pg_isready -U postgres -q 2>/dev/null; then
  ok "PostgreSQL aceitando conexao"
else
  erro "PostgreSQL nao responde"
fi

# 5. INGESTAO — o ponto que ninguem percebe quando quebra
ULTIMO=$(docker exec "$DB" psql -U postgres -d comunidade_alerta -t -A -c \
  "SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/3600, 999)::int
     FROM alerts WHERE source='inmet';" 2>/dev/null | tr -d ' ')

if [ -z "$ULTIMO" ]; then
  erro "nao foi possivel consultar a ingestao do INMET"
elif [ "$ULTIMO" -gt "$HORAS_SEM_INMET" ]; then
  erro "INMET sem alertas novos ha ${ULTIMO}h (limite: ${HORAS_SEM_INMET}h) — polling pode ter parado"
else
  ok "INMET recebeu alerta ha ${ULTIMO}h"
fi

# 6. espaco em disco (banco enche silenciosamente)
USO=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')
[ "$USO" -lt 85 ] && ok "disco em ${USO}%" || erro "disco em ${USO}% — risco de parada"

# 7. backup recente existe?
if ls /home/ubuntu/backups/ca_*.sql.gz >/dev/null 2>&1; then
  IDADE=$(( ( $(date +%s) - $(stat -c %Y "$(ls -1t /home/ubuntu/backups/ca_*.sql.gz | head -1)") ) / 3600 ))
  [ "$IDADE" -lt 48 ] && ok "backup mais recente: ${IDADE}h" || erro "backup mais recente tem ${IDADE}h"
else
  erro "nenhum backup encontrado em /home/ubuntu/backups"
fi

echo "─────────────────────────────────────────"
if [ "$FALHAS" -eq 0 ]; then
  echo "[$(date '+%F %T')] TUDO OK"
  exit 0
else
  echo "[$(date '+%F %T')] $FALHAS FALHA(S) — verificar"
  exit 1
fi
