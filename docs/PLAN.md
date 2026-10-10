# TeaLink plan

*Living document, so anyone can edit it. Last edited Sat Oct 10, 1:10 PM. Mark status with ✅ done, 🟡 in progress, ⬜ not started, or ✂️ cut. Log what you finished in [`PROGRESS.md`](PROGRESS.md) and record plan changes in the log at the bottom.*

## Goal

**Cisco Cloud AI track, "When AI Agents Disagree."** We're targeting **Level 2 (Adaptive AI Team)**, plus two Level 3 pieces: a baseline comparison and an ask-the-human rule.

TeaLink is an explainable boba recommender. A team of agents with different goals argues over what you should order next. You get a top 3, you pick one, and the team learns what you care about.

## Key decisions

- **Agents** run on AGNTCY `agntcy-app-sdk`, using A2A over **NATS**. SLIM group chat is a stretch goal.
- **Fallback:** setting `TRANSPORT=local` runs the same agent classes in-process. This is the current default, and the demo never depends on the message bus.
- **Numbers come from code, never the LLM.** Scores, weights, vetoes, rankings, and the learned priorities are all computed in code. An LLM may only reword rationales (optional, through LiteLLM and the `LLM_MODEL` setting, with fixed template wording otherwise).
- **The user picks from a top 3** rather than getting a single answer. Each pick is a learning signal. *(Changed 12:50 PM.)*
- **Each agent has its own objective.** Every agent scores every candidate by its own objective, and the resolver blends those scores with weights learned for this user. No agent gets a casting vote. *(Changed 12:50 PM.)*
- **ElevenLabs** is a stretch goal: a different voice for each agent during the debate.

## Agent team

| Agent | Objective | Proposes? | Notes |
|---|---|---|---|
| Taste | Fit to the user's own reviews (`taste`) | Top 3 | Cites the user's reviews as evidence |
| Social | What the most similar users rated highly (`social`) | Top 3 untried, taste ≥ 0.5 | Similarity is the centered cosine of taste profiles. A drink nobody has rated scores neutral (0.5) |
| Explorer | Something new that's still a plausible fit (`novelty`) | Top 3 untried, taste ≥ 0.6 | |
| Budget | Cheapest that still fits (`cost`) | Top 3, taste ≥ 0.7 | |
| Shop (one per shop) | Inventory truth | No | Confirms stock or vetoes sold-out drinks. If a shop has no online agent, its drinks are dropped |
| Preference | Learns how much this user weighs each objective | No | Seeded from past picks (`data/choices.json`) and updated on every pick from the top 3 |

## Deliberation protocol

Schemas are in `backend/tealink/schemas.py`, mirrored in `frontend/src/api/types.ts`.

1. **Select.** The Concierge picks agents based on what their cards say they can do, and logs why it picked each one.
2. **Preference.** The Preference agent reports the user's current weights, for example taste 39%, price 42%, novelty 5%, and friends 14%.
3. **Propose.** Each objective agent proposes up to 3 drinks, each with evidence and a rationale.
4. **Object.** Every agent scores every candidate on its own objective. It supports a drink at 0.55 or above, raises a concern below 0.45, and is neutral in between. Shops veto anything sold out.
5. **Resolve.** The Concierge drops vetoed drinks and drinks with no confirming shop, then ranks the rest by the weighted sum of objective scores and returns the top 3. If the top two are within **0.02** of each other, or everything was ruled out, it sets `ask_human`.
6. **Learn.** `POST /choices` records the user's pick. The Preference agent nudges the weights toward the objectives where the pick beat the drinks the user passed over (learning rate 0.25, minimum weight 5%), then explains the change.
7. Every step streams to the frontend as a `LensEvent` over Server-Sent Events.

## How each Level 2 requirement is met

| Requirement | How | Status |
|---|---|---|
| Agents chosen by capability | Registry, agent cards, and the selection reasons the Concierge logs | ✅ |
| Unexpected change | A shop sells out (and vetoes the drink), or a shop goes offline (and its drinks are dropped) | ✅ |
| Dynamic discovery | Lantern Leaf registers a shop agent partway through a session | ✅ |
| Conflict resolution | The resolver blends objective scores with learned weights, plus an ask-the-human rule | ✅ |
| Explain who was selected and why | Lens timeline and the Why This page (score times weight, plus ruled-out drinks) | ✅ |
| New information changes the decision | User picks update the weights. Brown sugar dislike, sell-outs, and shop joins each trigger a fresh deliberation | ✅ |
| *Level 3:* baseline comparison | So far: learning vs fixed weights (15/24 vs 11/24 hits). Still to build: a popularity baseline | 🟡 |
| *Level 3:* ask the human | Near-tie or everything ruled out shows a prompt over the top 3 | ✅ |
| AGNTCY transport | `AgntcyTransport` over NATS | ⬜ (go/no-go at 2:00) |

## Repo layout (current)

