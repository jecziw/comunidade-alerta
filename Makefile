.PHONY: up down build logs test migrate clean health

up:
	docker compose up -d --build

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

test:
	docker compose exec backend npm test

test-coverage:
	docker compose exec backend npm run test:coverage

migrate:
	docker compose exec backend node -e "const p=require('./src/db').pool,fs=require('fs');p.query(fs.readFileSync('./src/db/migrations/002_external_sources.sql','utf8')).then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"

db-shell:
	docker compose exec db psql -U postgres -d comunidade_alerta

generate-vapid:
	docker compose exec backend node -e "const wp=require('web-push');console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"

clean:
	docker compose down -v --remove-orphans

health:
	@curl -s http://localhost:3000/api/health | python3 -m json.tool

grafana:
	@echo "Grafana: http://localhost:3001  (admin/admin)"
