# Arquitetura

## Visão geral
O projeto mantém o dashboard original como frontend estático e adiciona uma camada backend para evolução rumo a um cenário mais próximo do mundo real.

## Componentes
- **Frontend:** dashboard estático servido por Nginx
- **Backend:** API REST em Node.js + Express
- **Banco:** PostgreSQL para persistir alertas
- **Observabilidade:** Prometheus para métricas e Grafana para dashboards
- **Orquestração:** Docker Compose

## Fluxo
1. O usuário acessa o dashboard via Nginx
2. O Nginx entrega os assets estáticos do frontend
3. Requisições para `/api` são encaminhadas ao backend
4. O backend consulta ou grava alertas no PostgreSQL
5. O Prometheus coleta métricas do backend em `/api/metrics`
6. O Grafana pode consumir o Prometheus para visualização
