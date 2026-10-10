# TeaLink

Explainable multi-agent boba recommender for the Cisco Cloud AI track (Level 2). Taste, Social, Explorer, and Budget agents each argue for a different objective, shop agents confirm stock or veto, and a Preference agent learns what each user cares about from their picks. The user gets a top 3. Match scores, factor contributions, weights, and vetoes are computed in code. LiteLLM is only used for wording, and only when `LLM_MODEL` and a provider key are set. Without a key, templates keep the demo moving.

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

`make test` runs the backend tests. `make seed` rewrites `backend/data/*.json` (deterministic, `random.seed(7)`). `node frontend/scripts/capture-mock.mjs` re-records the frontend's offline fallback from a running API.

The 3-minute demo is scripted in [`docs/demo-script.md`](docs/demo-script.md).

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

With `TRANSPORT=agntcy`, every agent runs as its own process and speaks A2A over a NATS bus through `agntcy-app-sdk`. The HTTP API and the frontend are the same in both modes. If the broker or an agent is down, that call is answered in-process.

```bash
cd backend && pip install -e ".[dev,bus]" && cd ..   # the AGNTCY SDK is an optional extra
make bus            # NATS in Docker on 4222. Without Docker: brew install nats-server && nats-server -p 4222
TRANSPORT=agntcy make agents   # serves all 11 agents (Lantern Leaf waits on standby until it joins)
TRANSPORT=agntcy make api
make web
```

`curl localhost:8000/health` shows `"effective": "agntcy"` and a per-agent count of replies received over the bus. The timeline header in the app shows the same: "AGNTCY · N agents over NATS", with a dot on each agent that answered over the bus. A SLIM broker is optional under the compose profile `slim` and is not started by `make bus`.
