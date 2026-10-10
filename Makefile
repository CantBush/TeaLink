.PHONY: bus agents api web test seed

bus:
	docker compose up -d nats

agents:
	cd backend && .venv/bin/python -m tealink.agents.launch

api:
	cd backend && .venv/bin/uvicorn tealink.api.main:app --reload --port 8000

web:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest

seed:
	cd backend && .venv/bin/python -m tealink.data.seed
