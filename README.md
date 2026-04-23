# Comunidade Alerta — Dashboard DevOps

Plataforma de monitoramento de segurança comunitária construída como portfólio de **Infraestrutura, DevOps e Cloud**.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML · CSS · Bootstrap · Leaflet |
| Backend | Node.js · Express · prom-client |
| Banco de dados | PostgreSQL 16 |
| Reverse proxy | Nginx |
| Observabilidade | Prometheus + Grafana |
| Orquestração local | Docker Compose |
| Infraestrutura como código | Terraform (provider Docker) |
| CI/CD | GitHub Actions (lint → tf validate → build → smoke test → deploy) |

## Pré-requisitos

- Docker + Docker Compose v2
- Terraform ≥ 1.6 (para o caminho IaC)
- `make`

## Como rodar

### Docker Compose (mais rápido)

```bash
cp .env.example .env
make up
```

### Terraform (demonstra IaC)

```bash
make tf-init
# edite infra/terraform/terraform.tfvars
make tf-apply
```

### Verificar

```bash
make test
make ps
```

## Portas

| Serviço | URL |
|---|---|
| Dashboard | http://localhost:8080 |
| API health | http://localhost:8080/api/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | /api/health | Health check |
| GET | /api/alerts | Lista alertas recentes |
| POST | /api/alerts | Cria alerta |
| GET | /api/stats | Totais por severidade |
| GET | /api/metrics | Métricas Prometheus |

**Exemplo:**
```bash
curl -X POST http://localhost:8080/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"title":"Poste apagado","neighborhood":"Botafogo","severity":"low","status":"open"}'
```

## Pipeline CI/CD

```
push → lint → terraform validate → build & push → smoke test → deploy
```

Jobs de lint e terraform validate rodam também em Pull Requests.

## Terraform

`infra/terraform/` provisiona toda a stack via provider Docker — rede, volumes e containers com healthcheck. Para migrar para nuvem, troque o `backend "local"` por `backend "s3"` (AWS) ou `backend "gcs"` (GCP) e descomente o job de deploy no pipeline.

## Observabilidade

Grafana já sobe com datasource Prometheus e dashboard de API configurados automaticamente via provisioning — sem clique manual.

## Estrutura

```
comunidade-alerta/
├── .env.example
├── .gitignore
├── .github/workflows/ci.yml   ← CI/CD completo
├── Makefile
├── docker-compose.yml
├── frontend/
├── backend/
└── infra/
    ├── nginx/
    ├── prometheus/
    ├── grafana/               ← provisioning automático
    └── terraform/             ← IaC local (pronto para nuvem)
```

## O que este projeto demonstra

- Separação entre frontend, backend e infraestrutura
- Containers com healthcheck e dependências corretas
- Infraestrutura como código com Terraform
- Pipeline CI/CD com build de imagem, cache de layer e smoke test
- Observabilidade com Prometheus + Grafana configurados via código
- Boas práticas de segredo: `.env.example`, variáveis sensíveis, nenhuma senha no código

## Roadmap

- [x] API REST + PostgreSQL
- [x] Docker Compose
- [x] Terraform (IaC local)
- [x] Grafana com provisioning automático
- [x] Pipeline CI/CD completo
- [ ] Integrar frontend com a API
- [ ] Terraform para AWS (ECS + RDS + ALB)
- [ ] Testes automatizados (Jest + Supertest)
- [ ] Alertas no Grafana
