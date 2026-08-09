#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-https.sh — HTTPS gratuito via Let's Encrypt
#
# ANTES DE RODAR:
#   1. Registrar um dominio (Registro.br ~R$40/ano)
#   2. Criar um registro DNS tipo A apontando para 18.229.131.113
#   3. Aguardar propagacao (dig SEU-DOMINIO +short deve devolver o IP)
#   4. Liberar as portas 80 e 443 no Security Group da AWS
#
# Uso:  sudo ./setup-https.sh comunidadealerta.com.br seu@email.com
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DOMINIO="${1:-}"
EMAIL="${2:-}"

[ -z "$DOMINIO" ] || [ -z "$EMAIL" ] && {
  echo "Uso: sudo $0 <dominio> <email>"
  echo "Ex.: sudo $0 comunidadealerta.com.br contato@exemplo.com"
  exit 1; }

echo "==> Conferindo se o DNS ja aponta para este servidor"
IP_SERVIDOR=$(curl -s --max-time 10 https://api.ipify.org || echo '?')
IP_DOMINIO=$(dig +short "$DOMINIO" | tail -1)
echo "    servidor: $IP_SERVIDOR"
echo "    dominio : ${IP_DOMINIO:-nao resolve}"
if [ "$IP_SERVIDOR" != "$IP_DOMINIO" ]; then
  echo
  echo "    O dominio ainda nao aponta para este servidor."
  echo "    O Let's Encrypt vai FALHAR se seguir agora."
  read -r -p '    Continuar mesmo assim? (s/N) ' r
  [ "$r" = "s" ] || exit 1
fi

echo "==> Instalando Certbot"
apt-get update -qq
apt-get install -y certbot -qq

echo "==> Liberando a porta 80 (o Certbot precisa validar por ela)"
docker stop comunidade-alerta-frontend-1 2>/dev/null || true

echo "==> Emitindo o certificado"
certbot certonly --standalone \
  -d "$DOMINIO" -d "www.$DOMINIO" \
  --non-interactive --agree-tos -m "$EMAIL" \
  --preferred-challenges http

echo "==> Copiando certificados para onde o nginx enxerga"
mkdir -p /home/ubuntu/comunidade-alerta/infra/certs
cp -L "/etc/letsencrypt/live/$DOMINIO/fullchain.pem" /home/ubuntu/comunidade-alerta/infra/certs/
cp -L "/etc/letsencrypt/live/$DOMINIO/privkey.pem"  /home/ubuntu/comunidade-alerta/infra/certs/
chmod 644 /home/ubuntu/comunidade-alerta/infra/certs/*.pem

echo "==> Renovacao automatica (o certificado vence a cada 90 dias)"
cat > /etc/cron.d/certbot-ca <<CRON
0 4 1 * * root certbot renew --quiet --pre-hook "docker stop comunidade-alerta-frontend-1" --post-hook "cp -L /etc/letsencrypt/live/$DOMINIO/*.pem /home/ubuntu/comunidade-alerta/infra/certs/ && docker start comunidade-alerta-frontend-1"
CRON

echo
echo "Certificado emitido."
echo
echo "Proximos passos:"
echo "  1. Substituir o nginx/default.conf pelo nginx-https.conf que veio junto"
echo "     (trocando SEU-DOMINIO pelo dominio real)"
echo "  2. Expor a porta 443 no docker-compose.yml:"
echo "         ports:"
echo "           - \"80:80\""
echo "           - \"443:443\""
echo "     e montar os certificados:"
echo "         volumes:"
echo "           - ./infra/certs:/etc/nginx/certs:ro"
echo "  3. docker compose up -d --force-recreate frontend"
echo
echo "  Depois acesse https://$DOMINIO"
