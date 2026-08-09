# Infraestrutura — Comunidade Alerta

Ordem sugerida: **backup primeiro** (protege o que já existe), depois
monitoramento, e HTTPS quando o domínio estiver registrado.

---

## 1. Backup do banco  ← comece por aqui

Hoje **não existe nenhuma cópia** dos 753 alertas, das 25 delegacias
geocodificadas nem dos usuários. Se a instância EC2 falhar, tudo se perde.

```bash
# enviar os scripts
scp -i $pem infra/*.sh ubuntu@18.229.131.113:/home/ubuntu/comunidade-alerta/infra/

# no servidor
chmod +x ~/comunidade-alerta/infra/*.sh
~/comunidade-alerta/infra/backup-db.sh          # testar agora
crontab -e
```

Adicionar no crontab (backup diário às 3h):

```
0 3 * * * /home/ubuntu/comunidade-alerta/infra/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

O script recusa backups suspeitos (menores que 10 KB) e verifica a
integridade do gzip — um backup corrompido que passa por bom é pior
que não ter backup.

**Restaurar:** `./restaurar-db.sh /home/ubuntu/backups/ca_AAAA-MM-DD_HHMM.sql.gz`
(pede confirmação digitada, porque substitui os dados atuais)

---

## 2. Monitoramento

O polling do INMET roda a cada 5 min. Se parar, ninguém percebe — o painel
só deixa de receber novidades, em silêncio.

```
*/30 * * * * /home/ubuntu/comunidade-alerta/infra/healthcheck.sh >> /home/ubuntu/health.log 2>&1
```

Verifica containers, API, banco, espaço em disco, **se o INMET ainda está
ingerindo** e se existe backup recente.

Para ver as falhas: `grep FALHA ~/health.log`

---

## 3. HTTPS  (precisa de domínio)

**Antes:** registrar domínio (Registro.br, ~R$40/ano), criar registro DNS
tipo A apontando para `18.229.131.113`, e liberar as portas 80 e 443 no
Security Group da AWS.

```bash
sudo ./setup-https.sh comunidadealerta.com.br seu@email.com
```

Depois:
1. Trocar `SEU-DOMINIO` no `nginx-https.conf` e substituir o `default.conf`
2. Copiar `nginx-ratelimit.conf` para `/etc/nginx/conf.d/`
3. No `docker-compose.yml`, expor a porta 443 e montar `./infra/certs:/etc/nginx/certs:ro`
4. `docker compose up -d --force-recreate frontend`

Renovação automática já fica agendada (o certificado vence a cada 90 dias).

### O que o nginx-https.conf traz junto

- **HSTS** e cabeçalhos de segurança
- **Freio no login**: 5 tentativas por minuto por IP — sem isso, dá para
  testar senha indefinidamente
- **60 req/min** no restante da API
- Correção: o `Connection: upgrade` estava aplicado em `/api/` sem
  necessidade; agora fica só no `/socket.io/`, que é onde faz sentido

---

## Ainda pendente

- **PIX e boleto reais** — dependem de conta em PSP com CNPJ
- **Fan-out de notificações** — WhatsApp, e-mail, Telegram em paralelo
- **Separar o HTML** em `app.js` e `app.css` — reduz muito o risco de
  edição, mas altera o fluxo de deploy; melhor fazer isolado
