# TeaLink progress and to-dos

*Last updated: Sun Oct 11, 1:20 AM. Update this file whenever work lands or the plan changes. Newest plan changes go at the top of the log.*

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

### Profile photos and rec rules (Andrew)

Track B mirrors this in `frontend/src/api/types.ts`. Demo scores are unchanged (Thai Tea 78, Wintermelon 77, Pearl 71; ordering Pearl is taste 45%, price 36%, Pearl 73).

- `Avatar.photo_url?: string | null`. A JPEG data URL at most 512 px a side, or null. `UserProfile`, feed and comment `Author`, and notification `from` all use `Avatar`, so the photo is on the profile, in the feed, and on the bell. `PATCH /users` with `avatar.photo_url: null` clears the photo and leaves the emoji and color. Omitting `photo_url` leaves the current photo in place.
- `UserProfile.cover_url` is one of `pearls`, `leaves`, `swirl`, `fruit`, `matcha`, `lineup`, a JPEG data URL at most 1600 px wide (height capped at 1600), or null. Anything else on `PATCH /users` is 422. Null goes back to the automatic placeholder. Post `photo_url` is still a JPEG data URL at most 1080 px a side. `GET /feed` and `GET /feed?author=` return that exact string.
- `POST /recs` still takes `{ from, to, drink_id, text }`. If `to` does not follow `from`, the response is 403 with detail `you can only send recs to people who follow you`. A successful rec notifies the recipient.
- `Notification.kind` adds `"rec"`. A rec notification includes `drink_id` and `text` (the note). `from` is still an `Author`.

### Profile layout, photos, and recs (Emily, Track B of the 12:55 AM plan)

- The boba card and boba stats sit side by side when both are on, and a single one is centered. The Stats page does the same, and the pair stacks on a narrow window.
- Order, new post, edit profile, drink detail, send-a-rec, and the notification list open in the middle of the screen and scroll inside themselves.
- Edit profile can upload a photo (emoji is the fallback) and a banner (placeholder covers remain). The photo shows on the profile, in the feed, and on notifications. Reset demo clears uploads.
- On a narrow window every stat, including favorite shop, spans the whole row.
- Send a rec, Follow, and Request bestea sit below the banner. Send a rec is hidden unless that person follows you. A rec from someone you follow shows in the bell with the person, the drink, and the note. Sarah's seeded rec to Andrew is Hojicha Cream Tea.
- Top 3 cards lead with the score as "78% match", then "no. 1". The scripted order is unchanged.
- Side doodles stay in the margin beside the widest page and hide once that margin gets too narrow to draw in (under 1360px).

### Ordering, posts, and besteas (Andrew, Track A of the 9:30 PM plan)

- Placing an order for a drink in the current top 3 returns `learned` and teaches immediately. Ordering Pearl after Reset demo is taste 45%, price 36%, Pearl 73. An order from outside the top 3 adds a 4/5 taste signal and does not change weights. Pickup does not teach again, and cancelling does not undo it. Orders and `POST /choices` do not add a feed item. Seeded picks stay in history and stats, and are left out of `GET /feed`.
- `POST /posts` and `DELETE /posts/{id}`. Text is 1–500 characters. `photo_url` is a JPEG data URL at most 1080 px a side, or null. Optional `drink_id` and `shop_id`. Likes and comments use the existing feed routes. Reset demo drops posts.
- `BobaStats.past_orders` is the newest 10 orders as drink, shop, and date, with no prices. It is hidden from other viewers unless `visible_stats` includes `past_orders`. Seeded profiles do not include it until someone adds it in Edit profile.
- Besteas: `POST /bestea/{user}/request|accept|decline` and `DELETE /bestea/{user}`. Profiles add `bestea` (`none`, `requested`, `incoming`, `bestea`) and `besteas`. `GET /notifications` returns `{items, unread}`. `POST /notifications/read` marks the given ids, or all of them when `ids` is omitted. A bestea's order notifies the other person with `drink_id` and `shop_id`. Reset demo clears besteas, notifications, and posts, and keeps accounts.

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
- ✅ Shop offers. In a near-tie between two shops, the trailing shop offers up to 10% off, and only when its drink is losing on price. The cost score is recomputed and can move that drink to #1. An `offer` Lens event is emitted. The scripted demo never hits this case (the runner-up is already the cheaper drink, or both drinks are from the same shop), so Thai Tea 78, Wintermelon 77, Pearl 71, and the Lantern Leaf join are unchanged.
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
- ✅ Offer badge. A discounted drink's card shows "10% off from (shop)" with the old price struck through, and the timeline gets an "A shop makes an offer" step. Checked live: Hana's round has Boba Guys take 10% off House Milk Tea ($5.75 to $5.17), which moves it to #1; Elena's round also gets an offer. Andrew's scripted run still produces none, and the full script sequence still matches (78/77/71, then 79/75/73 after the Pearl pick, then the Wintermelon 75 vs Pearl 73 close call after the sell-out).
- ⬜ Write-up and backup video

