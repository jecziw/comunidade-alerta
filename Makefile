.PHONY: help up down logs build restart ps \
        tf-init tf-plan tf-apply tf-destroy \
        lint test api-health

# ──────────────────────────────────────────────
# Variáveis
# ──────────────────────────────────────────────
COMPOSE   = docker compose
TF        = terraform -chdir=infra/terraform
IMAGE_TAG ?= local

# ──────────────────────────────────────────────
# Help (padrão)
# ──────────────────────────────────────────────
help:
	@echo ""
	@echo "  Comunidade Alerta — comandos disponíveis"
	@echo ""
	@echo "  Docker Compose"
	@echo "  ─────────────────────────────────────────"
	@echo "  make up          Sobe toda a stack"
	@echo "  make down        Derruba a stack (mantém volumes)"
	@echo "  make down-v      Derruba a stack E remove volumes"
	@echo "  make build       Reconstrói as imagens"
	@echo "  make restart     Reconstrói e reinicia"
	@echo "  make logs        Acompanha todos os logs"
	@echo "  make ps          Lista containers em execução"
	@echo ""
	@echo "  Terraform (infra/terraform)"
	@echo "  ─────────────────────────────────────────"
	@echo "  make tf-init     Inicializa o Terraform"
	@echo "  make tf-plan     Mostra o plano de mudanças"
	@echo "  make tf-apply    Aplica a infraestrutura"
	@echo "  make tf-destroy  Destrói todos os recursos"
	@echo ""
	@echo "  Qualidade & diagnóstico"
	@echo "  ─────────────────────────────────────────"
	@echo "  make lint                Valida estrutura do projeto"
	@echo "  make unit-test           Roda os testes unitários (sem Docker)"
	@echo "  make unit-test-coverage  Testes + relatório de cobertura HTML"
	@echo "  make test                Testa endpoints (stack precisa estar no ar)"
	@echo "  make api-health          Verifica saúde da API"
	@echo ""

# ──────────────────────────────────────────────
# Docker Compose
# ──────────────────────────────────────────────
up:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Dashboard  → http://localhost:8080"
	@echo "  API health → http://localhost:8080/api/health"
	@echo "  Prometheus → http://localhost:9090"
	@echo "  Grafana    → http://localhost:3001  (admin / admin)"
	@echo ""

down:
	$(COMPOSE) down

down-v:
	$(COMPOSE) down -v

build:
	$(COMPOSE) build --no-cache

restart: build
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# ──────────────────────────────────────────────
# Terraform
# ──────────────────────────────────────────────
tf-init:
	@test -f infra/terraform/terraform.tfvars || \
	  (cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars && \
	   echo "  ⚠  terraform.tfvars criado — revise as senhas antes de continuar.")
	$(TF) init

tf-plan:
	$(TF) plan -var="image_tag=$(IMAGE_TAG)"

tf-apply:
	$(TF) apply -var="image_tag=$(IMAGE_TAG)" -auto-approve

tf-destroy:
	$(TF) destroy -auto-approve

# ──────────────────────────────────────────────
# Qualidade & diagnóstico
# ──────────────────────────────────────────────
lint:
	@echo "Validando estrutura do projeto..."
	@test -f frontend/public/index.html        && echo "  ✓ index.html"
	@test -f frontend/public/css/dashboard.css && echo "  ✓ dashboard.css"
	@test -f frontend/public/js/dashboard.js   && echo "  ✓ dashboard.js"
	@test -f backend/src/server.js             && echo "  ✓ server.js"
	@test -f docker-compose.yml                && echo "  ✓ docker-compose.yml"
	@test -f .env.example                      && echo "  ✓ .env.example"
	@test -f infra/terraform/main.tf           && echo "  ✓ terraform/main.tf"
	@echo "  Estrutura OK"

unit-test:
	@echo "Rodando testes unitários..."
	cd backend && npm test

unit-test-coverage:
	@echo "Rodando testes com relatório de cobertura..."
	cd backend && npm run test:coverage
	@echo ""
	@echo "  Relatório em backend/coverage/lcov-report/index.html"

test:
	@echo "Aguardando API estar disponível..."
	@until curl -sf http://localhost:8080/api/health > /dev/null; do sleep 2; done
	@echo "  ✓ /api/health OK"
	@curl -sf http://localhost:8080/api/stats | python3 -m json.tool > /dev/null && \
	  echo "  ✓ /api/stats OK"
	@curl -sf http://localhost:8080/api/alerts | python3 -m json.tool > /dev/null && \
	  echo "  ✓ /api/alerts OK"
	@echo "  Todos os endpoints respondendo"

api-health:
	@curl -s http://localhost:8080/api/health | python3 -m json.tool
