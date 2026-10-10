# TeaLink

Explainable multi-agent boba recommender for the Cisco Cloud AI track (Level 2). Five specialist agents propose a drink, object to each other, and the resolver picks a winner. Match scores, factor contributions, and vetoes are computed in code. LiteLLM is only used for wording, and only when `LLM_MODEL` and a provider key are set. Without a key, templates keep the demo moving.

## Run locally

From the repo root, with Python 3.13:

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd ..
cp .env.example .env
make seed
make api
```

`make api` serves FastAPI on port 8000. In another terminal, `make web` starts the Vite app (the `frontend/` tree). `.env` should keep `TRANSPORT=local`, which runs every agent in-process. No NATS broker and no API key are required.

Useful calls:

```bash
curl http://localhost:8000/health
curl -N -X POST http://localhost:8000/recommend \
  -H 'content-type: application/json' \
  -d '{"user_id":"andrew","query":"What should I get next?","preference_overrides":{}}'
```

`make test` runs the backend tests. `make seed` rewrites `backend/data/*.json` (deterministic, `random.seed(7)`).

## Level 2 mapping

- **Capability-based selection.** The registry reads agent cards and the concierge logs a one-sentence reason for taste, social, explorer, and each online shop.
- **Unexpected change.** A sold-out event, or a shop heartbeat older than 30 seconds, drops that drink or that shop on the next deliberation.
- **Dynamic discovery.** A shop joins by registering a shop agent, which the next selection includes while the heartbeat is fresh.
- **Conflict resolution.** The resolver drops vetoed drinks, picks the highest remaining score, and sets `ask_human` when the top two scores are within 0.05.
- **Explaining the choice.** Selection, proposal, objection, and decision are Lens events. A preference change starts a new deliberation, and the overrides are applied in the taste math before any wording.

## AGNTCY transport

`TRANSPORT=agntcy` is the NATS spike. `make bus` starts `nats:latest` on ports 4222 and 8222. `make agents` prints the four `python -m tealink.agents.serve` commands (add `--shop-id` for a shop). Those processes need `agntcy-app-sdk`. If the SDK is missing or its API does not match, serve exits 1 and the local transport is the path to use. A SLIM broker is optional under the compose profile `slim` and is not started by `make bus`.
