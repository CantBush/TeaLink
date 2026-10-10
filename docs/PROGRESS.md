# TeaLink progress and to-dos

*Last updated: Sat Oct 10, 1:15 PM. Update this file whenever work lands or the plan changes. Newest plan changes go at the top of the log.*

## Target

Cisco Cloud AI track, "When AI Agents Disagree". We're aiming for **Level 2 (Adaptive AI Team)**, plus two Level 3 pieces: a comparison against a simpler baseline, and a rule for when to ask the human. Judging covers functionality, innovation, agent intelligence, engineering, demonstration, and learning and evidence.

## What the demo shows

1. Four agents with **different objectives** each propose three drinks:
   - **Taste**: fit to the user's own reviews.
   - **Social**: what the user's most similar people rated highly.
   - **Explorer**: something new that the user would still plausibly like.
   - **Budget**: the cheapest drinks that still fit.
2. Every agent then scores **every** candidate by its own objective, so the timeline shows real support and pushback.
3. **Shop agents** are the only ones that know inventory. They confirm stock or veto sold-out drinks. If a shop has no online agent, its drinks are dropped with a reason.
4. The user gets a **top 3** and picks one.
5. The **Preference agent** learns how much this user weighs taste, price, novelty, and friends' picks. It starts from **past decisions** (Andrew's seeded choice history) and updates on **every current pick**. The resolver ranks by those learned weights, and the app explains each shift. For example: "You picked Pearl Milk Tea over Thai Tea, so taste match now counts for 43% (was 39%)."
6. Adaptation buttons, each of which starts a fresh deliberation: **#1 sells out**, **#1's shop goes offline**, **Lantern Leaf joins** (its $4.95 Brown Sugar Hojicha Milk jumps to #1), and **I don't like brown sugar** (that drink drops back out).
7. The app asks the human when the top two are within 0.02 of each other, or when every candidate was ruled out.

## Done

### On main (Andrew, through 12:43 PM)

- Repo skeleton: FastAPI gateway with SSE streaming, agent cards and a registry with heartbeats, two-round deliberation, an in-process transport, and a Vite React frontend.
- Seed data, taste math (profile, match score, factor contributions), and review retrieval as evidence.
- Discover, Why This, Counterfactual, and Friends pages, working against mock data.

### Branch `feature/top3-preference-learning` (Emily, 12:50 to 1:15 PM)

- **Separate objectives.** One scoring function per agent in `core/objectives.py`. There's a new Budget agent and a shared `ObjectiveAgent` base class.
- **Real Social agent.** Centered-cosine user similarity replaces the hard-coded Andrew-to-Sarah link. Unrated drinks count as neutral, so new shops aren't penalized.
- **Preference agent** (`agents/preference_agent.py`, `core/preferences.py`). A pairwise update learns from each pick out of the top 3. It's seeded with 4 past picks for Andrew (`data/choices.json`).
- **Resolver** ranks candidates by the learned weights and returns the top 3 with per-objective scores. It also lists ruled-out drinks and why. No agent gets a casting vote.
- **Shop agents** only confirm stock or veto. Vetoes and dropped drinks show up in the timeline.
- **Fixed:** shops no longer drop offline 30 seconds after startup. The new API endpoints are `/events/shop-offline`, `/events/reset`, `/choices`, and `/preferences/{user}`, and `/users/similar` is now real.
- **Lantern Leaf** is seeded offline, so the "joins mid-session" event is real.
- **"I don't like brown sugar" works.** A flavor-tag override marks down drinks with that tag and reports it as its own factor.
- **Frontend:**
  - Top 3 cards with per-objective bars and a "Pick this" button.
  - A "What Andrew cares about" panel with the shift from the last pick.
  - Control buttons that re-run deliberation, plus a reset.
  - Why This shows how the weights produced the score, along with the ruled-out drinks.
  - "People with your taste" comes from the API.
- **Tests:** 17 backend tests pass, including an end-to-end demo-flow test. The frontend builds and lints clean. Checked in the browser: picking a drink shifts the weights and re-ranks.

## Evidence so far

`cd backend && .venv/bin/python eval/run_eval.py` simulates three users with hidden priorities who each pick from the top 3 for 8 rounds:

