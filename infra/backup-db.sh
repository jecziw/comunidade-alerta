#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# backup-db.sh — copia diaria do PostgreSQL do Comunidade Alerta
#
# Protege: alertas PRF/INMET, as 25 delegacias geocodificadas,
# usuarios e tenants. Hoje NAO existe nenhuma copia desses dados.
#
# Instalar (uma vez):
#   chmod +x ~/comunidade-alerta/infra/backup-db.sh
#   crontab -e
#   0 3 * * * /home/ubuntu/comunidade-alerta/infra/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER="comunidade-alerta-db-1"
DB_USER="postgres"
DB_NAME="comunidade_alerta"
DEST="/home/ubuntu/backups"
RETENCAO_DIAS=7
CARIMBO="$(date +%Y-%m-%d_%H%M)"
ARQUIVO="$DEST/ca_${CARIMBO}.sql.gz"

mkdir -p "$DEST"

echo "[$(date '+%F %T')] iniciando backup..."

# --clean --if-exists deixa o dump pronto para restaurar por cima
if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
     | gzip > "$ARQUIVO"; then
  echo "[$(date '+%F %T')] ERRO: pg_dump falhou" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

# Um dump valido nunca e minusculo — barra "backup vazio" passando por bom
TAM=$(stat -c%s "$ARQUIVO")
if [ "$TAM" -lt 10240 ]; then
  echo "[$(date '+%F %T')] ERRO: backup com apenas ${TAM} bytes — suspeito" >&2
  rm -f "$ARQUIVO"
  exit 1
fi

# Verifica que o gzip nao esta corrompido
gzip -t "$ARQUIVO" || { echo "ERRO: arquivo corrompido" >&2; rm -f "$ARQUIVO"; exit 1; }

echo "[$(date '+%F %T')] OK  $ARQUIVO  ($(numfmt --to=iec "$TAM"))"

# Conferencia rapida do conteudo
LINHAS=$(zcat "$ARQUIVO" | grep -c "INSERT INTO\|COPY " || true)
echo "[$(date '+%F %T')] blocos de dados no dump: $LINHAS"

# Expurgo dos antigos
APAGADOS=$(find "$DEST" -name "ca_*.sql.gz" -mtime +$RETENCAO_DIAS -print -delete | wc -l)
[ "$APAGADOS" -gt 0 ] && echo "[$(date '+%F %T')] removidos $APAGADOS backup(s) com mais de $RETENCAO_DIAS dias"

echo "[$(date '+%F %T')] backups guardados: $(ls -1 "$DEST"/ca_*.sql.gz 2>/dev/null | wc -l)"
