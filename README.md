# Comunidade Alerta — Fase 3 completa

## Inclui
- FastAPI
- SQLite
- CRUD de alertas
- estatísticas calculadas do banco
- feed de prioridade
- integração pronta com o dashboard

## Como rodar
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Endpoints CRUD
- `GET /api/alerts`
- `POST /api/alerts`
- `PUT /api/alerts/{id}`
- `DELETE /api/alerts/{id}`

## Endpoints de apoio
- `GET /api/statistics/overview`
- `GET /api/statistics/dashboard`
- `GET /api/statistics/network`
- `GET /api/statistics/chart/activity`
- `GET /api/statistics/chart/types`
- `GET /api/statistics/chart/status`
