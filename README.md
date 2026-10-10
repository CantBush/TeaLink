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

The team plan is in [`docs/PLAN.md`](docs/PLAN.md). Progress and to-dos are in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Level 2 mapping

- **Agents with competing objectives.** Taste (fit to the user's reviews), Social (what similar users loved), Explorer (new but plausible), and Budget (price) each propose drinks, then score every candidate by their own objective. Shop agents only confirm stock or veto.
- **Capability-based selection.** The registry reads agent cards, and the concierge logs a one-sentence reason for each agent it selects.
- **Unexpected change.** A sold-out event triggers a shop veto. A shop going offline (`/events/shop-offline`, or a stale heartbeat) drops its drinks, because nobody can confirm them.
- **Dynamic discovery.** Lantern Leaf has no agent at startup. `/events/shop-join` registers one mid-session.
- **Conflict resolution.** The resolver blends every agent's score using weights the Preference agent learned for this user, and returns a top 3. It sets `ask_human` when the top two are within 0.02, or when everything was ruled out.
- **Learning from the user.** `/choices` records a pick from the top 3. The Preference agent updates how much the user weighs taste, price, novelty, and friends, starting from seeded past picks.
- **Explaining the choice.** Selection, preference, proposal, objection, and decision are all Lens events. Why This shows each objective's score times the user's weight.

## Evidence

`cd backend && .venv/bin/python eval/run_eval.py` compares learning against fixed weights on simulated users with hidden priorities. Results are in `docs/PROGRESS.md`.

## AGNTCY transport

`TRANSPORT=agntcy` is the NATS spike. `make bus` starts `nats:latest` on ports 4222 and 8222. `make agents` prints the four `python -m tealink.agents.serve` commands (add `--shop-id` for a shop). Those processes need `agntcy-app-sdk`. If the SDK is missing or its API does not match, serve exits 1 and the local transport is the path to use. A SLIM broker is optional under the compose profile `slim` and is not started by `make bus`.
