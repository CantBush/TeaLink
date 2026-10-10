# TeaLink: when boba agents disagree

*Submission write-up for the UCSC AI Hackathon, Cisco Cloud AI track ("When AI Agents Disagree"), Level 2 plus Level 3 pieces. Draft. Track B owns Overview, Results, Lessons, and Demo; Track A owns Architecture and Implementation. Sections marked ✏️ still need content.*

## Overview

Choosing a drink means trading off things that pull in different directions: what you usually like, what people like you love, trying something new, and price. TeaLink gives each of those objectives to its own agent and has them argue in the open. Shop agents hold the one fact nobody else has (what's in stock), and a Preference agent learns which objectives this particular user actually cares about.

The user gets a **top 3** instead of a single answer. Each pick is both a decision and a training signal. When the top two are too close to call, or everything is ruled out, the team asks the human instead of guessing.

**Level 2 requirements, and where they show up in the demo:**

| Requirement | In TeaLink |
|---|---|
| Agents with different capabilities, chosen dynamically | The concierge selects agents from their cards and says why ("Team selected" in the timeline) |
| Adapting to unexpected change | A shop sells out, so its agent vetoes. A shop goes offline, so its drinks are ruled out |
| Dynamic discovery | Lantern Leaf registers a shop agent partway through a session, and its drink jumps to #1 |
| Resolving conflicts | Each agent scores every candidate by its own objective. Scores are blended with the user's learned weights, and a close call goes to the human |
| Explaining decisions | Live timeline, the Why this order page (score × weight), and the What changed before/after |
| *Level 3:* comparison with a simpler baseline | The Evidence page: learned priorities 7/24 hits, fixed priorities 5/24, popularity 2/24 |
| *Level 3:* human in the loop | A near-tie or an empty result produces a prompt over the top 3 that explains the trade-off |

## Architecture ✏️ (Track A)

*Outline: gateway, concierge, registry, and transports (local and AGNTCY over NATS); the deliberation protocol (propose, then object); the resolver; Lens events over SSE. Link the diagram in [`architecture.md`](architecture.md).*

## Implementation ✏️ (Track A, with frontend notes from B)

*Outline: objective functions (`core/objectives.py`), preference learning (`core/preferences.py`), similarity, the resolver and its tie rule, heartbeats and fallback, the AGNTCY serve/launch setup, and tests.*

**Frontend (Track B):** a Vite + React + TypeScript app that reads the deliberation as a Server-Sent Events stream.
- **Discover:** the top 3 with per-objective bars, the close-call prompt, learned priorities, and the timeline grouped by step, with an AGNTCY transport badge.
- **Why this order:** score × weight math and the ruled-out drinks.
- **What changed:** a live before/after diff of the top 3.
- **Friends:** a taste comparison with the most similar users.
- **Evidence:** the evaluation results.
- **Offline fallback:** the app replays a real recorded session (`scripts/capture-mock.mjs`), so it never shows a blank screen if the API is down.

## Results

**Learning beats both baselines on simulated users.** Three simulated users each have hidden priorities: a price hunter, an explorer, and a loyalist. Each picks from the top 3 for 8 rounds, for 24 decisions in total. A *hit* means the recommender's #1 was that user's favorite drink that round: the best in-stock drink under their hidden priorities, which no recommender sees. The full results come from `eval/run_eval.py` and are served at `GET /eval`.

| Recommender | #1 was the favorite | Favorite in the top 3 | Re-suggested a drink they'd tried | Sold-out recommendations |
|---|---|---|---|---|
| Most popular untried drink | 2 / 24 | 2 / 24 | 0% | 0 |
| Agent team, fixed priorities | 5 / 24 | 8 / 24 | 14% | 0 |
| Agent team, learned priorities | **7 / 24** | **11 / 24** | **7%** | 0 |

From 8 picks alone, the learned weights move toward the hidden ones. Every user starts from the same default priorities (taste 55%, 15% each for the rest):

| User | What dominates their hidden priorities | Hidden | Learned after 8 picks |
|---|---|---|---|
| Loyalist | taste match | 70% | 66% |
| Price hunter | price | 55% | 37% (up from 15%) |
| Explorer | something new | 50% | 29% (up from 15%) |

The loyalist converges almost exactly. The price hunter and the explorer are moving the right way but haven't converged in 8 picks. The price hunter also picked up some weight on something new (26% learned vs 5% hidden), likely because cheap drinks in our catalog are often ones the user hasn't tried.

**The adaptation behaves correctly in a scripted run.** This is the exact sequence from the demo, run over AGNTCY. In-process mode gives identical results.
1. Start: Thai Tea 78, Wintermelon Tea 77, Pearl Milk Tea 71. Because Thai Tea and Wintermelon are a close call, the team asks the user.
2. The user picks Pearl Milk Tea. Taste weight goes from 41% to 45% and price weight from 43% to 36%.
3. Thai Tea sells out. Kung Fu Tea's agent vetoes it, and the team re-ranks.
4. Lantern Leaf joins. Its $4.95 Brown Sugar Hojicha Milk goes to #1 at 81.
5. "I don't like brown sugar." That drink leaves the top 3.
6. Lantern Leaf goes offline. Its drinks are ruled out, and the team never recommends a drink it can't confirm.

*Caveat: the sample is small (3 personas × 8 rounds), so treat these numbers as early evidence, not a benchmark.*

## Lessons learned

- **Give each agent a real objective, or there's no real disagreement.** Our first version had every agent score drinks by taste, so Taste always won and "disagreement" was cosmetic. Separate objective functions made the pushback visible and the trade-offs meaningful.
- **Make the decision human-sized.** A single answer hides the trade-off. A top 3 with a "close call" prompt turned the user's pick into a learning signal and gave us human-in-the-loop for free.
- **A "neutral" score matters.** Unrated drinks first scored 0 with the Social agent, so a newly joined shop could never win. Treating "nobody has rated it" as neutral fixed dynamic discovery.
- **Every demo button has to change something visible.** We tuned the scenario (for example, pricing Lantern Leaf's drink at $4.95) so that each event produces a clear, explainable change on screen.
- **Define "success" honestly.** Our first eval counted a hit when the team's #1 matched the user's pick from the three options *we* chose, which flattered us (63%). Scoring against the user's true favorite across the whole in-stock menu gives smaller numbers (29%), but they actually mean something, and learning still wins.
- **Plan for the bus to fail.** AGNTCY over NATS runs the same agent classes as in-process mode, with a per-call fallback, so the demo never depends on the broker being up.
- **Split by file ownership, and agree on contracts first.** Two people worked in parallel all day without merge conflicts. The `/eval` and offers formats were agreed up front, so the frontend was built against mocks before the backend existed.
- ✏️ *Add any from Track A (for example, what was hard about the AGNTCY SDK).*

## Demo

See [`demo-script.md`](demo-script.md) for the 3-minute run. Backup video: ✏️ link.

## Running it

See the [README](../README.md) for local and AGNTCY modes.
