#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# restaurar-db.sh — restaura um backup por cima do banco atual
#
# ATENCAO: SUBSTITUI os dados existentes. Pede confirmacao.
#
# Uso:  ./restaurar-db.sh /home/ubuntu/backups/ca_2026-08-09_0300.sql.gz
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ARQUIVO="${1:-}"
CONTAINER="comunidade-alerta-db-1"

[ -z "$ARQUIVO" ] && { echo "Uso: $0 <arquivo.sql.gz>"; ls -1t /home/ubuntu/backups/ca_*.sql.gz 2>/dev/null | head -5; exit 1; }
[ -f "$ARQUIVO" ] || { echo "Arquivo nao encontrado: $ARQUIVO"; exit 1; }

echo "Backup:  $ARQUIVO"
echo "Destino: banco comunidade_alerta (container $CONTAINER)"
echo
echo "Isto SUBSTITUI todos os dados atuais."
read -r -p 'Digite RESTAURAR para confirmar: ' resposta
[ "$resposta" = "RESTAURAR" ] || { echo "Cancelado."; exit 0; }

echo "Restaurando..."
zcat "$ARQUIVO" | docker exec -i "$CONTAINER" psql -U postgres -d comunidade_alerta

echo "Conferindo:"
docker exec "$CONTAINER" psql -U postgres -d comunidade_alerta \
  -c "SELECT source, COUNT(*) FROM alerts GROUP BY source ORDER BY source;"
