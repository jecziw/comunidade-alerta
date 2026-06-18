# 🚀 Deploy na VPS — Passo a Passo (do zero ao ar com HTTPS)

Guia completo para colocar o Comunidade Alerta no ar numa VPS. Não pule etapas.
Tempo estimado: **uma tarde**. Custo: **~US$5–6/mês**.

> Pré-requisito: o projeto já deve estar no seu GitHub (veja `COMO-SUBIR-NO-GITHUB.md`).
> Vamos usar um domínio de exemplo: `comunidadealerta.com.br`. Troque pelo seu.

---

## Parte 1 — Contratar a VPS

1. Crie conta em um provedor (qualquer um serve):
   - **Hetzner** (mais barato, ~€4) · **DigitalOcean** (mais fácil, ~US$6) · **Contabo** (muito barato)
2. Crie um servidor (droplet/instância) com:
   - **Ubuntu 22.04 LTS**
   - **2 GB de RAM** (mínimo; 4 GB folgado se for usar o monitoramento)
   - Anote o **endereço IP** que aparece (ex.: `203.0.113.45`)
3. Você vai receber a senha de root por e-mail, ou cadastrar uma chave SSH.

---

## Parte 2 — Conectar no servidor

No seu Windows, abra o **PowerShell** ou o **Prompt** e conecte (troque pelo seu IP):
```
ssh root@203.0.113.45
```
Digite a senha quando pedir. Você está dentro do servidor. 🎉

---

## Parte 3 — Preparar o servidor (instalar Docker)

Cole os comandos abaixo, um bloco de cada vez:

```bash
# Atualiza o sistema
apt update && apt upgrade -y

# Instala Docker + Docker Compose + Git
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin git

# Confirma que instalou
docker --version
docker compose version
```

---

## Parte 4 — Baixar o projeto

```bash
# Clona o seu repositório (troque pelo seu usuário se diferente)
git clone https://github.com/jecziw/comunidade-alerta.git
cd comunidade-alerta
```

Se o repositório for **privado**, o Git vai pedir login — use seu usuário e um
**Personal Access Token** (GitHub → Settings → Developer settings → Tokens).

---

## Parte 5 — Configurar as variáveis (.env)

```bash
cp .env.example .env
nano .env
```

No editor `nano`, preencha o essencial:

```env
NODE_ENV=production
DB_USER=postgres
DB_PASSWORD=troque-por-uma-senha-forte
DB_NAME=comunidade_alerta
JWT_SECRET=cole-aqui-um-texto-aleatorio-bem-longo
FRONTEND_URL=https://comunidadealerta.com.br

# Liga os conectores das fontes oficiais (PRF/INMET/CEMADEN)
ENABLE_EXTERNAL_SYNC=true

# Opcionais (pode deixar em branco no começo):
STRIPE_SECRET_KEY=
RESEND_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

Salve no nano: **Ctrl+O**, Enter, depois **Ctrl+X**.

> **Dica de segurança:** para gerar um JWT_SECRET forte, rode:
> `openssl rand -base64 48` e cole o resultado.

---

## Parte 6 — Subir a aplicação

```bash
make up
# (ou, se 'make' não existir: docker compose up -d --build)
```

Aguarde uns minutos (a primeira vez baixa e compila tudo). Depois confira:
```bash
make health
# Deve responder algo como {"status":"ok"}
```

Neste ponto a aplicação já está rodando na porta 8080. Teste pelo IP:
`http://203.0.113.45:8080`

---

## Parte 7 — Domínio + HTTPS (com Caddy)

O **Caddy** é um servidor que cuida do HTTPS automaticamente (certificado grátis).

1. **Aponte seu domínio para o IP:** no painel do seu registrador (Registro.br,
   GoDaddy, etc.), crie um registro **A** apontando `comunidadealerta.com.br` para
   o IP da VPS (`203.0.113.45`). Aguarde alguns minutos para propagar.

2. **Instale o Caddy:**
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

3. **Configure o Caddy:**
```bash
nano /etc/caddy/Caddyfile
```
Apague o conteúdo e coloque (troque o domínio):
```
comunidadealerta.com.br {
    reverse_proxy localhost:8080
}
```
Salve (Ctrl+O, Enter, Ctrl+X) e reinicie:
```bash
systemctl restart caddy
```

Pronto! Em segundos o Caddy gera o certificado HTTPS sozinho.
Acesse **https://comunidadealerta.com.br** — está no ar e seguro. 🔒🎉

---

## Parte 8 — Verificação final

- [ ] `https://seu-dominio` abre o site
- [ ] O cadeado de HTTPS aparece no navegador
- [ ] `https://seu-dominio/status.html` mostra "Todos os sistemas operacionais"
- [ ] Consegue criar uma conta e entrar no painel
- [ ] No mapa começam a aparecer incidentes reais (pode levar alguns minutos
      após o primeiro ciclo de sincronização das fontes)

---

## Dia a dia — atualizar o site depois de mudanças

Quando você atualizar o código no GitHub, no servidor é só:
```bash
cd comunidade-alerta
git pull
make up
```

---

## Problemas comuns

| Problema | Solução |
|---|---|
| `make: command not found` | Use `docker compose up -d --build` no lugar de `make up`. |
| Site não abre pelo domínio | O registro A do DNS ainda não propagou (espere) ou está com IP errado. |
| Caddy não gera HTTPS | O domínio precisa estar apontando para o IP **antes** de iniciar o Caddy. Rode `systemctl restart caddy` depois que o DNS propagar. |
| `make health` falha | Veja os logs com `make logs` — geralmente é `.env` incompleto (JWT_SECRET ou DB_PASSWORD vazios). |
| Porta 8080 ocupada | Edite a porta no `docker-compose.yml` (ex.: `8081:80`) e ajuste o Caddy. |
| Sem dados no mapa | Confirme `ENABLE_EXTERNAL_SYNC=true` no `.env` e rode `make logs` para ver a sincronização das fontes. |

---

## Próximo passo (o que importa de verdade)

Com o site no ar, o trabalho deixa de ser técnico. Agora é:
1. Escolher 5 alvos reais (prefeituras pequenas, condomínios, empresas de segurança).
2. Mostrar a demo ao vivo para **um** deles.
3. Ouvir o que ele pede — e o que ignora.

Essa conversa vale mais que qualquer feature nova. Boa sorte! 🚀
