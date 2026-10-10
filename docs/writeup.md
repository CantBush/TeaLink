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
| *Level 3:* comparison with a simpler baseline | The Evidence page: learned vs fixed priorities vs a popularity baseline |
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

**Learning works on simulated users.** Three simulated users each have hidden priorities: a price hunter, an explorer, and a loyalist. Each picks from the top 3 for 8 rounds. A *hit* means the team's #1 was the drink the user picked.

| Recommender | Hits (#1 was picked) |
|---|---|
| Agent team, fixed priorities | 11 / 24 (46%) |
| Agent team, learned priorities | **15 / 24 (63%)** |
| Most popular drink | ✏️ waiting for Track A's `GET /eval` |

From picks alone, the learned weights land close to the hidden ones:

| User | What dominates their hidden priorities | Hidden | Learned |
|---|---|---|---|
| Price hunter | price | 55% | 48% |
| Explorer | something new | 50% | 45% |
| Loyalist | taste match | 70% | 64% |

**The adaptation behaves correctly in a scripted run.** This is the exact sequence from the demo, and the results were identical in-process and over AGNTCY:
1. Start: Thai Tea 78, Wintermelon Tea 76, Pearl Milk Tea 71. Because Thai Tea and Wintermelon are a close call, the team asks the user.
2. The user picks Pearl Milk Tea. Taste weight goes from 39% to 43% and price weight from 42% to 35%.
3. Thai Tea sells out. Kung Fu Tea's agent vetoes it, and the team re-ranks.
4. Lantern Leaf joins. Its $4.95 Brown Sugar Hojicha Milk goes to #1 at 80.
5. "I don't like brown sugar." That drink leaves the top 3.
6. Sunright goes offline. Its three drinks are ruled out, and the team never recommends a drink it can't confirm.

*Caveat: the sample is small (3 personas × 8 rounds), so treat these numbers as early evidence, not a benchmark.*

## Lessons learned

- **Give each agent a real objective, or there's no real disagreement.** Our first version had every agent score drinks by taste, so Taste always won and "disagreement" was cosmetic. Separate objective functions made the pushback visible and the trade-offs meaningful.
- **Make the decision human-sized.** A single answer hides the trade-off. A top 3 with a "close call" prompt turned the user's pick into a learning signal and gave us human-in-the-loop for free.
- **A "neutral" score matters.** Unrated drinks first scored 0 with the Social agent, so a newly joined shop could never win. Treating "nobody has rated it" as neutral fixed dynamic discovery.
- **Every demo button has to change something visible.** We tuned the scenario (for example, pricing Lantern Leaf's drink at $4.95) so that each event produces a clear, explainable change on screen.
- **Plan for the bus to fail.** AGNTCY over NATS runs the same agent classes as in-process mode, with a per-call fallback, so the demo never depends on the broker being up.
- **Split by file ownership, and agree on contracts first.** Two people worked in parallel all day without merge conflicts. The `/eval` and offers formats were agreed up front, so the frontend was built against mocks before the backend existed.
- ✏️ *Add any from Track A (for example, what was hard about the AGNTCY SDK).*

## Demo

See [`demo-script.md`](demo-script.md) for the 3-minute run. Backup video: ✏️ link.

## Running it

See the [README](../README.md) for local and AGNTCY modes.