| User | Fixed weights | Learning | Learned vs hidden weights |
|---|---|---|---|
| Price hunter | 4/8 | 5/8 | cost 48% vs 55% |
| Explorer | 3/8 | 4/8 | novelty 45% vs 50% |
| Loyalist | 4/8 | 6/8 | taste 64% vs 70% |
| **All** | **11/24** | **15/24** | |

A "hit" means the team's #1 was the drink the user picked. The sample is small, so present it as early evidence, not a benchmark.

## To do

| Priority | Task | Owner |
|---|---|---|
| 1 | Review and merge `feature/top3-preference-learning` into main | Andrew + Emily |
| 2 | AGNTCY spike: one agent answering over NATS via `AgntcyTransport`. Go/no-go at 2:00, otherwise stay on `TRANSPORT=local` | Andrew |
| 3 | Counterfactual page is still scripted. Wire it to `previousDecision` and the live `decision` from the session store | B |
| 4 | Popularity baseline in `core/baseline.py`, plus a results table that combines it with the learning evaluation | A |
| 5 | Demo script and rehearsal: reset, pick, sell out, Lantern Leaf joins, no brown sugar, shop offline | B |
| 6 | The Friends page is still static (Sarah). Either point it at `/users/similar` or cut it, since it's first on the cut list | B |
| 7 | Update `sample_session.json` mocks so the offline fallback shows the top 3 and the priorities panel | B |
| 8 | Optional: LLM wording for rationales (numbers stay in code), ElevenLabs voices, and the SLIM group session | Stretch |

## Known issues and decisions to revisit

- **Sarah isn't Andrew's top match anymore.** The real similarity math ranks Hana, Leo, and Rina first, and Sarah fifth. Either tune Sarah's seeded reviews or update the demo story.
- **The candidate pool is small** (about 11 drinks per round), so sold-out drinks eventually run the pool dry. The evaluation stops at 8 rounds for this reason.
- **Wintermelon Tea** (69% taste match) often lands in the top 3 because Andrew's history makes price matter a lot. It's explainable, but check that it reads well in the demo.
- `RecommendationCard.tsx` is no longer used by Discover. Delete it once nobody needs it.
- **Live picks live in memory.** Restarting the API, or pressing "Reset demo", goes back to the seeded history. That's intentional, so the demo can be repeated.

## Plan change log

- **1:15 PM:** Progress tracking moved to this file. The Google Doc can't be edited by the coding assistant, so the doc stays as the original brief.
- **12:50 PM:** Replaced the single recommendation with a **top 3** that the user picks from. Added the **Preference agent**, which learns priorities from past and current picks, and the **Budget agent** for cost. Shop agents no longer propose drinks; they only confirm stock or veto.
- **12:45 PM:** Reviewed main and found that every agent scored drinks by taste (so Taste always won), "ask the human" fired on every run, shops went offline after 30 seconds, sold-out drinks disappeared silently, and the brown sugar and shop-join buttons didn't do anything. All of these are fixed on the branch.

## Phase timeline (from the team plan)

- Phase 0, 12:00 to 12:45: skeleton and contracts. **Done.**
- Phase 1, 12:45 to 3:00: foundations. **Mostly done.** The AGNTCY spike is still pending.
- Phase 2, 3:00 to 6:00: agent team. **Largely done early on the branch.** The 6:00 checkpoint, real disagreement on screen, is already met.
- Phase 3, 6:30 to 9:00: adaptation. Sold out, offline, shop joins, and the preference flip all work. What's left is polish and the counterfactual page.
- Phase 4, 9:00 to 10:00: baseline and evaluation, with a feature freeze at 9:30.
- Phase 5, Sunday 9:00 to 1:00: polish, write-ups, rehearsal. **Submit by 12:30.**

## Running it

```bash
cd backend && python3.13 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m tealink.data.seed          # writes backend/data/*.json, including choices.json
.venv/bin/uvicorn tealink.api.main:app --port 8000
cd ../frontend && npm ci && npm run dev         # http://localhost:5173
cd ../backend && .venv/bin/pytest && .venv/bin/python eval/run_eval.py
```
