# TeaLink demo script (3 minutes)

*Owner: Track B. The numbers below come from a real run of this exact sequence over AGNTCY on Sat 2:25 PM, after Track A's re-seed (Sarah as Andrew's closest match). In-process mode gives identical results. If the seed data or the agents change, re-run the sequence and update the numbers. Lines in quotes are what the presenter says.*

## Before you start

- **Run on AGNTCY:** start NATS (`make bus`, or `nats-server -p 4222`), then `TRANSPORT=agntcy make agents`, `TRANSPORT=agntcy make api`, and `make web`. Open http://localhost:5173 and check that the badge next to **the team** on **at the counter** says **"AGNTCY · 10 agents over NATS"**. If it says "In-process fallback", the bus isn't answering. The demo still works, but skip the AGNTCY line at the end.
- **Sign in first.** The app shows only the sign-in page until you have an account. On `/welcome`, click **Customer: Andrew** under "demo accounts" (or type `andrew@tealink.demo`, password `boba`). Don't sign up a fresh account for the demo: the numbers below are Andrew's.
- Press **Reset demo** on the **at the counter** sub-tab (`/counter`) before every run. Reset clears menu edits, discount rules, orders, and sold-out marks, but keeps accounts, so you stay signed in. It works in both AGNTCY and local mode. The TeaLink tab has four sub-tabs: **today's picks** (the top 3), **at the counter** (the agents' chat and the what-if buttons), **why this order**, and **evidence**.
- Have a second tab on `/evidence`.
- Backup: if the API dies, the frontend replays a saved real round, labelled "Saved round" next to the team. Explain the flow over the saved round, and switch to the backup video for the adaptation part.

## 0:00 to 0:20: the problem

> "Picking boba sounds simple, but you're trading off things that pull in different directions: what you usually like, what people like you love, trying something new, and price. TeaLink gives each of those to its own AI agent, lets them argue, and learns which ones *you* actually care about."

## 0:20 to 0:55: one round, with real disagreement

Start on **at the counter** and go top to bottom:

1. **The team:** "The concierge picks agents by capability. Each icon is one agent, and every shop agent gets the same storefront icon." Tap **Taste** to show its description, then tap it again to close it. "Each agent is its own process. The green dots and this badge show all of them answered over Cisco's AGNTCY, A2A on a NATS bus. Note that Lantern Leaf has no agent yet."
2. **They argue, Preference's first message:** "From his last 4 orders, the Preference agent thinks price matters most to him (43%), then taste (41%)."
3. **Opening picks:** "Taste wants Brown Sugar Oolong, a 96% match. Social proposes Hojicha Cream Tea because Sarah, whose taste is almost identical to Andrew's, rated it 5 out of 5. Budget wants the cheapest drinks that still fit. Explorer wants drinks he's never had."
4. **Round 1:** "Then every agent scores *every* drink on the shortlist by its own objective. Explorer pushes back on drinks he's already had; Budget pushes back on the $6.50-and-up ones. Only the shop agents know what's in stock."
5. **Ruled out:** "Lantern Leaf's drinks are ruled out, because no shop agent is online to confirm they're in stock."
6. **The arbiter decided:** "In this mode the agents get one round, and then the arbiter weighs their scores by Andrew's priorities. It's too close to call, so it hands the choice to him."

Switch to **today's picks** and point at the top 3: **Thai Tea 78% match, Wintermelon Tea 77% match, Pearl Milk Tea 71% match**, with the close-call box. The scores are unchanged.

> "Thai Tea and Wintermelon are too close to call, so instead of guessing, the team asks Andrew. And it says why: Thai Tea wins on taste and on what people like him rate highly; Wintermelon wins on price and on being new."

## 0:55 to 1:20: it learns from the order