**Social layer (new, 2:55 PM; full spec and contracts in [`PLAN.md`](PLAN.md#social-layer-added-255-pm)):**
- Track A: ✅ social schemas and seed · ✅ boba stats and quiz mapping (seeds the Preference agent) · ✅ profile, follow, feed, like, comment, and rec endpoints · ⬜ optional follow boost in the Social agent
- Track B:
  - ✅ Types, sample data built from the seed (`node frontend/scripts/build-social-mocks.mjs`), and client calls that fall back to an in-browser mock until A's routes exist.
  - ✅ App shell: bottom tabs on phones, top nav on desktop.
  - ✅ Profile page (`/u/:handle`): header, personality, taste match, go-to order, stats grid, reviews, and follow. The edit sheet covers name, bio, emoji avatar, colors, pinned order, and show/hide and reorder stats.
  - ✅ Home feed (`/home`): suggestions, likes, comments, review photos, and "send a rec" (from a drink's sheet in Discover or from someone's profile, over live `POST /recs`). A rec sent to you has a "Try this" button that opens the drink in Discover. Friends is folded into Discover.
  - ✅ Onboarding quiz at `/welcome`, checked against the live API:
    - Sign-up asks for an avatar, a name, and a handle.
    - Six questions, one per screen, with a progress bar.
    - It ends with a Wrapped-style Boba card.
    - First-time visitors to Home or Profile land there; `/` still opens the recommender, so the demo URL is unaffected.
    - "Skip and use the demo account" signed in as Andrew. Replaced at 8:50 PM by real sign-in (see "Accounts, store tools, and ordering" below).
  - ✅ The recommender follows the signed-in user instead of a hard-coded Andrew. A test user who chose fruit, low budget, and adventurous got Honey Lemon, Wintermelon, and Grapefruit Green Tea, with the quiz's priorities.
  - ✅ Reset demo restores the seed. Since 8:50 PM it keeps whoever is signed in instead of switching to Andrew. The demo numbers are unchanged: Thai Tea 78, Wintermelon 77, Pearl Milk Tea 71.

**UI cleanup and five tabs (new, 3:30 PM; spec in [`PLAN.md`](PLAN.md#ui-cleanup-and-five-tabs-added-330-pm)):**
- Track A: ✅ `GET /drinks` (all 43 drinks, `photo_url: null`) · ✅ `GET /shops` (all 6, including Lantern Leaf, `photo_url: null`) · ✅ reserved `photo_url` on feed items and `cover_url` on profiles (both `null`) · ✅ shop offers · ⬜ stretch, after the freeze: photo uploads
- Track B: ✅ five tabs and routes (Home, Discover, TeaLink at `/`, Stats, Profile), with Friends folded in (`/friends` now opens Discover's People view) · ✅ Discover with search, filters, and the drink detail sheet · ✅ Stats tab · ✅ placeholder images: 10 drink styles, 6 shops, and 6 covers in `frontend/public/img/` (generated; each drink maps to a style by name and flavor tags, and any real `photo_url` / `cover_url` replaces the placeholder) · ✅ photos on feed cards, top 3 cards, Discover rows, shop cards, and the drink sheet, plus a profile cover and an Instagram-style grid/list of posts · ✅ cover picker in Edit profile · 🟡 readability pass: the new screens use 15px body text and 44px targets; the older pages still need a pass · ✅ visual refresh mixing HEYTEA and Molly Tea in a tea-green palette (rice-paper background, deep green ink, moss accent, sage surfaces, pill buttons, lowercase wide-tracked nav, hand-lettered section titles; same layout and screens) · ✅ quieter tea-house type: Jost, light and lowercase for headings, buttons, and labels · ✅ line-drawn tea and plant doodles (`components/Doodles.tsx`): sprig, leaf, sprout, leaf pair, teapot, steaming tea bowl on section and page titles and the loading state; faint tea branches in the page margins on wide screens; a vine footer · ✅ new logo: two hands clinking boba cups, with a light lowercase "tealink" wordmark in Jost, matching the rest of the type · warm avatar and profile colors from the API are shown as matching greens (`lib/palette.ts`), so no data change is needed · ✅ TeaLink tab: top 3 cards size to their container, so long names wrap inside the card at any width; "at the counter" collapses to one short row instead of stretching to the column's height · ✅ UI round 2 (7:40 PM): TeaLink sub-tabs are today's picks (top 3 only, no meters) · at the counter (`/counter`: what-if buttons and Reset demo, a team icon grid with one symbol per core agent and a shared shop symbol, tap to expand, and "they argue" as a group chat grouped by round, ending with who decided) · why this order · evidence. What changed is gone, and `/counterfactual` redirects to `/counter` · ✅ Stats: you pick the card color, "what matters most to you" with no percentage, sweetness / milk vs fruit / toppings removed, streak + shops + drinks tried combined into "your boba run", and a receipt below the card · ✅ Discover: no duplicate "fruit" filter, and drinks and shops are ordered by how well they match you · ✅ "you" wording in frontend copy, and page, sheet, and button transitions (off for reduced motion) · ✅ demo script updated for the new sub-tabs; Thai Tea 78 / Wintermelon 77 / Pearl 71 re-checked after Reset demo

**Accounts, store tools, and ordering (new, 8:15 PM; spec in [`PLAN.md`](PLAN.md#accounts-store-tools-and-ordering-added-815-pm)):**
- Track A: ✅ all six rows. Sessions are an httpOnly cookie (`tealink_session`). Demo accounts are `andrew@tealink.demo` and `sunright@tealink.demo`, password `boba`. Private routes return 401 with detail `sign in required`. A real missing drink is `drink not found`, not `Not Found`. Pay at pickup is the default; card checkout runs only when `STRIPE_SECRET_KEY` is set, and otherwise the order is still placed as pay at pickup. Reset demo reloads menus, rules, sold-out marks, and orders, and leaves accounts in `backend/data/accounts.sqlite`.
- Track B (8:50 PM, browser-checked):
  - ✅ Sign in and sign up on `/welcome`, with demo account buttons (Andrew, and Sunright Tea Studio for the shop). There's no default profile, and every customer and shop route sends you to `/welcome` until you sign in. Logging out lands on sign in.
  - ✅ Shop menu editor: add, edit, and remove drinks; sold out and restock; add, rename, reorder, and remove sections, and move drinks between them.
  - ✅ Discount rules page: the four platform rules locked, plus the shop's own rules (cap, drinks, sections, hours, days, offers per day) to add, edit, remove, and switch on or off.
  - ✅ Demand: taste trends with a past week / month / year toggle (drink types, top flavors, most popular overall and the shop's own, what people weigh). No names, and anything under 5 people is hidden. Sample data until A serves it.
  - ✅ Shop profile: pick a storefront photo or upload one (resized in the browser), and add a description. Both show on Discover's shop cards.
  - ✅ Ordering: **Order for pickup** on the top 3 cards and in Discover's drink sheet (a shop card filters Discover to that shop's menu). Sugar, ice, and toppings; checkout with the close-call offer (that drink only, while it's still on screen), a $0.50 pickup fee, and the total; pay at pickup, with Card shown only when the API is live. An **Orders** page with status and cancel, and a star rating after pickup. The shop gets an **Orders** tab to accept, mark ready, and hand over. Checked: a demo order went from placed to picked up, and the shop saw it.
  - ✅ Reset demo also clears menu edits, rules, shop profile, and orders in the browser, and keeps accounts.
  - ✅ Demo script: sign in with the demo button first, plus an optional 30-second shop-side moment.

**Custom what-if (new, 8:20 PM; spec in [`PLAN.md`](PLAN.md#custom-what-if-at-the-counter-added-820-pm)):**
- Track A: ✅ `POST /whatif` and `POST /whatif/parse`. Parse is the same keyword matcher as `frontend/src/lib/whatif.ts` (no LLM key required). Taste moves an attribute 0.3 from your profile, and avoid sets that tag to 0. Reset demo clears every custom change. Preset buttons still use the event routes, and the single-mode opening stays 78 / 77 / 71.
- Track B (9:05 PM, browser-checked): ✅ "your own change" on at the counter. Type a change and press **Read it**, or build one from lists. Each change becomes a chip you can remove, anything unclear is listed as not understood, and nothing runs until **Re-plan**. One re-plan covers every chip, and the chat opens with "You: …". Checked: "taro is sold out at sharetea, and less sweet under $6" plus "no matcha" re-ranked to Wintermelon 79, and Reset demo brought back Thai Tea 78. ✅ The five preset buttons are unchanged, so the demo script still matches.

**Ordering replaces picking, custom posts, and besteas (new, 9:30 PM; spec in [`PLAN.md`](PLAN.md#ordering-replaces-picking-custom-posts-and-besteas-added-930-pm)):**
- Track A: ⬜ rows 1-4.
- Track B (9:50 PM, browser-checked on in-browser mocks): ✅ all six rows.
  - ✅ "Pick this" is gone. The top 3 cards only have **Order for pickup**, and the close-call buttons say "Order Thai Tea". Placing an order for a top 3 drink re-runs the round the way a pick did. Checked: after Reset demo, ordering Pearl gave taste 45%, Thai Tea 79 / Wintermelon 75 / Pearl 73, and the chat opens with "You ordered Pearl Milk Tea."
  - ✅ No "pick" items in Home or on profiles, whether they come from the API or the mock.
  - ✅ **New post** on Home and your profile: a photo with a caption, or a caption alone (shown large, like a tweet), with an optional drink or shop tag that links to Discover. Photo posts show in the profile grid, and every post shows in the list. You can delete your own.
  - ✅ A "Past orders" stat (drink, shop, and when; no prices) on the profile and the Stats receipt, off by default and switched on in Edit profile.
  - ✅ Bestea button next to Follow (request, requested, accept or decline, besteas ♥, end with a confirm), and a besteas count. A bell in the header shows unread notifications, with Accept and Decline on requests, and marks them read when opened.
  - ✅ The mock seeds Sarah's bestea request to Andrew, plus Hana as an existing bestea with one order notification, so the bell has something to show after Reset demo. Reset demo clears posts, besteas, and notifications created since.
  - ✅ `docs/demo-script.md`: order Pearl instead of picking it (same numbers), and the optional segment now starts with the bell.

**Track A social backend (branch `a/social-backend`, 3:35 PM).** All Track A blocks from 3:00 to 6:00 are done, and 36 backend tests pass. The demo is unchanged: Thai Tea 78, Wintermelon 77, Pearl Milk Tea 71, with the close-call prompt, and `eval_results.json` is byte-identical.
- **Seed:** `make seed` also writes `backend/data/social.json`: a profile for each of the 15 users (handle = user id, emoji avatar, bio, accent), follows (Andrew follows Sarah, Hana, Nora, Chris, and Marco), and 177 feed items. Every seeded review is a feed item, plus Andrew's 4 past picks, a "joined" item per user, likes, 3 comments, and Sarah's rec of Hojicha Cream Tea to Andrew (the newest item in his feed). Reset demo reloads all of it and drops users created since.
- **Quiz (`core/quiz.py`):** the six questions from the frontend mock. Sweetness, base, and toppings set the taste profile. Budget and adventurousness nudge the default priorities, then the usual 5% floor is applied. Chosen flavors become the starting top notes. The quiz profile counts as three five-star reviews, and the weights are the Preference agent's prior. Picks are learned on top.
- **Stats (`core/stats.py`):** favorite drink and shop, sweetness, milk vs fruit, toppings as a 0–1 level, drinks tried and shops visited, weekly streak, top flavor notes, current learned priorities, and a personality ("Brown Sugar Deal Hunter" for Andrew, "Brown Sugar Loyalist" for Sarah).
- **Demo safety:** the Social agent only takes neighbors who have rated something, so a new user never pushes Sarah out of Andrew's top 3 neighbors (tested). In AGNTCY mode, requests for users created or re-profiled at runtime are answered in-process, because the agent processes loaded the catalog at startup.

**Seam for Track B (3:45 PM).** Backend only. Mirror these in `types.ts`; the screens stay yours.

- `GET /drinks` returns a bare list of `{id, name, shop_id, price, flavor_tags, photo_url}`. All 43 drinks, Lantern Leaf included. `photo_url` is always `null`.
- `GET /shops` returns a bare list of `{id, name, neighborhood, photo_url}`. All 6 shops, including offline Lantern Leaf. `photo_url` is always `null`.
- `UserProfile.cover_url` and `FeedItem.photo_url` are always `null`. `PATCH /users` does not accept a cover yet.
- `LensEventType` adds `"offer"`. The payload is `{shop_id, percent, price_after, reason}`. `percent` is a whole number, so 10 means 10% off. The timeline message is the `reason`.
- `RankedDrink.offer` is that same object, or `null`. When a discount wins, that drink is #1 and its `price` is `price_after`.
- A shop only discounts when it is the runner-up, the top two are within 0.02, the shops differ, and its drink is losing on price. The 3-minute script does not produce an offer, so `docs/demo-script.md` does not need new numbers. The badge should still render whenever `offer` is set.

**The social API matches the frontend contract.** `GET /quiz`, `GET /users?viewer=`, and `GET /feed` return bare lists. Likes and comments take `{viewer}`. Every feed item and comment carries an `author`, and `GET /feed?author=` is one person's posts. `toppings` is a 0–1 number. A missing user returns 404 with `detail: "user not found"`, so the frontend does not treat it as a route that has not shipped. After Reset demo, users created through `/users` are gone.

**UI round 2, Track A (branch `a/dialogue`).** `DELIBERATION` defaults to `single`. With that default the scripted opening is unchanged: Thai Tea 78, Wintermelon Tea 77, Pearl Milk Tea 71, a close call, `decided_by` `"arbiter"`, `rounds` 0. The rest of the single-mode button sequence still matches the demo script: after picking Pearl, taste is 45% (was 41%) and price is 36%, and the re-rank is Thai Tea 79 / Wintermelon 75 / Pearl 73; Thai Tea sells out to Wintermelon 75 / Pearl 73 / Thai Milk Tea 70; Lantern Leaf joins at Brown Sugar Hojicha Milk 81 / Osmanthus Milk Tea 75 / Wintermelon 75; no brown sugar leaves Osmanthus 75 / Wintermelon 75 / Pearl 73; Lantern Leaf going offline returns Wintermelon 75 / Pearl 73 / Thai Milk Tea 70.

`DELIBERATION=dialogue` was run as the same buttons: reset, Andrew's opening recommend, pick `options[2]` of that opening top 3 (what the existing tests do), #1 sells out, Lantern Leaf joins, brown sugar override 0, then #1's shop goes offline. Every step used all 3 rebuttals, so `decided_by` is `"arbiter"` and `rounds` is 3. Percents are `Math.round(score * 100)`.

| Step | Top 3 | What changed |
|---|---|---|
| Opening | Thai Tea 79, Wintermelon Tea 71, Osmanthus Oolong 64 | Not a close call. `options[2]` is Osmanthus Oolong, not Pearl. Priorities stay price 43%, taste 41%. |
| Pick `options[2]` | Thai Tea 79, Wintermelon Tea 71, Osmanthus Oolong 64 | "You picked Osmanthus Oolong over Thai Tea, so trying something new now counts for 7% (was 5%)." Price goes from 43% to 42%. |
| #1 sells out (Thai Tea) | Wintermelon Tea 71, Osmanthus Oolong 64, Pearl Milk Tea 64 | Osmanthus is 0.642 and Pearl is 0.638, so both show as 64. Not a close call. |
| Lantern Leaf joins | Wintermelon Tea 71, Brown Sugar Hojicha Milk 67, Osmanthus Oolong 64 | Brown Sugar Hojicha does not take #1. |
| No brown sugar | Wintermelon Tea 71, Osmanthus Oolong 64, Pearl Milk Tea 64 | Brown Sugar Hojicha leaves the top 3. |
| #1's shop goes offline | Thai Milk Tea 63, House Milk Tea 63, Jasmine Green Milk 62 | #1 is Wintermelon, so this takes Sunright Tea Studio offline, not Lantern Leaf. Thai Milk Tea is 0.6297 and House Milk Tea is 0.6296, so it is a close call. |

Neighbor names stay in social rationales ("Sarah ... rated it 5/5"). Concession text is per drink on `objections[].revised_from` inside each summary objection event.

**Seam for Track B.** Mirror these; `types.ts` stays yours. `round` on a proposal event is `0`. The first objection round is `1`. Rebuttals are `2`, `3`, then `4`. `Decision.rounds` counts finished rebuttals only (`0` in `single`). A summary objection event carries `round` and `objections[]`. A softened objection has `revised_from: { kind: "support" \| "concern" \| "neutral", score: number \| null }` on that objection. The summary payload also has top-level `revised_from` when that agent softened exactly one drink in the round; several softenings live only on the objections. Veto events never have `revised_from`. `GET /health` adds `deliberation: "single" \| "dialogue"`. `GET /drinks?user=` and `GET /shops?user=` add `match` (`null` when `user` is omitted; a 0–1 taste match when it is set; a shop's match is its best drink; unknown user 404; lists stay in catalog order). `UserProfile.card_color` and `PATCH /users` accept `#RRGGBB`; it is in memory only and Reset demo clears it. `AgentSelection` adds `name` and `description` from the agent card.

## Known issues and decisions to revisit

- **For Track A (accounts, store tools, and ordering, from Track B 8:50 PM).** The frontend calls the contract routes in `PLAN.md` first, with `credentials: "include"` (CORS already allows credentials from :5173). It falls back to its mock only when a route answers 404 with detail exactly "Not Found", or 405, so return a different `detail` for a real 404 such as an unknown drink. Small differences from the contract it already expects:
  - **Auth:** seed `andrew@tealink.demo` (user `andrew`) and `sunright@tealink.demo` (shop `sunright`), both with password `boba`; the buttons on `/welcome` use these. Responses include `email`. Customer sign-up first creates the profile with `POST /users`, then sends `user_id` in `POST /auth/signup`.
  - **Menu:** `GET /shops/{id}/menu` returns `{ drinks: ShopDrink[], sections }`, where `ShopDrink` is `DrinkInput` plus `id`, `shop_id`, and `available`. Sold out also calls `/events/sold-out` today; restock needs your `PATCH .../drinks/{id} { available: true }` to reach the recommender.
  - **Shop profile:** `photo_url` can be a JPEG data URL (at most 900 px a side, usually under 150 KB) or one of `/img/shops/*.jpg`.
  - **Demand:** the response also carries `range`.
  - **Custom what-if:** before your routes exist, the frontend applies a taste change as a preference override that moves that attribute 0.3 from the user's profile value (clamped to 0–1), and "avoid" as a tag override of 0, like the brown sugar button. Using the same step in `POST /whatif` keeps the numbers the same once it's live. The browser's keyword matcher is in `frontend/src/lib/whatif.ts` if you want to mirror it for the no-LLM fallback. Note that the plan's example "taro is sold out at boba guys" has no match: taro is only at Sharetea and Kung Fu Tea, so the matcher correctly says it didn't understand.
  - **Orders:** proposed full `Order`: `{ order_id, user_id, customer_name, shop_id, items: { drink_id, name, price, sugar?, ice?, toppings? }[], subtotal, discount, pickup_fee, total, pay, status, created_at, rating? }`. `PATCH /orders/{id}` also takes `{ rating: 1-5 }`. The frontend shows a $0.50 pickup fee in its estimate; your total wins. Offers have no id yet, so the frontend leaves `offer_id` out and expects the server to apply the offer from the user's current round.

- **For Track A (ordering, posts, and besteas, from Track B 9:50 PM).** The frontend uses the 9:30 PM contract routes first and keeps its mock for anything that answers 404 "Not Found":
  - **Order learning:** when `POST /orders` returns `learned`, the frontend shows its summary and re-runs the round. If `learned` is missing (your current server), it calls `POST /choices` for a top 3 order, the old pick path. Until your row 1 lands, that means a top 3 order learns once at placement and again at pickup through `_learn_pickup`, and `/choices` still adds a "pick" item (the frontend hides those). Once you return `learned`, send `learned: null` for orders that don't count as a pick, so the frontend doesn't fall back. The summary still says "You picked Pearl Milk Tea over Thai Tea…"; "ordered" would read better now.
  - **Bestea routes:** the frontend sends a handle (notifications carry `Author`, which has no `user_id`), so please resolve `{user_id}` like `/users/{ref}` (id or handle).
  - **Mixed servers:** while `/users` and `/feed` are live but posts and besteas aren't, the frontend merges the mock's `bestea`, `besteas`, `past_orders`, and posts into your responses. A profile that includes `bestea` turns that off. Your `PATCH /users` currently answers 422 for `"past_orders"` in `visible_stats`, so the frontend retries without it and keeps that one choice in the browser.
  - **Seed suggestion:** the mock seeds Sarah → Andrew as a pending bestea request, and Andrew and Hana as besteas with one notification ("Hana ordered Pearl Milk Tea at Sunright Tea Studio", 40 minutes ago). The same seed would keep the optional demo segment identical.
  - **Social client:** every social call now sends cookies (`credentials: "include"`), so `/posts` and `/notifications` can read the session.
- **For Andrew, about the customer/store choice (FYI, already handled in the frontend).** With `tealink.role = "store"`, Home, Stats, and Profile redirected to `/shop`, but TeaLink, Discover, and the explainer pages still opened, and the customer tab bar stayed visible, so tabs looked broken. All customer routes now sit inside one `CustomerOnly` route in `App.tsx` that sends a store account to `/shop`, and `NavBar` hides the customer tabs whenever the role is store. A new visitor still opens TeaLink and Discover directly (the demo starts there); Home, Stats, and Profile still send them to `/welcome`. The per-page store checks in Home, Profile, and Stats are now redundant but harmless. Lint still flags a fast-refresh warning in `ShopLayout.tsx` because it exports `useShopCatalog` and `ShopPage` alongside the layout.
- **For Track A (UI round 2 fields, from Track B 7:40 PM).** The frontend already reads these, and its fallbacks hold until they're served:
  - `name` and `description` on selection payloads. Until then, the frontend uses its own "you"-worded descriptions.
  - `round` and `revised_from` on objections, and `decided_by` and `rounds` on the decision. Missing values read as round 1 and "the arbiter decided."
  - `match` on `GET /drinks` and `GET /shops`. Until then, Discover computes taste similarity in the browser.
  - `card_color` on `PATCH /users` and `UserProfile`. It's already sent, but `ProfilePatch` drops it, so for now the color is saved in that browser only.
- **For Track A (small, optional): let `PATCH /users/{ref}` take a cover.** Track B has six placeholder covers (`pearls`, `leaves`, `swirl`, `fruit`, `matcha`, `lineup`). Until `cover_url` is patchable, a chosen cover is saved only in that browser, and other viewers see a default based on the user's top flavor. If `PATCH` accepts `cover_url` as one of those ids (or a URL later), the frontend will use it with no other change.

- **Quiz flavors now reach `top_notes`.** A user with no reviews keeps the flavors they picked, in that order. Fruity, Floral, and Matcha come back as `["fruit", "jasmine", "matcha"]` instead of notes inferred from matching drinks.

- **AGNTCY reset heartbeat is fixed.** Bus heartbeats now update whichever runtime is serving requests, so Reset demo no longer lets the new registry time out. Local mode was already fine.
- **Setup note:** AGNTCY mode needs `pip install -e ".[dev,bus]"`. Without the `bus` extra, `make agents` exits with "agntcy-app-sdk is not installed", and the API quietly runs in-process.
- **Sarah is Andrew's top match again.** Her seeded reviews follow his milky, low-fruit orders, plus Hojicha Cream Tea at 5/5. Hana is second.
- **The candidate pool is small** (about 11 drinks per round), so sold-out drinks eventually run the pool dry. The evaluation stops at 8 rounds for this reason.
- **Wintermelon Tea** (69% taste match) often lands in the top 3 because Andrew's history makes price matter a lot. It's explainable, but check that it reads well in the demo.
- `RecommendationCard.tsx` is no longer used by Discover. Delete it once nobody needs it.
- **Live picks live in memory.** Restarting the API, or pressing "Reset demo", goes back to the seeded history. That's intentional, so the demo can be repeated.

## Plan change log

- **1:20 AM:** Track B finished the eight profile-layout rows from 12:55 AM. Details are in the Done section above. Track A's photo and rec routes from 1:10 AM are on main, and the frontend uses them.
- **Evening:** Track A on `a/dialogue`: second-person selection copy, the round-2 contract fields, and `DELIBERATION=dialogue|single` (default `single`). Single-mode demo numbers are unchanged. Dialogue top-3 numbers are in the Track A section above. Track B: mirror the seam before editing `types.ts`, and update `demo-script.md` from the dialogue table. `options[2]` of the dialogue opening is Osmanthus Oolong, not Pearl.
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
