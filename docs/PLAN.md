# TeaLink plan

*Living document, so anyone can edit it. Last edited Sat Oct 10, 3:35 PM. Mark status with ✅ done, 🟡 in progress, ⬜ not started, or ✂️ cut. Log what you finished in [`PROGRESS.md`](PROGRESS.md) and record plan changes in the log at the bottom.*

## Goal

**Cisco Cloud AI track, "When AI Agents Disagree."** We're targeting **Level 2 (Adaptive AI Team)**, plus two Level 3 pieces: a baseline comparison and an ask-the-human rule.

TeaLink is an explainable boba recommender. A team of agents with different goals argues over what you should order next. You get a top 3, you pick one, and the team learns what you care about.

## Key decisions

- **Agents** run on AGNTCY `agntcy-app-sdk`, using A2A over **NATS**. SLIM group chat is a stretch goal.
- **Fallback:** setting `TRANSPORT=local` runs the same agent classes in-process. This is the current default, and the demo never depends on the message bus.
- **Numbers come from code, never the LLM.** Scores, weights, vetoes, rankings, and the learned priorities are all computed in code. An LLM may only reword rationales (optional, through LiteLLM and the `LLM_MODEL` setting, with fixed template wording otherwise).
- **The user picks from a top 3** rather than getting a single answer. Each pick is a learning signal. *(Changed 12:50 PM.)*
- **Each agent has its own objective.** Every agent scores every candidate by its own objective, and the resolver blends those scores with weights learned for this user. No agent gets a casting vote. *(Changed 12:50 PM.)*
- **TeaLink is social.** Profiles, boba stats, follows, and a friends feed sit around the recommender, and a first-visit quiz seeds the Preference agent. See "Social layer" under the two-person split. *(Added 2:55 PM.)*
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
| *Level 3:* baseline comparison | Popularity 2/24 hits, fixed weights 5/24, learning 7/24. `GET /eval` serves `eval_results.json` | ✅ |
| *Level 3:* ask the human | Near-tie or everything ruled out shows a prompt over the top 3 | ✅ |
| AGNTCY transport | `AgntcyTransport` over NATS | ✅ (go: demo flow passes on NATS, local stays the default) |

## Repo layout (current)

```
TeaLink/
  README.md  docs/PLAN.md  docs/PROGRESS.md  docs/architecture.md (todo)
  backend/
    tealink/
      schemas.py  config.py  llm.py
      data/seed.py  loader.py                 # writes backend/data/{shops,drinks,users,reviews,choices}.json
      core/taste.py  retrieval.py  similarity.py  objectives.py  preferences.py  resolution.py  baseline.py
           quiz.py  stats.py                  # onboarding quiz mapping, boba stats and personality
      social/store.py  # profiles, follows, feed (in memory, loaded from data/social.json)
      api/social.py    # /quiz, /users, /users/{id}[/follow|/followers|/following], /feed, /recs
      agents/objective_agent.py  taste_agent.py  social_agent.py  explorer_agent.py
             budget_agent.py  shop_agent.py  preference_agent.py  cards.py  roster.py  serve.py
      concierge/transport.py  registry.py  deliberation.py
      api/main.py      # /recommend (SSE), /choices, /preferences/{user}, /profile, /users/similar,
                       # /eval, /events/{sold-out,shop-join,shop-offline,preference,reset}
    eval/run_eval.py   # learning vs fixed weights on simulated users with hidden priorities
    tests/             # taste, resolution, preferences, end-to-end demo flow
  frontend/src/
    pages/Discover.tsx  WhyThis.tsx  Counterfactual.tsx  Friends.tsx
    components/TopChoices.tsx  PriorityBars.tsx  TasteBars.tsx  AgentTimeline.tsx  ControlPanel.tsx
    state/session.ts  api/client.ts  api/types.ts  mocks/sample_session.json
```

## Already done (Phases 0 to 2, plus most of 3)