Click **Order for pickup** on **Pearl Milk Tea** (#3), then **Place order** (pay at pickup is already selected) and **Done**.

> "He skipped both and ordered the best taste match. The order is the pick: the Preference agent learns from it, so taste now counts 45% (it was 41%) and price drops to 36%. Pearl Milk Tea climbs from 71 to 73. Every order from the top 3 is a training signal, and it stays private: nothing gets posted to his profile."

Switch to **at the counter**: the chat now opens with "You ordered Pearl Milk Tea", and Preference's message shows the new priorities.

## 1:20 to 2:15: the world changes, and the team re-plans

The what-if buttons are at the top of **at the counter**. Each one starts a fresh round. After each one, point at the black note at the top of the chat, the new messages, and the decision at the bottom. Flip to **today's picks** for the new top 3 when it helps.

1. **#1 sells out** (Thai Tea).
   > "Kung Fu Tea's agent vetoes it in the chat, 'Thai Tea is sold out at Kung Fu Tea Co.', and the team re-ranks: Wintermelon, Pearl, Thai Milk Tea from another shop. Wintermelon and Pearl are within two points, so it's a close call again, and the team asks rather than guesses."
2. **Lantern Leaf joins.**
   > "A new shop registers its agent partway through the session. Its $4.95 Brown Sugar Hojicha Milk was invisible a second ago; now it's #1 at 81, with Lantern Leaf's Osmanthus Milk Tea right behind it."
3. **I don't like brown sugar.**
   > "New information from the user. Brown Sugar Hojicha drops out of the top 3, and Osmanthus Milk Tea moves up to #1, in a dead heat with Wintermelon at 75."
   Point at Preference's message in the chat: "Notice his priorities didn't change. The world changed, not his taste."
4. **#1's shop goes offline** (Lantern Leaf).
   > "The shop that just joined drops off the network. Its agent stops responding, so its drinks are ruled out. Nobody can confirm they're in stock, and we never recommend something we can't confirm. The team falls back to Wintermelon, Pearl, and Thai Milk Tea."

## 2:15 to 2:45: why should you trust it

Open the **why this order** sub-tab.

> "Nothing here is a black box. Each agent's score, times Andrew's learned weight, adds up to the final number. The numbers are computed in code; an LLM never makes up a score."

Switch to the **evidence** sub-tab.

> "We tested this against simpler baselines. Three simulated users with hidden priorities each made 8 picks. A hit means the recommender's #1 was that user's true favorite drink, which it never gets to see. Learning hit 7 of 24, fixed priorities 5, and just recommending the most popular drink 2. It also re-suggested drinks they'd already tried half as often. The loyalist's learned priorities land almost exactly on the hidden ones: taste 66% vs 70%."

*Be honest if asked: the sample is small, and for the price hunter and the explorer the learned weights are moving in the right direction but haven't converged in 8 picks (price 37% vs 55%, novelty 29% vs 50%).*

## 2:45 to 3:00: close

> "Agents with competing objectives, real-time adaptation when shops sell out, join, or go offline, a human in the loop when it's close, and a team that learns who you are. That's TeaLink."

AGNTCY passed its go/no-go. If the badge showed AGNTCY, add: "Every agent is a separate service talking A2A over NATS on Cisco's AGNTCY, and if the bus goes down, the same agents answer in-process, so the demo never breaks."

## Optional, if there's time: agents that fail, get traced, and get challenged (about 30 seconds)

Do this after the close, or if a judge asks about failure or observability. Press **Reset demo** first, so the round opens at Thai Tea 78. Everything here is off by default.

1. **Kill an agent.** In **the team** on **at the counter**, tap **Budget**, then **Stop Budget**. Its icon greys out with a slash.
   > "Agents fail. Budget just dropped out, and the team re-plans without it. The arbiter spreads Budget's 43% over the others and says so, and the decision is marked 'without budget'. Pearl Milk Tea, the best taste match, is now #1 at 86."
   Tap **Budget** again, then **Bring Budget back**: Thai Tea is back at 78.
2. **The Critic.** Flip the **Critic** switch under the what-if buttons.
   > "Before the pick is final, a Critic looks for its weakest point: Wintermelon beats Thai Tea on price, 90 to 70. The arbiter has to answer, and here it agrees it's too close to call, so Andrew decides." Flip the switch off again.
3. **The trace.** Open **evidence** and scroll to **inside the last round**.
   > "Every round is traced: how long each phase took, and which agents answered over Cisco's AGNTCY bus. Here all ten did, and the whole round took about a fifth of a second."

## Optional, if there's time: besteas, the shop side, and checkout (about 40 seconds)

Only do this after the close, or if a judge asks how shops fit in. It comes after every number above, so it can't change them.

1. Click the **bell** in the header: "Hana is Andrew's bestea, so he hears when she orders, and Sarah has asked to be one too." Click **Accept** on Sarah's request. Her profile now says **besteas ♥**.
2. On **Discover**, open Hojicha Cream Tea (Sunright Tea Studio) and click **Order for pickup**. Choose pearls and **Place order**. "Checkout shows the price, any close-call offer, and the pickup fee. Card payments go through Stripe on the server; the browser never sees a key. An order from outside his top 3 nudges his taste profile but not his priorities, because there's nothing passed over to compare it with."
3. **Log out**, then click **Shop: Sunright Tea Studio**. Open **Orders**: both orders are there. Click **Accept**, **Mark ready**, **Picked up** on one.
4. Open **Offers**: "The four platform rules are locked, so a shop can never buy a win outside a close call. Shops can only narrow when an offer goes out, for example weekdays only."
5. Open **Demand** and toggle **past year**: "Shops see taste trends, anonymized, with groups under 5 people hidden."

## Likely judge questions

- **"Why not let one LLM decide?"** One model hides the trade-off. Separate agents make the disagreement visible and auditable, and the shop agents hold information nobody else has (inventory).
- **"How does it learn?"** Each order from the top 3 is compared with the drinks passed over. Weight moves toward the priorities where the pick scored higher. A minimum weight of 5% means no priority is ever ignored completely.
- **"What if everything is ruled out?"** The team says so and asks the user instead of recommending something unavailable.
- **"What's the human-in-the-loop rule?"** If the top two are within 0.02, or nothing survives, the team asks.
- **"What happens when an agent fails?"** The team re-plans without it, and the arbiter says what it decided without. A missing agent never blocks a round. Stopping a shop agent rules out its drinks, because nobody can confirm stock. Be honest: stopping a core agent like Budget is done in the browser until the server's stop route lands.
- **"How do you know which agents are trustworthy?"** Only a shop's own agent can confirm its stock, and a drink with no confirming agent is dropped. Signed identities, so a fake shop agent gets rejected, are next on the plan, not built yet.
- **"Is the team discovered or hard-coded?"** The concierge picks agents by capability from their agent cards, and a new shop agent joins mid-session (Lantern Leaf). Publishing the cards to an AGNTCY directory is planned, not built yet.
- **"Can you see what the agents are doing?"** Yes: the evidence page traces each round, including which agents answered over AGNTCY and which fell back to in-process. Per-agent latency and retries appear once the API serves its trace.
- **"Isn't the Critic just another scorer?"** It doesn't score. It argues against the #1 using the runner-up's strongest point, and the arbiter has to answer. Today it runs in the browser on the arbiter's real scores; the server-side Critic agent is planned.
- **"Can a shop pay to win?"** No. An offer only goes out in a close call that passes the four locked platform rules, it's capped at 10% or $1, it's computed in code, and it's labelled on the card. A shop's own rules can only make offers rarer.

## Dry runs

| # | When | Who | Time | Notes |
|---|---|---|---|---|
| 0 | Sat 2:30 PM | Track B, technical click-through over AGNTCY | n/a | Every step matched. Added the two close-call lines, and replaced raw shop ids ("lantern_leaf") with names in the ruled-out reasons |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
