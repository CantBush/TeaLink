# TeaLink progress and to-dos

*Last updated: Sat Oct 10, 3:35 PM. Update this file whenever work lands or the plan changes. Newest plan changes go at the top of the log.*

The full plan, with phases, the agent team, the demo script, and the cut order, is in [`PLAN.md`](PLAN.md).

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

`cd backend && .venv/bin/python eval/run_eval.py` writes `backend/data/eval_results.json`, which `GET /eval` serves. Three simulated users with hidden priorities, 8 rounds each. A hit means the recommender's #1 was that user's favorite drink that round (the best in-stock drink under their hidden weights), not just the best of the three it offered.

| Method | #1 was the favorite | Favorite in the top 3 | Already tried |
|---|---|---|---|
| Most popular untried drink | 2/24 | 2/24 | 0% |
| Agent team, fixed priorities | 5/24 | 8/24 | 14% |
| Agent team, learned priorities | 7/24 | 11/24 | 7% |

| User | Learned vs hidden |
|---|---|
| Price hunter | cost 37% vs 55% |
| Explorer | novelty 29% vs 50% |
| Loyalist | taste 66% vs 70% |

Sold-out recommendations were 0: every method skips drinks that are already gone. The sample is small, so present it as early evidence, not a benchmark.

## To do

The full schedule is in the "Two-person split" section of [`PLAN.md`](PLAN.md). Update your track's lines here as you merge.

**Both:** ⬜ Merge `feature/top3-preference-learning` into main (1:15)

**Track A (backend, agents, evidence):**
- ✅ AGNTCY spike. Go. `TRANSPORT=agntcy` gets Taste (and the rest of the roster) over NATS. `TRANSPORT=local` is still the default, and a down broker falls back to in-process agents. HTTP shapes are unchanged, so Track B does not need a types change.
- ✅ Serve all agents over NATS, shop heartbeats, `make agents`, startup fallback to local. Demo flow (pick, sold out, Lantern Leaf join, shop offline, reset) passes on the bus.
- ✅ Popularity baseline, three-way eval, `GET /eval`. Learning 7/24, fixed weights 5/24, popularity 2/24. No schema change; the Evidence page picks this up on its own.
- ✅ Sarah seed fix. `/users/similar?user_id=andrew` returns Sarah first (about 100% similar).
- ⬜ Stretch: shop offers
- ⬜ Stretch: LLM wording and edge-case tests
- ⬜ `docs/architecture.md`

**Track B (frontend, demo, write-ups):**
- ✅ Live Counterfactual diff. The page is now "What changed" in the nav and has its own what-if buttons.
- ✅ Mocks refreshed from a real run (`node frontend/scripts/capture-mock.mjs` re-records them), `RecommendationCard` removed, Friends on `/users/similar` with a taste comparison
- ✅ Evidence page at `/evidence`. It uses `mocks/eval.json` with a "preview" label and switches to `GET /eval` automatically when A ships it.
- ✅ Ask-the-human prompt: names both drinks, shows what each wins on with scores, and has a button to pick each
- ✅ Timeline grouped into numbered steps: team selected (collapsible), priorities, proposals by agent, the argument, ruled out, decision
- 🟡 `docs/demo-script.md`: a 3-minute script with real numbers from a verified run, re-checked over AGNTCY (identical results), plus AGNTCY setup. Dry runs are still needed.
- ✅ AGNTCY badge on the timeline ("AGNTCY · N agents over NATS", or "In-process fallback"), read from `/health`, with a dot on each agent that answered over the bus
- ✅ An empty result now shows a clear "Nothing survived" card instead of a blank #1 card
- ✅ README covers AGNTCY mode (the `bus` extra, running NATS without Docker)
- 🟡 `docs/writeup.md` drafted: overview, Level 2 mapping, results (now Track A's three-way eval), lessons. Track A's architecture and implementation sections are still to come.
- ✅ Evidence page on live `GET /eval`: hits shown as counts (7/24, 5/24, 2/24), wording matches the stricter "user's favorite" definition, and the offline copy is the real results
- ✅ Technical click-through of the full demo over AGNTCY after Track A's reset fix: every step matches the script. Fixes from it: shop names instead of raw ids in ruled-out reasons, a truthful "now ranks below the top 3" for drinks that weren't ruled out, and two close-call lines in the script.
- ✅ Demo script and recorded mocks refreshed after Track A's re-seed (Sarah's 5/5 Hojicha Cream Tea is now a Social proposal in the script)
- ⬜ Offer badge (if A builds offers)
- ⬜ Write-up and backup video