- ✅ Skeleton, schemas and types, SSE gateway, seed data (6 shops, 43 drinks, users, reviews, and Andrew's past picks)
- ✅ All six agent kinds, capability selection, both rounds, the resolver, top 3, and the learning Preference agent
- ✅ Discover and Why This on live data, the timeline, and control panel buttons that re-run deliberation
- ✅ Sold-out, shop offline, shop joining mid-session, the preference flip, and ask-the-human
- ✅ **6:00 checkpoint met early:** real disagreement on screen, end to end

## Two-person split

The remaining work runs as two parallel tracks. **Track A** is the backend: agents, transport, and evidence. **Track B** is the frontend, demo, and write-ups. Each track owns its files outright, so the two of you don't block each other or hit merge conflicts. The default is Andrew on A and Emily on B; swap if you prefer.

### Ground rules

1. **First, together (1:15 to 1:30):** merge `feature/top3-preference-learning` into `main`. Both pull, and both confirm `make api` and `make web` run.
2. **Branches:** A works on `a/<topic>` and B works on `b/<topic>`. Open small PRs into `main`, merge at every sync point, and pull `main` right after.
3. **Shared files:** `schemas.py` and `types.ts` are the only shared files. A changes `schemas.py` and posts the diff in chat. B then mirrors it in `types.ts`. Neither of you changes the other's files.
4. **Never blocked:** B builds against mock JSON in `frontend/src/mocks/` that matches the contracts below. A tests with `pytest` and `curl`. The real data replaces the mocks once A merges.
5. **`PROGRESS.md`:** whoever merges a PR updates their own track's section.

### File ownership

| Track A owns (backend) | Track B owns (frontend, demo, docs) |
|---|---|
| `backend/tealink/**` (agents, core, concierge, api, data/seed) | `frontend/src/**` |
| `backend/eval/**`, `backend/tests/**`, `backend/data/*.json` | `frontend/src/mocks/**` (including mocks for A's upcoming endpoints) |
| `Makefile`, `docker-compose.yml`, `.env.example` | `docs/demo-script.md`, `docs/writeup.md`, the demo video |
| `docs/architecture.md` | `README.md` (A sends B notes on endpoints and setup) |

### Contracts to agree on now

So B can build the UI before A's backend is ready:

```ts
// GET /eval  (A serves backend/data/eval_results.json; B mocks frontend/src/mocks/eval.json)
type EvalResult = {
  rounds: number;
  methods: {
    method: "popularity" | "fixed_weights" | "learning";
    hit_rate: number;        // 0..1: the team's #1 was the drink the user picked
    top3_rate: number;       // 0..1: the pick was anywhere in the top 3
    sold_out_recs: number;   // how many recommendations were sold out
    repeat_rate: number;     // 0..1: share of recommendations the user had already tried
  }[];
  personas: {
    name: string;
    hidden_weights: Record<Dimension, number>;
    learned_weights: Record<Dimension, number>;
  }[];
};

// Stretch, only if A builds shop offers: a new optional field and a new event type
type Offer = { shop_id: string; percent: number; price_after: number; reason: string };
// RankedDrink.offer?: Offer | null      LensEventType adds "offer"
```

### Track A: backend, agents, evidence

| When | Task | Done when |
|---|---|---|
| 1:30 to 2:00 | ✅ **AGNTCY spike.** Get one Taste agent answering over NATS through `AgntcyTransport` (`docker compose up nats`, then `python -m tealink.agents.serve --agent taste`) | One `/recommend` with `TRANSPORT=agntcy` gets a Taste reply over NATS |
| **2:00** | **Go/no-go.** Go. Stay able to run `TRANSPORT=local`. B does not need a frontend change | |
| 2:00 to 3:30 | ✅ If go: serve every agent over NATS, run shop heartbeats over the bus, add `make agents`, and a startup fallback to local. If no-go: skip straight to the baseline | The demo flow passes on both transports |
| 3:30 to 5:00 | ✅ `core/baseline.py` (most-reviewed untried in-stock drink). Extend `eval/run_eval.py` to popularity vs fixed weights vs learning, write `eval_results.json`, and add `GET /eval` | `GET /eval` matches the contract, with a test |
| 5:00 to 6:00 | ✅ Story data fixes: tune Sarah's seed reviews so she's Andrew's top match, re-seed, and update the tests | `/users/similar?user_id=andrew` returns Sarah first |
| **6:00** | **Sync:** merge, then run the full demo together | |
| 6:30 to 8:00 | ✅ Stretch: **shop offers.** In a near-tie, the trailing shop's agent offers up to 10% off from its budget, but only when it is behind on price. The resolver re-scores the cost dimension, and an `offer` event is emitted | The offer can flip the #1. The scripted demo does not hit that case, so its numbers are unchanged |
| 8:00 to 9:00 | ⬜ Optional LLM wording for rationales (template fallback stays the default). Edge-case tests: all vetoed, no reviews, every shop offline | Tests pass with no API key set |
| **9:00** | **Merge.** Feature freeze at 9:30 | |
| Overnight | ⬜ `docs/architecture.md`: mermaid diagram, protocol, Level 2 mapping | |
| Sun 9:00 to 11:30 | Backend bug fixes; architecture and implementation sections of the write-up | |

### Track B: frontend, demo, write-ups

| When | Task | Done when |
|---|---|---|
| 1:30 to 3:00 | ✅ **Counterfactual page on live data.** Show a before/after of the top 3 using `previousDecision` and `decision` from the session store: what moved, what was ruled out, which event caused it, and the weight shifts | Clicking any control button, then opening Counterfactual, shows the real diff |
| 3:00 to 4:00 | ✅ Clean-up: update `sample_session.json` so the offline fallback shows the top 3 and priorities; delete `RecommendationCard.tsx`; point Friends at `/users/similar` (or hide the tab) | `npm run build` and lint pass; the app still works with the API stopped |
| 4:00 to 6:00 | ✅ **Evidence page** (`/evidence`) built against `mocks/eval.json`: a methods table, hit-rate bars, and hidden vs learned weights per persona | Renders from the mock, then switches to `GET /eval` after A merges |
| **6:00** | **Sync:** merge, then run the full demo together | |
| 6:30 to 7:30 | ✅ Ask-the-human polish: when `ask_human` is set, the prompt names both options and what separates them, and the pick resolves it. Timeline readability (group by round, collapse selection events) | A judge can follow one run without explanation |
| 7:30 to 9:00 | 🟡 `docs/demo-script.md` (written and checked against the API; dry runs and the offer badge are left) (exact clicks and lines, 3 minutes). If A builds offers, add an offer badge on cards and an `offer` timeline style | Two dry runs from a reset |
| **9:00** | **Merge.** Feature freeze at 9:30 | |
| Sun 9:00 to 11:30 | UI polish; results and lessons sections of `docs/writeup.md`; record the backup demo video | |

### Social layer (added 2:55 PM)

**Goal:** TeaLink should feel like a social app, not a tool. Users follow each other, react to what friends drink, show off their boba stats on a profile they customize, and get personalized from their very first visit through a short quiz.

**Inspiration, borrowing one idea from each:**
- **Instagram:** a profile header (avatar, name, bio, follower counts), a grid of drinks tried, and a bottom tab bar on phones.
- **Letterboxd:** log and rate drinks, with short reviews friends can like and comment on.
- **Spotify Wrapped:** a bold, shareable "Boba card" of your stats.
- **Strava:** a friends feed of activity ("Sarah tried Osmanthus Milk Tea, 5/5") with quick reactions.
- **BuzzFeed / 16Personalities:** a fun onboarding quiz that ends in a named "boba personality."

**Features:**
1. **Onboarding quiz** (6 questions, under a minute) for new users:
   - **Questions:** sweetness level, milk vs fruit vs tea-forward, toppings, flavors you like (multi-select over the `drinks.json` flavor tags), typical budget, and how adventurous you are. The exact questions and option ids are in `frontend/src/mocks/social/quiz.json`; A can serve that file from `GET /quiz` as is.
   - **Results:** your starting taste profile, your starting priority weights for the Preference agent, and a boba personality, such as "Floral Explorer" or "Brown Sugar Loyalist."
   - **Rule:** like every other number in TeaLink, the backend computes the mapping from answers to profile and weights in code.
2. **Boba stats:**
   - favorite drink and favorite store;
   - sweet vs not sweet;
   - go-to toppings;
   - milk vs fruit split;
   - drinks tried and shops visited;
   - a weekly streak;
   - top taste notes;
   - the learned priority mix ("cares most about price").
   Each stat has a show/hide toggle, so the user chooses what's public.
3. **Customizable profile:**
   - display name, @handle, and bio;
   - avatar (an emoji plus a background color, so no image uploads);
   - a pinned favorite drink and store;
   - a profile accent color;
   - which stats to show, and in what order.
4. **Interacting with other users:**
   - follow and unfollow;
   - a friends feed of reviews and picks;
   - likes and short comments;
   - "send a rec" to a friend;
   - "% taste match" on every profile (reuses the existing similarity code).

**Ground rules:**
- **The demo stays safe.** Andrew (the demo user) is already onboarded, so the 3-minute demo doesn't depend on any social feature. Reset demo also restores the social seed data.
- **No real accounts.** "Signing up" just picks a handle, and the user id is kept in `localStorage`. Social data lives in JSON files and in memory, like picks do today.
- **How it ties into the agents:**
  - The quiz solves the Preference agent's cold start: it gives a new user non-default weights from round one.
  - Follows can optionally feed the Social agent (people you follow count a little more).

**Contracts** (A adds these to `schemas.py`; B mirrors them in `types.ts` and builds against mocks first):

```ts
type StatKey = "fav_drink" | "fav_shop" | "sweetness" | "toppings" | "milk_vs_fruit"
             | "tried_count" | "shops_visited" | "streak" | "top_notes" | "priorities";

type BobaStats = {
  fav_drink_id: string | null; fav_shop_id: string | null;
  sweetness: number;                  // 0 = not sweet, 1 = very sweet
  toppings: number;                   // 0 = no toppings, 1 = loaded (the drinks' `toppings` attribute)
  milk_vs_fruit: number;              // 0 = fruit, 1 = milk
  tried_count: number; shops_visited: number; streak_weeks: number;
  top_notes: string[];                // flavor tags from drinks.json, e.g. ["brown_sugar", "oolong"]
  priorities: Record<Dimension, number>;
  personality: string;                // "Floral Explorer"
};

type UserProfile = {
  user_id: string; handle: string; display_name: string; bio: string;
  avatar: { emoji: string; color: string }; accent: string;
  pinned_drink_id: string | null; pinned_shop_id: string | null;
  visible_stats: StatKey[];           // in display order; hidden stats are left out
  followers: number; following: number; followed_by_me: boolean;
  taste_match: number | null;         // 0..1 vs the viewer
  stats: Partial<BobaStats>;          // only the visible stats for other viewers
};

type QuizQuestion = { id: string; prompt: string; options: { id: string; label: string; emoji?: string }[]; multi?: boolean };
type QuizResult = { user_id: string; personality: string; stats: BobaStats; weights: Record<Dimension, number> };

type Author = { handle: string; display_name: string; avatar: { emoji: string; color: string } };

type FeedItem = {
  id: string; user_id: string; author: Author; kind: "review" | "pick" | "rec" | "joined";
  drink_id: string | null; rating: number | null; text: string | null;
  to_user_id?: string; to_author?: Author;   // recs only
  created_at: string; likes: number; liked_by_me: boolean;
  comments: { id: string; user_id: string; author: Author; text: string; created_at: string }[];
};
```

**Endpoints (A):**
- **Quiz and sign-up:**
  - `GET /quiz` returns the questions.
  - `POST /users` takes `{handle, display_name}`, creates a user, and returns the profile.
  - `POST /quiz` takes `{user_id, answers}` (question id → chosen option ids) and returns a `QuizResult`. It also seeds the Preference agent.
- **Profiles:**
  - `GET /users?viewer=` returns `UserProfile[]` of everyone else, best taste match first (for "Suggested for you").
  - `GET /users/{id}?viewer=` returns a `UserProfile`. `{id}` may be a user id or a handle.
  - `PATCH /users/{id}` saves profile edits.
  - `POST /users/{id}/follow` and `DELETE /users/{id}/follow` take `{viewer}`.
- **Feed:**
  - `GET /feed?user_id=` returns the viewer's feed: their own posts, people they follow, and recs sent to them, newest first. Adding `&author=` returns only that author's posts (for profile pages).
  - A missing user or item returns 404 with a specific `detail`, not FastAPI's default "Not Found". The frontend treats "Not Found" as "route not shipped yet" and falls back to mocks.
  - `POST /feed/{id}/like` likes an item and `DELETE /feed/{id}/like` unlikes it. Both take `{viewer}` and return the updated `FeedItem`.
  - `POST /feed/{id}/comments` takes `{viewer, text}` and returns the updated `FeedItem`.
  - `POST /recs` takes `{from, to, drink_id, text}` to send a recommendation.

The existing `GET /profile/{id}` (taste profile) stays as it is.

#### Track A: social backend

| When | Task | Done when |
|---|---|---|
| 3:00 to 4:00 | ✅ Schemas above in `schemas.py`; seed social data for the existing users (handles, bios, avatars, follows, a few feed items from real reviews); Reset demo restores it | Seed loads, and `GET /users/sarah?viewer=andrew` returns a full profile |
| 4:00 to 5:00 | ✅ `core/stats.py`: boba stats and personality from reviews and picks. Quiz questions and the answer → taste profile + weights mapping (`core/quiz.py`), unit-tested | `POST /quiz` returns stats and weights; a new user's first `/recommend` uses those weights |
| 5:00 to 6:00 | ✅ Profile, follow, feed, like, comment, and rec endpoints; picks and reviews post feed items; visibility respected for other viewers | Tests cover hidden stats, follow counts, and feed order |
| 8:00 to 9:00 | ⬜ Optional: Social agent gives a small boost to people the user follows (replaces the LLM wording block if time is short) | The boost shows up in the Social agent's evidence |

#### Track B: social frontend

| When | Task | Done when |
|---|---|---|
| 3:00 to 4:00 | ✅ Mirror the contracts in `types.ts`, mocks in `frontend/src/mocks/social/`, client calls with mock fallback. App shell: bottom tab bar on phones (Home, Discover, Profile), top nav on desktop | Every new screen renders from mocks with the API stopped |
| 4:00 to 5:00 | ✅ **Onboarding quiz** at `/welcome`: one question per screen, big tappable option cards, progress bar, then a personality reveal and a "Boba card" (Wrapped-style). New visitors without a user id land here | Finishing the quiz creates a user and opens Discover with their own weights |
| 5:00 to 6:00 | ✅ (done early) **Profile page** at `/u/:handle`: Instagram-style header, stats grid, pinned drink and store, drinks-tried grid, taste match, follow button. **Edit profile** sheet: name, bio, emoji avatar and color, accent, show/hide and reorder stats | Edits and hidden stats persist after a reload |
| **6:00** | **Sync:** merge, then run the full demo plus the quiz once | |
| 6:30 to 8:00 | ✅ **Home feed**: friend activity cards, likes, comments, "send a rec," and "Try this" that opens Discover. Fold the current Friends page into profiles and follow lists | Liking and commenting work on two users in two tabs |
| 8:00 to 9:00 | 🟡 (offer badge done) Offer badge if A built offers (from the earlier block); demo script gains an optional 20-second "social" beat (quiz → profile → feed) | Main demo still fits in 3 minutes without the social beat |

**If time runs short, cut in this order:** comments and recs, then the feed, then stat reordering. **Keep:** the quiz and the profile with stats toggles.

### UI cleanup and five tabs (added 3:30 PM)

**Goal:** Every screen is easy to read at a glance. The app is organized into five clear tabs, and drinks, reviews, and profiles have pictures.

**Five tabs.** The same five tabs appear in the bottom bar on phones and the top nav on desktop:
- **Home** (`/home`): the friends feed.
- **Discover** (`/discover`): browse and search drinks, shops, and people, with filter chips (milk, fruit, or tea; under $5; flavor tags). Tapping a drink opens a detail sheet with its photo, shop, price, and friends' ratings.
- **TeaLink** (`/`, the center tab): today's picks.
  - This is the current agent recommender, reframed as "today's top 3": the close call, the debate, What changed, and Why this order.
  - What changed, Why this order, and Evidence become links inside this tab instead of items in the main nav.
  - It stays at `/`, so the demo URL and `docs/demo-script.md` don't change.
- **Stats** (`/stats`): your own stats.
  - The boba stats grid, taste profile, and learned priorities.
  - The Wrapped-style Boba card.
  - Stat visibility settings.
- **Profile** (`/u/:handle`): identity and posts.
  - Cover, avatar, bio, and personality.
  - A compact row of stat highlights that links to Stats.
  - Go-to order.
  - An Instagram-style photo grid of reviews.

The current Friends page folds into Discover (the people results) and profiles.

```mermaid
flowchart LR
  Home["Home: friend feed"]
  Discover["Discover: search drinks, shops, people"]
  TeaLink["TeaLink: today's top 3 and agent debate"]
  Stats["Stats: boba stats, taste, priorities"]
  Profile["Profile: identity and photo grid"]
  TeaLink --> WhatChanged[What changed]
  TeaLink --> WhyThis[Why this order]
  TeaLink --> Evidence[Evidence]
```

**Readability rules for every screen:**
- **Layout:** one main column, at most about 640px wide on phones, with one primary action per screen.
- **Type:** a consistent scale of page title, section title, body, and caption. Body text is at least 15px, and muted text still passes contrast.
- **Fewer boxes inside boxes:** sections are separated by spacing and headers, not nested cards.
- **Touch and states:** tap targets are at least 44px, and every list has a clear empty, loading, and error state.
- **TeaLink timeline:** the agent timeline is collapsed by default behind "See how the agents decided." During the demo it opens with one tap.

**Pictures (placeholders now, uploads later):**
- **Drinks:** about 10 generated images, one per drink style:
  - classic milk tea, brown sugar, fruit tea, matcha, taro;
  - Thai tea, hojicha, floral or oolong, horchata or ube, coffee.
  Each drink maps to one by its flavor tags. Stored in `frontend/public/img/drinks/`.
- **Shops:** 6 generated storefront images in `frontend/public/img/shops/`.
- **Profiles:** about 6 generated cover images to choose from in Edit profile.
- **Where they appear:** review cards in the feed, drink cards on TeaLink and Discover, the profile photo grid, the profile cover, and the Discover detail sheet.
- **Future uploads:** the contract reserves photo fields that stay `null` for now. When a URL is present, it replaces the placeholder, so adding real uploads later needs no frontend change.

**Contract additions** (A adds them; B mirrors them in `types.ts`):

```ts
// All optional and null for now; the frontend falls back to placeholders.
FeedItem.photo_url?: string | null;      // a review photo, for future uploads
UserProfile.cover_url?: string | null;   // a chosen placeholder id, or an uploaded image URL later
// GET /drinks -> { id, name, shop_id, price, flavor_tags, photo_url }[]  (replaces the frontend's copied catalog)
// GET /shops  -> { id, name, neighborhood, photo_url }[]                  // 6 shops, including Lantern Leaf
```

Search runs in the browser over `GET /drinks`, the shop list, and `GET /users`. The data is small (43 drinks, 6 shops, 15 users), so no search endpoint is needed.

#### Track A: UI cleanup support

| When | Task | Done when |
|---|---|---|
| 5:00 to 6:00 (or earlier, since the social endpoints are done) | ✅ `GET /drinks` and `GET /shops`, plus the reserved `photo_url` on feed items and `cover_url` on profiles | `GET /drinks` returns all 43 drinks, `GET /shops` returns all 6, and the new fields come back as `null` |
| After the freeze | ⬜ Stretch: a photo upload endpoint for review and profile photos | An uploaded photo's URL comes back in `photo_url` / `cover_url` |

#### Track B: UI cleanup

This reshuffles B's remaining evening; the earlier Track B social rows keep their tasks but follow this order.

| When | Task | Done when |
|---|---|---|
| 4:00 to 5:00 | ✅ Onboarding quiz and Boba card (unchanged) | See the social-frontend table |
| 5:00 to 6:00 | ✅ Five-tab navigation and routes; the TeaLink tab links to What changed, Why this order, and Evidence; Friends folded in | Every tab works on phone and desktop, and the demo script still runs from `/` |
| **6:00** | **Sync:** merge, then run the full demo plus the quiz once | |
| 6:30 to 7:30 | ✅ Generate the placeholder images; Discover with search, filters, and the drink detail sheet | Searching "matcha" finds drinks, shops, and people |
| 7:30 to 8:30 | 🟡 (Stats tab, photos, and the collapsed timeline are done; the older pages still need the readability pass) Stats tab, then a readability pass across all tabs; photos on review cards and the profile grid | Every screen follows the readability rules above |
| 8:30 to 9:00 | ✅ Feed leftovers ("send a rec") and the offer badge, if A built offers | |

### UI round 2 and agent dialogue (added 6:55 PM)

**Goal:**
- The TeaLink tab shows only today's top 3, and the agent story gets its own sub-tab.
- The agents genuinely respond to each other's objections, and the timeline reads like a group chat.
- Stats and Discover are trimmed to what matters.

**General (both tracks):**
- **Transitions:** clean transition animations between every tab, sub-tab, and section.
- **Always "you":** all copy speaks to the user as "you" ("your taste", "what matters most to you"). Never use the user's name ("Bob's taste") or "the user."
  - Track B fixes the copy written in the frontend.
  - Track A fixes the text the backend writes: preference summaries, decision explanations, counterfactual notes, and offer reasons.

**New TeaLink sub-tabs:** today's picks · at the counter · why this order · evidence. **What changed is removed.**

```mermaid
flowchart LR
  TeaLink["TeaLink: today's top 3"] --> Counter["at the counter: team, dialogue, decision"]
  TeaLink --> WhyThis["why this order: score breakdown"]
  TeaLink --> Evidence[evidence]
```

**Customer side:**
- **TeaLink, today's picks:**
  - The top 3 cards lose their four meters (taste match, price, something new, people like you). That breakdown lives only in why this order.
  - Remove "what you care about" and "my taste"; both are already in Stats.
  - Remove "people with your taste"; that belongs in Discover.
- **At the counter (new sub-tab):** it moves out of today's picks.
  - **Agent symbols:** each core agent gets its own minimal line symbol, matching the doodle style. Every shop agent shares one shop symbol.
  - **Team selected:** a grid of agent icons replaces the list of names. Tapping an icon expands it to show the agent's name, symbol, and description.
  - **They argue:** shown as a group chat. Messages are grouped by round, concessions are visible ("Budget softens on Thai Tea"), and the last line says who decided: the agents agreed, the arbiter decided, or you picked.
  - **The what-if demo controls** (#1 sells out, shop offline, Lantern Leaf joins, no brown sugar, Reset demo) move here. They now sit on what changed, which is being removed.
- **Stats:**
  - **Boba card background:** you choose the color yourself.
  - **"What matters most" → "what matters most to you":** no percentage.
  - **All stats:**
    - Remove toppings, milk vs fruit, and sweet vs not sweet.
    - Combine boba streak, shops visited, and drinks tried into one section.
    - Lay out everything below the card in a receipt-style format.
- **Discover:**
  - **Drink filters:** no repeats, so "fruit tea" and "fruit" merge into one chip.
  - **Order:** shops and drinks are ordered from closest match to least match for you.

**Agent dialogue (soften-only rebuttal rounds):**
- **Rounds:** after the objection round, the gateway relays every agent's objections to all agents, which may then revise their stances. This repeats up to **3 rounds**.
- **Soften-only:** after round 1, an agent may only soften: concede, drop a concern, or lower its confidence. It never hardens a stance, so the dialogue always settles.
- **Vetoes:** shop vetoes (sold out) stay binding and are never softened.
- **The gateway only relays:**
  - It stops early when no agent changes anything in a round.
  - At the cap, or if an agent times out, it runs the existing `resolve()` on everyone's latest scores. It never restarts.
- **Who decided:**
  - "the agents agreed" if the dialogue settled before the cap.
  - "the arbiter decided" if it hit the cap or a timeout.
  - The existing near-tie question to you still runs after that. If you pick, the timeline says "you picked."
- **Setting:** `DELIBERATION=dialogue|single`. `single` is today's two-round behavior and stays the demo fallback. The `/health` response reports which mode is on.
- **Demo numbers:** with `single`, they must not change. With `dialogue`, A re-checks the scripted run and reports any new numbers in `PROGRESS.md`.

**Contract additions** (A adds them; B mirrors them in `types.ts`):

```ts
// On "proposal" and "objection" events. Round 1 is the first objection round.
LensEvent.payload.round?: number;
// On objection events where an agent softened its stance this round.
LensEvent.payload.revised_from?: { kind: "support" | "concern" | "neutral"; score: number | null };
// On the "decision" event. "you picked" is added by the frontend when the user breaks a near-tie.
Decision.decided_by?: "agents" | "arbiter";
Decision.rounds?: number;              // rebuttal rounds that ran (0 in single mode)
// On "selection" events, so the team grid can show them without a second request.
AgentSelection.name?: string;
AgentSelection.description?: string;
// GET /health
Health.deliberation?: "dialogue" | "single";
// Match scores for Discover ordering (or a sorted list per user; A's choice)
// GET /drinks?user={id} -> each drink gains match: number (0–1)
// GET /shops?user={id}  -> each shop gains match: number (0–1), its best drink's match
// PATCH /users/{ref} accepts card_color: string; UserProfile.card_color?: string
```

#### Track A: UI round 2 and dialogue

| Order | Task | Done when |
|---|---|---|
| 1 | ⬜ Second-person text in everything the backend writes (preference summaries, explanations, counterfactual and offer text) | No backend message uses the user's name or "the user" |
| 2 | ⬜ `name` and `description` on selection events; `match` on `GET /drinks` and `GET /shops` for a user; `card_color` on `PATCH /users` | The team grid and Discover ordering work with no extra requests |
| 3 | ⬜ `DELIBERATION=dialogue\|single` with soften-only rebuttal rounds (cap 3), early stop when nothing changes, and arbiter fallback on cap or timeout | In `single` mode the demo numbers are unchanged. In `dialogue` mode, events carry `round` and `revised_from`, and the decision carries `decided_by` and `rounds` |
| 4 | ⬜ Re-check the scripted demo in `dialogue` mode and report the numbers in `PROGRESS.md` | B can update `demo-script.md` |

#### Track B: UI round 2

| Order | Task | Done when |
|---|---|---|
| 1 | ✅ TeaLink: new sub-tabs (today's picks · at the counter · why this order · evidence); remove what changed; move the what-if controls to at the counter; strip the top 3 meters and the three extra sections | Today's picks shows only the top 3, and the demo runs from the at the counter sub-tab |
| 2 | ✅ At the counter: agent symbols, team icon grid with tap-to-expand, and "they argue" as a group chat grouped by round, with concessions and who decided | Readable in both `single` and `dialogue` mode (in `single`, it shows one round and "the arbiter decided") |
| 3 | ✅ Stats: card color picker, "what matters most to you" without a percentage, trimmed and combined stats, receipt layout | |
| 4 | ✅ Discover: deduplicated drink filters, and match ordering for shops and drinks | Your closest match is first in both lists |
| 5 | ✅ "You" copy pass across all frontend text, and transition animations everywhere | |
| 6 | ✅ Update `docs/demo-script.md` for the new sub-tabs (Reset demo and the what-if buttons now live in at the counter) | The script's clicks match the app |

### Accounts, store tools, and ordering (added 8:15 PM)

**Goal:**
- Real accounts: you sign in to get into the app, and you can sign back in to the same account from any browser.
- Shops run their own page: menu, discount rules, demand trends, and their shop profile.
- You can order and pay for a drink from a shop, and the shop sees the order.

**General:**
- **No default profile before sign in.**
  - Today `state/me.ts` falls back to the demo user (`andrew`) when nothing is stored, so some screens can show Andrew's data before anyone signs in.
  - After this change there is no current user until you sign in or sign up. Nothing personal renders before that.
  - The demo still needs a one-tap way in, so the sign-in screen keeps **"use the demo account"** buttons (Andrew as a customer, and Sunright Tea Studio as a shop). They sign in to real seeded accounts; they are not a silent fallback.

**Customer side:**
- **Accounts with sign in:**
  - Users, shop accounts, and sessions live in a database (SQLite is enough). The social profiles and choices that are in JSON today move into it, or link to it by `user_id`.
  - Sign up takes email (or handle) and a password, then runs the existing quiz. Sign in restores that account on any browser. Log out ends the session.
  - Passwords are hashed (bcrypt or argon2), never stored or logged in plain text. Sessions use an httpOnly cookie or a bearer token.
  - Seeded users get a demo password so the demo accounts can sign in.
- **No access without an account:**
  - Every customer and shop route sends you to `/welcome` (sign in or sign up) until you have a session.
  - The API takes the user from the session, not from a `user_id` in the request, for everything that writes data or reads private data. The public catalog (`GET /drinks`, `GET /shops`) can stay open.
- **Buying drinks from shops:**
  - **Order for pickup** on today's picks cards, the drink sheet in Discover, and a shop's menu.
  - Choose sugar, ice, and toppings from the shop's menu options. One shop per order.
  - **Checkout:** the price, any close-call offer you were shown (applied only before it expires, and only for that drink), and the pickup fee.
  - **Payment:** Stripe in test mode, with the secret key on the server only. The browser never sees a secret key or raw card numbers. "Pay at pickup" is the fallback, and it is what the demo uses if Stripe isn't set up.
  - **Order status:** placed → accepted → ready → picked up. You see it on an Orders page. The shop sees incoming orders and moves them along.
  - A completed order counts as a pick for the Preference agent, and afterwards you're asked to rate the drink.

**Shops side:**
- **Menu editing:**
  - Add, edit, and remove drinks: name, price, photo, description, flavor tags, taste attributes (sliders), and the sugar, ice, and topping options.
  - Add, rename, reorder, and remove **menu sections** (for example "milk teas", "fruit teas", "seasonal"), and move drinks between them.
  - Sold out and restock reach the recommender. Today they're saved only in that browser.
- **Close-call discount rules:**
  - The four current rules (runner-up, within 0.02, a different shop, losing on price) become **platform rules**. They're shown with a lock and can't be removed, so a shop can never buy a win outside a close call.
  - The shop adds, edits, and removes its **own rules** on top, from a fixed set of rule types with settings: max percent and max dollars (never above the platform cap), which drinks or sections, which days and hours (for example off-peak only), and max offers per day.
  - An offer goes out only when the platform rules and every one of the shop's rules hold. The offer is computed in code. An LLM never sets the number. Offers stay labelled on the cards.
- **Taste trends in Demand:**
  - What kinds of drinks people choose (milk tea, fruit tea, tea-forward, and top flavors), the most popular drinks overall and the shop's own, and how the priorities people weigh are shifting.
  - Toggle between **past week, past month, and past year**.
  - Built from choices, orders, and reviews, anonymized and aggregated. Buckets with fewer than 5 people are hidden, and no names are shown.
  - The seed adds timestamps across the past year so all three ranges have data.
- **Shop profile:** change the shop picture and add a description. Both show on Discover's shop cards and the shop's page.

**Demo safety:**
- The scripted demo must still run exactly as written. You sign in with the demo button, and Reset demo returns menus, rules, sold-out marks, and orders to the seed without deleting accounts.
- The single-mode demo numbers must not change: Thai Tea 78, Wintermelon 77, Pearl 71.

**Contract additions** (A adds them; B mirrors them in `types.ts`):

```ts
// Auth. Session cookie (httpOnly) or bearer token; A picks one and notes it in PROGRESS.md.
POST /auth/signup   { email, password, role: "customer" | "store", shop_id? } -> { user_id, role, shop_id? }
POST /auth/login    { email, password } -> { user_id, role, shop_id? }
POST /auth/logout   -> { ok: true }
GET  /auth/me       -> { user_id, role, shop_id? } | 401

// Menu
GET    /shops/{id}/menu -> { sections: { id, name, order, drink_ids: string[] }[] }
PUT    /shops/{id}/menu/sections                { sections: { id?, name, order, drink_ids }[] }
POST   /shops/{id}/drinks                       DrinkInput -> Drink
PATCH  /shops/{id}/drinks/{drink_id}            Partial<DrinkInput & { available: boolean }> -> Drink
DELETE /shops/{id}/drinks/{drink_id}
// DrinkInput: { name, price, description?, photo_url?, flavor_tags, attributes, options?: { sugar: string[]; ice: string[]; toppings: { name, price }[] } }

// Discount rules (platform rules are read-only)
GET    /shops/{id}/offer-rules -> { platform: { id, text }[]; rules: OfferRule[]; cap: { percent, dollars } }
POST   /shops/{id}/offer-rules                  OfferRuleInput -> OfferRule
PATCH  /shops/{id}/offer-rules/{rule_id}        Partial<OfferRuleInput> -> OfferRule
DELETE /shops/{id}/offer-rules/{rule_id}
// OfferRule: { id, kind: "max_discount" | "drinks" | "sections" | "hours" | "days" | "daily_limit", value, enabled }

// Demand
GET /shops/{id}/demand?range=week|month|year
  -> { bases: { base, share }[]; flavors: { tag, share }[]; top_drinks: { drink_id, count }[];
       own_top_drinks: { drink_id, count }[]; priorities: DimensionScores; people: number }

// Shop profile
PATCH /shops/{id} { description?, photo_url? } -> Shop   // GET /shops gains description

// Orders
POST  /orders { shop_id, items: { drink_id, sugar?, ice?, toppings?: string[] }[], offer_id?, pay: "card" | "pickup" }
        -> { order_id, total, status: "placed", payment_url? }
GET   /orders            -> Order[]   // yours as a customer; the shop's incoming ones as a store
PATCH /orders/{id}       { status: "accepted" | "ready" | "picked_up" | "cancelled" } -> Order
```

#### Track A: accounts, store tools, and ordering

| Order | Task | Done when |
|---|---|---|
| 1 | ⬜ Database plus auth: users, shop accounts, hashed passwords, sessions, and `/auth/*`; seed demo passwords | The demo accounts sign in. Private endpoints return 401 without a session and read the user from it |
| 2 | ⬜ Menu and shop profile: drinks CRUD, menu sections, shop `description` and `photo_url`; sold out from the shop menu reaches the recommender | An edited price or a new drink shows up in the next recommendation |
| 3 | ⬜ Offer rules: platform rules locked, shop rules CRUD, and the offer engine checks both | A shop rule can stop an offer but never allows one outside a close call or above the cap. Demo numbers unchanged |
| 4 | ⬜ Demand trends over week, month, and year from choices, orders, and reviews, with timestamps in the seed | Each range returns data, and small buckets are hidden |
| 5 | ⬜ Orders: create, status changes, offers applied at checkout, Stripe test mode with pay at pickup as the fallback; a completed order teaches the Preference agent | A demo order goes from placed to picked up, and the shop sees it |
| 6 | ⬜ Reset demo restores menus, rules, sold-out marks, and orders, but keeps accounts | The scripted demo runs twice in a row unchanged |

#### Track B: accounts, store tools, and ordering

Andrew wrote the first shop pages in `frontend/src/pages/shop/`. B builds on them; tell A before reworking them.

| Order | Task | Done when |
|---|---|---|
| 1 | ⬜ Sign in and sign up on `/welcome` with "use the demo account" buttons; remove the default profile in `state/me.ts`; every customer and shop route requires a session | A fresh browser sees only `/welcome` until it signs in, and signing in elsewhere restores the same account |
| 2 | ⬜ Shop menu editor: drinks (add, edit, remove, sold out), sections (add, rename, reorder, move drinks) | A shop can build a section and move a drink into it |
| 3 | ⬜ Close-call discount rules page: locked platform rules, plus the shop's own rules to add, edit, remove, and switch on or off | Changes save to the API and survive a reload |
| 4 | ⬜ Demand: taste trends with a week, month, and year toggle (drink types, flavors, most popular overall and the shop's own) | All three ranges render, with no names shown |
| 5 | ⬜ Shop profile: change the picture and add a description; show them on Discover's shop cards | |
| 6 | ⬜ Ordering: Order for pickup, options, checkout (offer and pickup fee), payment or pay at pickup, an Orders page with status, and the shop's incoming orders | A demo order completes end to end |
| 7 | ⬜ Update `docs/demo-script.md` for sign in, and add a short shop-side moment if there's time | The script's clicks match the app |

### Custom what-if at the counter (added 8:20 PM)

**Goal:** the what-if box on at the counter takes your own changes, not just the five preset buttons. You describe a change, and the agents re-plan around it.

**How it works:**
- **A change builder:** pick the kind of change, then the target from lists of real drinks, shops, and flavors. Kinds:
  - a drink sells out, or is back in stock;
  - a shop goes offline, comes back online, or joins;
  - you don't want a flavor or ingredient, or you want more or less of a taste (sweeter, less milky, more tea);
  - a price limit for this order;
  - a drink's price changes.
- **Or type it:** a text box such as "taro is sold out at boba guys" or "I want something less sweet under $6."
  - The backend turns the text into the same structured changes the builder makes, and the UI shows them as chips ("Taro Milk Tea: sold out", "sweetness: lower", "under $6.00") for you to confirm or remove before anything runs.
  - An LLM may do the parsing, but it can only choose from the known change kinds and real ids. Anything it can't match is shown as "not understood" and is never applied. Without an LLM key, a simple keyword matcher does the same job.
  - The LLM never sets scores. Scores and rankings stay in code.
- **Several changes at once:** you can stack changes, and one re-plan runs for all of them.
- **The chat shows them:** each applied change appears as a note at the top of "they argue" ("You: taro is sold out at Boba Guys"), as the preset buttons do now.
- **The presets stay:** #1 sells out, #1's shop goes offline, Lantern Leaf joins, no brown sugar, and Reset demo remain as one-tap chips, so the demo script doesn't change.
- **Reset demo** clears every custom change.

**Contract additions** (A adds them; B mirrors them in `types.ts`):

```ts
type WhatIf =
  | { kind: "sold_out" | "restock"; drink_id: string }
  | { kind: "shop_offline" | "shop_online" | "shop_join"; shop_id: string }
  | { kind: "avoid"; tag: string }                                   // flavor or ingredient, e.g. "brown_sugar"
  | { kind: "taste"; attribute: TasteAttribute; direction: "more" | "less" }
  | { kind: "max_price"; dollars: number }                           // this order only
  | { kind: "price"; drink_id: string; dollars: number };

POST /whatif/parse { text } -> { changes: WhatIf[]; not_understood: string[] }
POST /whatif       { user_id, changes: WhatIf[] } -> { ok: true; applied: WhatIf[] }   // then the frontend re-runs /recommend
```

#### Track A: custom what-if

| Order | Task | Done when |
|---|---|---|
| 1 | ⬜ `POST /whatif` applies the structured changes, including the new kinds (restock, shop back online, taste direction, a price limit for this order, a price change); Reset demo clears them | Each kind changes the next recommendation, and the preset buttons give the same numbers as before |
| 2 | ⬜ `POST /whatif/parse`: text to changes, limited to the known kinds and real ids, with a keyword fallback when there's no LLM key | "taro is sold out at boba guys" returns one `sold_out` change, and nonsense returns only `not_understood` |

#### Track B: custom what-if

| Order | Task | Done when |
|---|---|---|
| 1 | ⬜ Change builder on at the counter: kind, then target from real lists; stack several; apply runs one re-plan | A custom sold-out and a taste change both show up in the chat and the new top 3 |
| 2 | ⬜ Text box: parse, show the changes as chips to confirm or remove, and show what wasn't understood | Nothing runs until you confirm |
| 3 | ⬜ Keep the five presets as chips, and make sure the demo script still matches | The scripted demo is unchanged |

### Sync points

| Time | Both of you |
|---|---|
| 1:15 | Merge the feature branch. Both run the app |
| 2:00 | AGNTCY go/no-go (A tells B) |
| 4:00 | Quick merge of whatever is ready; B checks `GET /eval` progress |
| 6:00 | Merge, then a full demo run-through. Re-cut scope if anything is behind |
| 9:00 to 9:30 | Final merge and freeze. Push before the venue closes |
| Sun 11:30 to 12:15 | Rehearse three times together. **Submit by 12:30** |

If one track finishes early, take the other track's next unstarted task, but say so first so you don't both pick it up.

## Demo script

See [`demo-script.md`](demo-script.md): a 3-minute run with exact clicks, lines, and real numbers, plus answers to likely judge questions. The order is: reset, top 3 with a close call, pick Pearl Milk Tea, #1 sells out, Lantern Leaf joins, no brown sugar, Lantern Leaf goes offline, Why this order, Evidence. Everything after the pick runs from the at the counter sub-tab.

## If we fall behind, cut in this order

1. UI round 2 extras, in this order:
   - typed custom what-ifs (keep the change builder), then the change builder (keep the preset buttons);
   - agent dialogue (keep `single`);
   - the Stats receipt layout and card color;
   - transition animations;
   - Discover match ordering.
   Keep the at the counter sub-tab and the trimmed today's picks.
2. Accounts, store tools, and ordering, in this order:
   - card payments (keep pay at pickup);
   - the month and year ranges in demand trends (keep the week);
   - menu sections (keep editing drinks);
   - the shop picture and description;
   - ordering.
   Keep sign in, the demo account buttons, and the discount rules.
3. UI cleanup extras: the Discover filters and detail sheet (keep the search box)
4. Shop images and cover images (keep the drink images)
5. Social layer extras: comments and recs, then the feed (keep the quiz and profile if at all possible)
6. Friends tab (once profiles exist, it folds into them)
7. Counterfactual page (Why This and the timeline already show the before/after)
8. LLM wording
9. AGNTCY (use the local transport)

**Never cut:** conflict resolution, sold-out, the Lens timeline, top 3 with learning, the baseline comparison, or the TeaLink tab at `/` (the demo runs there).

## Stretch ideas (only after the freeze-safe build)

- Shop offers: a shop agent may offer a small discount, bounded by the shop's budget, to win a close call. It would show up as a cost change in the resolver.
- Group mode: several users' Preference agents negotiate over one order (SLIM group chat).
- TBAC / agent identity from AGNTCY.

## Plan change log

- **8:20 PM:** Added "Custom what-if at the counter": a change builder and a text box, so you can enter your own changes (sold out or restocked, a shop offline, online, or joining, a flavor to avoid, a taste direction, a price limit, a price change). Typed text becomes structured changes you confirm first. An LLM may parse it but never scores. The preset buttons stay, so the demo is unchanged. It's first on the cut list.
- **8:15 PM:** Added "Accounts, store tools, and ordering":
  - Real sign in, with no default profile before it, and no access without an account. The demo keeps one-tap demo account buttons.
  - Shops can edit their menu and its sections, add their own close-call discount rules on top of locked platform rules, see taste trends by week, month, or year, and change their picture and description.
  - Customers can order and pay for pickup.
  - New contracts for both tracks. These go second on the cut list, after the round 2 extras.
- **7:40 PM:** Track B finished its UI round 2 rows:
  - At the counter (`/counter`) has the what-if buttons, the team grid, the group chat, and the decision. `/counterfactual` now redirects there.
  - The frontend already reads the planned fields (`name`/`description`, `round`/`revised_from`, `decided_by`/`rounds`, `match`, `card_color`). Until they're served, it falls back to its own agent descriptions, round 1, "the arbiter decided," client-side taste matching, and a card color saved in the browser.
  - Re-check the demo script once Track A reports the `dialogue` numbers.
- **6:55 PM:** Added "UI round 2 and agent dialogue":
  - TeaLink sub-tabs are now today's picks · at the counter · why this order · evidence. What changed is removed, and the what-if controls move to at the counter.
  - Today's picks is trimmed to the top 3.
  - At the counter gets agent symbols, a team icon grid, and a group-chat "they argue."
  - Soften-only rebuttal rounds (cap 3) with arbiter fallback, behind `DELIBERATION=dialogue|single`.
  - Stats and Discover are trimmed; Discover is ordered by match.
  - All copy says "you."
  - New contract fields for both tracks. The round 2 extras go first on the cut list.
- **3:50 PM:** Track A fixed quiz flavors: a new user's `top_notes` are the flavors they picked, not notes inferred from matching drinks.
- **3:45 PM:** Track A shipped `GET /drinks`, `GET /shops`, null `photo_url` / `cover_url`, and shop offers. A near-tie discount is up to 10% and only when the runner-up is losing on price, so it can flip #1 without changing the scripted demo. Track B: mirror `offer` on `LensEventType` and `RankedDrink`, and call the two new lists. Shapes are in `PROGRESS.md`.
- **3:35 PM:** Merged Track A's social backend into main with Track B's social frontend. The API now matches the 3:10 contract: bare lists, `{viewer}` on likes and comments, `author` on feed items, `&author=` on the feed, toppings as a 0–1 number, and the quiz questions from `mocks/social/quiz.json`.
- **3:30 PM:** Added "UI cleanup and five tabs":
  - Five tabs: Home, Discover/search, TeaLink (today's picks, at `/`), Stats, and Profile.
  - Readability rules for every screen.
  - Placeholder pictures for drinks, shops, and profile covers. User uploads come later, through reserved `photo_url` and `cover_url` fields.
  - `GET /drinks` for Track A.
  - Track B's evening re-ordered: quiz, then tabs, then Discover and pictures, then Stats and the readability pass.
  - The extras go first on the cut list.
- **3:10 PM:** Contract fixes before anyone builds on them:
  - `BobaStats.toppings` is a 0–1 number and `top_notes` is a list of flavor tags, matching what `drinks.json` actually stores.
  - Added `GET /users?viewer=` (suggestions) and `DELETE /feed/{id}/like`.
  - Like and comment calls return the updated item.
  - The quiz's sixth question is flavors rather than a favorite shop, with its questions in `mocks/social/quiz.json`.
  - Feed items and comments carry an `author` (handle, name, avatar), so the feed doesn't need one request per post.
  - `GET /feed` takes `&author=` for profile pages.
- **2:55 PM:** Added the social layer: onboarding quiz, boba stats with show/hide, customizable profiles, follows, a friends feed, likes, comments, and recs. Inspired by Instagram, Letterboxd, Spotify Wrapped, and Strava. Split into Track A (schemas, stats and quiz mapping, social endpoints) and Track B (app shell, quiz, profile, feed), with contracts in the plan. Social extras go first on the cut list; the 3-minute demo doesn't depend on them.
- **2:36 PM:** Dropped the ElevenLabs voices stretch goal.
- **2:10 PM:** Track A shipped `GET /eval` (popularity 2/24, fixed weights 5/24, learning 7/24 over 8 rounds) and made Sarah Andrew's closest match. No schema change. Demo top 3 is still Thai Tea, Wintermelon, Pearl Milk Tea; the priority percents and Wintermelon's score moved by a point, so the demo script needs a refresh.
- **2:25 PM:** Track B wired the Evidence page to live `GET /eval` and refreshed the demo script, write-up results, and recorded mocks for Track A's re-seed. In the demo, "#1's shop goes offline" now takes down Lantern Leaf rather than Sunright. The AGNTCY reset bug is fixed: heartbeats follow the runtime Reset demo installs.
- **2:00 PM:** Track B checked the demo over AGNTCY (identical results), added the transport badge, updated the README and demo script for AGNTCY mode, and drafted `docs/writeup.md`. It found a reset bug in AGNTCY mode for Track A (details in `PROGRESS.md`).
- **1:45 PM:** Track B also finished the close-call prompt, the timeline regrouping, and a first draft of `docs/demo-script.md`. B's remaining work waits on Track A (the offer badge and the real `/eval` numbers) or is Sunday work (write-up, video, rehearsal). The "Demo script (draft)" section below is replaced by that file.
- **1:45 PM:** AGNTCY is a go. Track A serves the roster over NATS, with in-process fallback. No schema change for Track B.
- **1:30 PM:** Track B finished its first three blocks early (Counterfactual, clean-up, Evidence page). Next up for B: ask-the-human and timeline polish, then the demo script.
- **1:15 PM:** Split the remaining work into Track A (backend, agents, evidence) and Track B (frontend, demo, write-ups), with separate file ownership, agreed contracts for `/eval` and offers, and shared sync points. Added an Evidence page, and an AGNTCY-plus-baseline block for A.

- **1:10 PM:** The plan moved into this file (`docs/PLAN.md`) so the team can edit it on GitHub.
- **12:50 PM:**
  - Single recommendation → top 3 plus a learning Preference agent.
  - Added a Budget agent (cost).
  - Shops verify rather than propose.
  - Ask-human gap went from 0.05 to 0.02, since a bigger gap fired too often.
  - Counterfactual moved up the cut list.
