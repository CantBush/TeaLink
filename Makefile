.PHONY: bus agents api web test seed

bus:
	docker compose up -d nats

agents:
	@echo "cd backend && .venv/bin/python -m tealink.agents.serve --agent taste"
	@echo "cd backend && .venv/bin/python -m tealink.agents.serve --agent social"
	@echo "cd backend && .venv/bin/python -m tealink.agents.serve --agent explorer"
	@echo "cd backend && .venv/bin/python -m tealink.agents.serve --agent shop --shop-id kungfu"

api:
	cd backend && .venv/bin/uvicorn tealink.api.main:app --reload --port 8000

web:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest

seed:
	cd backend && .venv/bin/python -m tealink.data.seed