```
TeaLink/
  README.md  docs/PLAN.md  docs/PROGRESS.md  docs/architecture.md (todo)
  backend/
    tealink/
      schemas.py  config.py  llm.py
      data/seed.py  loader.py                 # writes backend/data/{shops,drinks,users,reviews,choices}.json
      core/taste.py  retrieval.py  similarity.py  objectives.py  preferences.py  resolution.py  baseline.py (todo)
      agents/objective_agent.py  taste_agent.py  social_agent.py  explorer_agent.py
             budget_agent.py  shop_agent.py  preference_agent.py  cards.py  roster.py  serve.py
      concierge/transport.py  registry.py  deliberation.py
      api/main.py      # /recommend (SSE), /choices, /preferences/{user}, /profile, /users/similar,
                       # /events/{sold-out,shop-join,shop-offline,preference,reset}
    eval/run_eval.py   # learning vs fixed weights on simulated users with hidden priorities
    tests/             # taste, resolution, preferences, end-to-end demo flow
  frontend/src/
    pages/Discover.tsx  WhyThis.tsx  Counterfactual.tsx  Friends.tsx
    components/TopChoices.tsx  PriorityBars.tsx  TasteBars.tsx  AgentTimeline.tsx  ControlPanel.tsx
    state/session.ts  api/client.ts  api/types.ts  mocks/sample_session.json
```

## Phases

Person A (Andrew) owns agents and backend. Person B owns data, frontend, and the demo. Emily is working ahead on the agent team and learning, on branch `feature/top3-preference-learning`.

### Phase 0, 12:00 to 12:45: skeleton and contracts ✅
- ✅ Repo skeleton, shared schemas and types, FastAPI SSE gateway, mock frontend
- ⬜ Send someone to the Cisco workshop (check Discord for the time)

### Phase 1, 12:45 to 3:00: foundations 🟡
- ⬜ **A: AGNTCY spike.** Get one Taste agent answering over NATS. **Go/no-go at 2:00**: if it isn't working, stay on `TRANSPORT=local`.
- ✅ A: `core/taste.py` and `core/retrieval.py`
- ✅ B: seed data (6 shops including the late-joining Lantern Leaf, 43 drinks, users, reviews, and Andrew's past picks)
- 🟡 B: Discover ✅, Why This ✅, Counterfactual (still scripted)
- ⬜ Merge `feature/top3-preference-learning` into main

### Phase 2, 3:00 to 6:00: agent team ✅ (finished early)
- ✅ Social, Explorer, Budget, Shop, and Preference agents; capability selection; both rounds; resolver; top 3
- ✅ Live SSE stream, timeline with supports, concerns, and vetoes, and selection reasons
- ✅ **6:00 checkpoint:** "What should I get next?" runs end to end with real disagreement on screen

### Phase 3, 6:30 to 9:00: adaptation 🟡
- ✅ Heartbeats and offline detection, sold-out, shop joining mid-session, preference flip, and the ask-human rule
- ✅ Control panel buttons that re-run deliberation, plus a demo reset
- ✅ Learning from picks (Preference agent)
- ⬜ Counterfactual page: show a before/after diff using `previousDecision` and `decision` from the session store
- ⬜ Update `sample_session.json` so the offline fallback shows the top 3 and the priorities panel
- ⬜ Decide on the Sarah story: real similarity ranks her 5th for Andrew. Either tune her seeded reviews or change the script.

### Phase 4, 9:00 to 10:00: evidence and freeze ⬜
- 🟡 A: `eval/run_eval.py`. Learning vs fixed weights is done. Still to do: `core/baseline.py` (popularity) and a combined table covering hit rate, sold-out recommendations, and repeat picks.
- ⬜ B: scripted demo scenario, plus a replay mode if we use an LLM
- ⬜ **Feature freeze at 9:30.** Commit and push before the venue closes.
- ⬜ Overnight, docs only: `docs/architecture.md` and the README

### Phase 5, Sunday 9:00 to 1:00: ship ⬜
- 9:00 to 10:30: bug fixes and polish on the screens the demo shows
- 10:30 to 11:30: write-ups (architecture, implementation, results, lessons learned) and a backup demo video
- 11:30 to 12:15: rehearse three times
- **Submit by 12:30**

## Demo script (draft)

1. Reset the demo, then ask "What should I get next?" Show agents being selected, the proposals, the pushback, and the top 3. Lantern Leaf's drinks are ruled out because no shop agent can confirm them.
2. **Pick #3 (Pearl Milk Tea).** The Preference agent explains: "taste match now counts for 43% (was 39%)."
3. **#1 sells out.** Kung Fu Tea's agent vetoes it, and the team re-ranks.
4. **Lantern Leaf joins.** Its agent registers, and Brown Sugar Hojicha jumps to #1.
5. **"I don't like brown sugar."** The drink drops out, and the timeline shows why.
6. **A shop goes offline.** Its drinks are ruled out.
7. Open Why This and walk through score times weight. Show the eval numbers.

## If we fall behind, cut in this order

1. Friends tab
2. Counterfactual page (Why This and the timeline already show the before/after)
3. LLM wording
4. AGNTCY (use the local transport)

**Never cut:** conflict resolution, sold-out, the Lens timeline, top 3 with learning, or the baseline comparison.

## Stretch ideas (only after the freeze-safe build)

- Shop offers: a shop agent may offer a small discount, bounded by the shop's budget, to win a close call. It would show up as a cost change in the resolver.
- Group mode: several users' Preference agents negotiate over one order (SLIM group chat).
- ElevenLabs voices for each agent.
- TBAC / agent identity from AGNTCY.

## Plan change log

- **1:10 PM:** The plan moved into this file (`docs/PLAN.md`) so the team can edit it on GitHub.
- **12:50 PM:**
  - Single recommendation → top 3 plus a learning Preference agent.
  - Added a Budget agent (cost).
  - Shops verify rather than propose.
  - Ask-human gap went from 0.05 to 0.02, since a bigger gap fired too often.
  - Counterfactual moved up the cut list.
