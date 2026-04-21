# Roadmap

## Fase 1 — Base pronta
- [x] Organizar o dashboard em uma estrutura profissional
- [x] Adicionar frontend, backend e infra separados
- [x] Criar API inicial para alertas e saúde da aplicação
- [x] Adicionar PostgreSQL
- [x] Adicionar Prometheus e Grafana
- [x] Criar `docker-compose.yml`
- [x] Criar workflow inicial de CI

## Fase 2 — Integração real do painel
- [ ] Consumir `GET /api/stats` no dashboard
- [ ] Consumir `GET /api/alerts` no dashboard
- [ ] Enviar novos alertas pelo formulário
- [ ] Substituir dados estáticos por dados da API

## Fase 3 — Evolução DevOps
- [ ] Criar `.env.example`
- [ ] Adicionar lint e validação automática
- [ ] Adicionar testes de API
- [ ] Criar imagem versionada no GitHub Container Registry
- [ ] Provisionar deploy com Terraform
- [ ] Publicar na AWS
