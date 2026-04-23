# Comunidade Alerta — Dashboard DevOps

Plataforma de monitoramento de segurança comunitária construída como portfólio de **Infraestrutura, DevOps e Cloud**.

![status](https://img.shields.io/badge/status-produção-brightgreen)
![node](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![docker](https://img.shields.io/badge/infra-Docker%20%2B%20Terraform-blueviolet)
![tests](https://img.shields.io/badge/testes-21%20passed%20%7C%2092.5%25-brightgreen)
![aws](https://img.shields.io/badge/cloud-AWS%20ECS%20%2B%20RDS%20%2B%20ALB-orange)
![license](https://img.shields.io/badge/license-MIT-green)

## 🌐 Demo ao vivo

> **Suba a infra com `terraform apply` para ativar a URL pública na AWS.**
> A infraestrutura é destruída quando não está em uso para evitar custos.
> Para subir: `cd infra/terraform-aws && terraform apply`

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML · CSS · Bootstrap · Leaflet |
| Backend | Node.js · Express · prom-client |
| Banco de dados | PostgreSQL 16 |
| Reverse proxy | Nginx |
| Observabilidade | Prometheus + Grafana + Alertas |
| Orquestração local | Docker Compose |
| Infraestrutura como código | Terraform (Docker local + AWS ECS/RDS/ALB) |
| CI/CD | GitHub Actions — 6 jobs (lint → testes → terraform → build → smoke test → deploy) |
| Testes | Jest + Supertest · 21 testes · 92.5% de cobertura |
| Cloud | AWS ECS Fargate · RDS PostgreSQL · ALB · ECR |

## Pré-requisitos

- Docker + Docker Compose v2
- Node.js 20+ (para testes)
- Terraform ≥ 1.6 (para IaC)
- AWS CLI configurado (para deploy na AWS)
- `make`

## Como rodar localmente

### Docker Compose (mais rápido)

```bash
cp .env.example .env
docker compose up -d --build
```

### Terraform local (demonstra IaC)

```bash
make tf-init
make tf-apply
```

### Testes unitários (sem Docker)

```bash
cd backend
npm install
npm test
npm run test:coverage
```

## Portas locais

| Serviço | URL |
|---|---|
| Dashboard | http://localhost:8080 |
| API health | http://localhost:8080/api/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

> Grafana: `admin` / senha definida em `.env`

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| GET | /api/health | Health check + status do banco |
| GET | /api/alerts | Lista alertas recentes |
| POST | /api/alerts | Cria alerta |
| GET | /api/stats | Totais por severidade e bairro |
| GET | /api/metrics | Métricas Prometheus |

**Exemplo:**
```bash
curl -X POST http://localhost:8080/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"title":"Poste apagado","neighborhood":"Botafogo","severity":"low","status":"open"}'
```

## Pipeline CI/CD
push → lint → testes unitários → terraform validate → build & push → smoke test → deploy

Em Pull Requests: lint + testes + terraform validate.
No push para main: todos os 6 jobs em sequência.
Imagens publicadas no GitHub Container Registry.

## Deploy na AWS

```bash
cd infra/terraform-aws
cp terraform.tfvars.example terraform.tfvars
# edite terraform.tfvars com suas credenciais
terraform init
terraform apply
```

Recursos provisionados: VPC · Subnets · Security Groups · ECR · ECS Fargate · RDS PostgreSQL · ALB · CloudWatch Logs · IAM Roles.

Para destruir e parar custos:
```bash
terraform destroy
```

## Observabilidade

Grafana sobe com datasource Prometheus e dashboard de API configurados automaticamente via provisioning. Três alertas ativos:

- **Taxa de erros 5xx elevada** (crítico) — dispara após 2 minutos acima de 0.05 req/s
- **Latência p95 acima de 1s** (aviso) — dispara após 3 minutos acima de 1000ms
- **API sem métricas** (crítico) — dispara após 5 minutos sem dados do Prometheus

## Estrutura
comunidade-alerta/
├── .env.example
├── .gitignore
├── .github/workflows/ci.yml     ← pipeline CI/CD (6 jobs)
├── Makefile
├── docker-compose.yml
├── frontend/
│   ├── Dockerfile               ← local
│   ├── Dockerfile.aws           ← AWS/ECS
│   └── public/
│       └── js/api.js            ← integração com API real
├── backend/
│   ├── src/                     ← API Node.js + Express
│   ├── tests/               ← 21 testes Jest + Supertest
│   └── mocks/db.js          ← mock do banco para testes
└── infra/
├── nginx/
│   ├── default.conf         ← config local
│   └── nginx-aws.conf       ← config AWS
├── prometheus/
├── grafana/
│   ├── provisioning/
│   │   ├── alerting/        ← 3 regras de alerta automáticas
│   │   ├── dashboards/
│   │   └── datasources/
│   └── dashboards/
├── terraform/               ← IaC local (Docker)
└── terraform-aws/           ← IaC AWS (ECS + RDS + ALB)

## O que este projeto demonstra

- Separação clara entre frontend, backend e infraestrutura
- Containers com healthcheck e dependências corretas
- Infraestrutura como código com Terraform — local e AWS
- Pipeline CI/CD completo com build de imagem, cache de layer e smoke test
- Testes unitários com mock de banco (sem dependência de infraestrutura)
- Observabilidade com Prometheus + Grafana + alertas configurados via código
- Deploy real na AWS com ECS Fargate, RDS gerenciado e ALB
- Boas práticas de segredo: `.env.example`, variáveis sensíveis, nenhuma senha no código

## Roadmap

- [x] API REST + PostgreSQL
- [x] Docker Compose
- [x] Terraform (IaC local)
- [x] Grafana com provisioning automático
- [x] Pipeline CI/CD completo (6 jobs)
- [x] 21 testes unitários com 92.5% de cobertura
- [x] Frontend integrado com a API real
- [x] Deploy na AWS (ECS + RDS + ALB)
- [x] Alertas no Grafana (erro 5xx, latência alta, API down)
- [ ] Kubernetes (migração do ECS para EKS)
- [ ] HTTPS com certificado SSL (ACM + Route 53)
- [ ] Módulos Terraform reutilizáveis

## Autor

**Jeferson Goulart**
Graduando em Sistemas de Informação | DevOps & Cloud Enthusiast
[github.com/jecziw](https://github.com/jecziw)
