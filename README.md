# Comunidade Alerta

**Plataforma SaaS de inteligência urbana** — monitoramento de incidentes em tempo real para a Grande Florianópolis (22 municípios de SC), construída com infraestrutura de produção (DevOps · Cloud · IaC).

![status](https://img.shields.io/badge/status-MVP%20funcional-brightgreen)
![backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![infra](https://img.shields.io/badge/infra-Docker%20%2B%20Terraform-blueviolet)
![cloud](https://img.shields.io/badge/cloud-AWS%20ECS%20%2B%20RDS%20%2B%20ALB-orange)
![tests](https://img.shields.io/badge/testes-23%20(Jest%20%2B%20Supertest)-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)

> Este projeto tem duas faces que se reforçam: é um **produto** (SaaS B2B para prefeituras,
> segurança pública e condomínios) e um **portfólio de engenharia** (infraestrutura como código,
> observabilidade, CI/CD e deploy em nuvem).

---

## O produto

Agrega em tempo real incidentes de **fontes oficiais** (PRF, INMET, CEMADEN) e ocorrências locais
num mapa único da região, com:

- Mapa ao vivo (Leaflet) com lista sincronizada, filtros por tipo, fonte e período
- Autenticação completa com **2FA (TOTP)**, recuperação de senha e verificação por código
- Planos e **trial de 14 dias** (1 por CNPJ/CPF), cobrança via Stripe
- Rede de **câmeras parceiras** (condomínios/empresas) com consentimento LGPD
- Conformidade LGPD: exportar dados, excluir conta, páginas legais
- Modo apresentação para central de monitoramento + PWA instalável

## A engenharia (o que este projeto demonstra)

- **Containers** com healthcheck e dependências corretas (Docker Compose)
- **Infraestrutura como código** com Terraform — local (Docker) e AWS (ECS/RDS/ALB)
- **Observabilidade** com Prometheus + Grafana (dashboards e 3 alertas provisionados via código) + Loki
- **CI/CD** no GitHub Actions (lint → testes → terraform validate → build → deploy)
- **Testes** com Jest + Supertest (23 casos, com mock de banco — sem depender de infra)
- **Segurança**: CSP, helmet, JWT, bcrypt, 2FA no backend, segredos só via `.env`

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | SPA single-file · CSS próprio (design system) · Leaflet · Service Worker (PWA) |
| Backend | Node.js · Express · Socket.io · prom-client |
| Banco | PostgreSQL 16 |
| Integrações | Stripe (cobrança) · Resend (e-mail) · Web Push (VAPID) |
| Fontes oficiais | PRF · INMET · CEMADEN |
| Reverse proxy | Nginx |
| Observabilidade | Prometheus · Grafana · Loki |
| Orquestração local | Docker Compose |
| IaC | Terraform (Docker local + AWS ECS/RDS/ALB) |
| CI/CD | GitHub Actions |

## Como rodar localmente

```bash
cp .env.example .env          # edite os segredos (JWT_SECRET, DB_PASSWORD...)
make up                       # ou: docker compose up -d --build
make health                   # confere a saúde da API
```

| Serviço | URL local |
|---|---|
| Dashboard | http://localhost:8080 |
| API health | http://localhost:3000/api/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

> Para ligar os conectores das fontes oficiais: `ENABLE_EXTERNAL_SYNC=true` no `.env`.

## Principais endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/auth/register · /login | Cadastro e login (JWT) |
| POST | /api/auth/2fa/setup · /verify · /disable | 2FA (TOTP) gerado no backend |
| GET/POST | /api/alerts | Lista e cria alertas |
| PATCH | /api/alerts/:id/status | Workflow de ocorrência |
| GET | /api/stats | Totais por severidade e região |
| POST | /api/billing/checkout | Assinatura (Stripe) |
| GET/POST/DELETE | /api/webhooks | Integrações |
| GET | /api/health · /api/metrics | Health check · métricas Prometheus |

## Deploy

**VPS (simples, recomendado para começar):** veja [`DEPLOY-NA-VPS.md`](DEPLOY-NA-VPS.md) — sobe os contêineres em qualquer servidor Docker, com HTTPS via Caddy.

**AWS (ECS Fargate + RDS + ALB):**
```bash
cd infra/terraform-aws
cp terraform.tfvars.example terraform.tfvars   # edite com suas credenciais
terraform init && terraform apply
# para parar custos: terraform destroy
```

## Observabilidade

Grafana sobe com datasource Prometheus e dashboard de API via provisioning automático, com três alertas:
- **Erros 5xx elevados** (crítico) · **Latência p95 > 1s** (aviso) · **API sem métricas** (crítico)

## Estrutura

```
backend/    API Node.js/Express + conectores oficiais + testes (Jest)
frontend/   SPA (app inteiro em frontend/public/comunidade-alerta.html) + Dockerfiles
infra/      nginx · prometheus · grafana · loki · terraform (local) · terraform-aws
scripts/    Utilitários (geocodificação dos endereços das delegacias)
.github/    Pipeline CI/CD
```

## Roadmap

- [x] API REST + PostgreSQL + autenticação com 2FA
- [x] Docker Compose + Terraform (local e AWS)
- [x] Observabilidade (Prometheus + Grafana + Loki) com alertas via código
- [x] CI/CD no GitHub Actions
- [x] Frontend SaaS completo (mapa, planos, câmeras, LGPD)
- [ ] Primeiro cliente real em produção
- [ ] HTTPS gerenciado (ACM + Route 53) na trilha AWS
- [ ] Kubernetes (migração ECS → EKS)

## Autor

**Jeferson Goulart** — Graduando em Sistemas de Informação · DevOps & Cloud
[github.com/jecziw](https://github.com/jecziw)

Licença MIT.