**Social layer (new, 2:55 PM; full spec and contracts in [`PLAN.md`](PLAN.md#social-layer-added-255-pm)):**
- Track A: ✅ social schemas and seed · ✅ boba stats and quiz mapping (seeds the Preference agent) · ✅ profile, follow, feed, like, comment, and rec endpoints · ⬜ optional follow boost in the Social agent
- Track B:
  - ✅ Types, sample data built from the seed (`node frontend/scripts/build-social-mocks.mjs`), and client calls that fall back to an in-browser mock until A's routes exist.
  - ✅ App shell: bottom tabs on phones, top nav on desktop.
  - ✅ Profile page (`/u/:handle`): header, personality, taste match, go-to order, stats grid, reviews, and follow. The edit sheet covers name, bio, emoji avatar, colors, pinned order, and show/hide and reorder stats.
  - 🟡 Home feed (`/home`): suggestions, likes, and comments are in; "send a rec" and folding in Friends are left.
  - ⬜ Onboarding quiz and Boba card.

**Track A social backend (branch `a/social-backend`, 3:35 PM).** All Track A blocks from 3:00 to 6:00 are done, and 36 backend tests pass. The demo is unchanged: Thai Tea 78, Wintermelon 77, Pearl Milk Tea 71, with the close-call prompt, and `eval_results.json` is byte-identical.
- **Seed:** `make seed` also writes `backend/data/social.json`: a profile for each of the 15 users (handle = user id, emoji avatar, bio, accent), follows (Andrew follows Sarah, Hana, Nora, Chris, and Marco), and 177 feed items. Every seeded review is a feed item, plus Andrew's 4 past picks, a "joined" item per user, likes, 3 comments, and Sarah's rec of Hojicha Cream Tea to Andrew (the newest item in his feed). Reset demo reloads all of it and drops users created since.
- **Quiz (`core/quiz.py`):** the six questions from the frontend mock. Sweetness, base, and toppings set the taste profile. Budget and adventurousness nudge the default priorities, then the usual 5% floor is applied. Chosen flavors become the starting top notes. The quiz profile counts as three five-star reviews, and the weights are the Preference agent's prior. Picks are learned on top.
- **Stats (`core/stats.py`):** favorite drink and shop, sweetness, milk vs fruit, toppings as a 0–1 level, drinks tried and shops visited, weekly streak, top flavor notes, current learned priorities, and a personality ("Brown Sugar Deal Hunter" for Andrew, "Brown Sugar Loyalist" for Sarah).
- **Demo safety:** the Social agent only takes neighbors who have rated something, so a new user never pushes Sarah out of Andrew's top 3 neighbors (tested). In AGNTCY mode, requests for users created or re-profiled at runtime are answered in-process, because the agent processes loaded the catalog at startup.

**The social API matches the frontend contract.** `GET /quiz`, `GET /users?viewer=`, and `GET /feed` return bare lists. Likes and comments take `{viewer}`. Every feed item and comment carries an `author`, and `GET /feed?author=` is one person's posts. `toppings` is a 0–1 number. A missing user returns 404 with `detail: "user not found"`, so the frontend does not treat it as a route that has not shipped. After Reset demo, users created through `/users` are gone.

## Known issues and decisions to revisit

- **AGNTCY reset heartbeat is fixed.** Bus heartbeats now update whichever runtime is serving requests, so Reset demo no longer lets the new registry time out. Local mode was already fine.
- **Setup note:** AGNTCY mode needs `pip install -e ".[dev,bus]"`. Without the `bus` extra, `make agents` exits with "agntcy-app-sdk is not installed", and the API quietly runs in-process.
- **Sarah is Andrew's top match again.** Her seeded reviews follow his milky, low-fruit orders, plus Hojicha Cream Tea at 5/5. Hana is second.
- **The candidate pool is small** (about 11 drinks per round), so sold-out drinks eventually run the pool dry. The evaluation stops at 8 rounds for this reason.
- **Wintermelon Tea** (69% taste match) often lands in the top 3 because Andrew's history makes price matter a lot. It's explainable, but check that it reads well in the demo.
- `RecommendationCard.tsx` is no longer used by Discover. Delete it once nobody needs it.
- **Live picks live in memory.** Restarting the API, or pressing "Reset demo", goes back to the seeded history. That's intentional, so the demo can be repeated.

## Plan change log

- **3:35 PM:** Track A: the social backend is in on `a/social-backend`, covering the quiz, boba stats, profiles, follows, feed, likes, comments, and recs. The quiz seeds the Preference agent's prior and the taste profile. The demo numbers and the eval are unchanged. Track B: see "where the API differs from the contract" above before mirroring `types.ts`.
- **2:10 PM:** Track A: popularity baseline and `GET /eval` are in, and Sarah is Andrew's closest match. Demo order is unchanged (Thai Tea, Wintermelon, Pearl Milk Tea). Priorities are now price 43% and taste 41% (were 42% and 39%), and Wintermelon scores 77 rather than 76.
- **1:45 PM:** Track A: AGNTCY transport is in. Local remains the default. Next up is the popularity baseline and `GET /eval`.
- **1:15 PM:** Progress tracking moved to this file. The Google Doc can't be edited by the coding assistant, so the doc stays as the original brief.
- **12:50 PM:** Replaced the single recommendation with a **top 3** that the user picks from. Added the **Preference agent**, which learns priorities from past and current picks, and the **Budget agent** for cost. Shop agents no longer propose drinks; they only confirm stock or veto.
- **12:45 PM:** Reviewed main and found that every agent scored drinks by taste (so Taste always won), "ask the human" fired on every run, shops went offline after 30 seconds, sold-out drinks disappeared silently, and the brown sugar and shop-join buttons didn't do anything. All of these are fixed on the branch.

## Phase timeline (from the team plan)

- Phase 0, 12:00 to 12:45: skeleton and contracts. **Done.**
- Phase 1, 12:45 to 3:00: foundations. **Done.** The AGNTCY transport is in, and local mode stays the default.
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
