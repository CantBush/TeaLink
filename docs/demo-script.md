# TeaLink demo script (3 minutes)

*Owner: Track B. The numbers below come from a real run of this exact sequence over AGNTCY on Sat 2:25 PM, after Track A's re-seed (Sarah as Andrew's closest match). In-process mode gives identical results. If the seed data or the agents change, re-run the sequence and update the numbers. Lines in quotes are what the presenter says.*

## Before you start

- **Run on AGNTCY:** start NATS (`make bus`, or `nats-server -p 4222`), then `TRANSPORT=agntcy make agents`, `TRANSPORT=agntcy make api`, and `make web`. Open http://localhost:5173 and check that the timeline header says **"AGNTCY · 10 agents over NATS"**. If it says "In-process fallback", the bus isn't answering. The demo still works, but skip the AGNTCY line at the end.
- Press **Reset demo** on Discover before every run. It works in both AGNTCY and local mode.
- Have a second tab on `/evidence`.
- Backup: if the API dies, the frontend replays a saved real round, labelled "Saved round" on the timeline. Explain the flow over the saved round, and switch to the backup video for the adaptation part.

## 0:00 to 0:20: the problem

> "Picking boba sounds simple, but you're trading off things that pull in different directions: what you usually like, what people like you love, trying something new, and price. TeaLink gives each of those to its own AI agent, lets them argue, and learns which ones *you* actually care about."

## 0:20 to 0:55: one round, with real disagreement

On Discover, point at the **At the counter** timeline, top to bottom:

1. **Team selected:** "The concierge picks agents by capability, and you can open this to see why each one was chosen. Each agent is its own process. The badge up here shows all of them answered over Cisco's AGNTCY, A2A on a NATS bus. Note that Lantern Leaf has no agent yet."
2. **Andrew's priorities:** "From his last 4 orders, the Preference agent thinks price matters most to him (43%), then taste (41%)."
3. **Each agent proposes:** "Taste wants Brown Sugar Oolong, a 96% match. Social proposes Hojicha Cream Tea because Sarah, whose taste is almost identical to Andrew's, rated it 5 out of 5. Budget wants the cheapest drinks that still fit. Explorer wants drinks he's never had."
4. **They argue:** "Then every agent scores *every* candidate on its own objective. Explorer pushes back on drinks he's already had; Budget pushes back on the $6.50-and-up ones. Only the shop agents know inventory."
5. **Ruled out:** "Lantern Leaf's drinks are ruled out, because no shop agent is online to confirm they're in stock."

Point at the top 3: **Thai Tea 78, Wintermelon Tea 77, Pearl Milk Tea 71**, with the close-call box.

> "Thai Tea and Wintermelon are too close to call, so instead of guessing, the team asks Andrew. And it says why: Thai Tea wins on taste and on what people like him rate highly; Wintermelon wins on price and on being new."

## 0:55 to 1:20: it learns from the pick

Click **Pick this** on **Pearl Milk Tea** (#3).

> "He skipped both and took the best taste match. The Preference agent learns from that: taste now counts 45% (it was 41%) and price drops to 36%. Pearl Milk Tea climbs from 71 to 73. Every pick from the top 3 is a training signal."

Point at **What Andrew cares about**, where the change since the last pick is shown next to each priority.

## 1:20 to 2:15: the world changes, and the team re-plans

Each button starts a fresh deliberation. After each one, point at the new top 3 and the timeline.

1. **#1 sells out** (Thai Tea).
   > "Kung Fu Tea's agent vetoes it, 'Thai Tea is sold out at Kung Fu Tea Co.', and the team re-ranks: Wintermelon, Pearl, Thai Milk Tea from another shop. Wintermelon and Pearl are within two points, so it's a close call again, and the team asks rather than guesses."
2. **Lantern Leaf joins.**
   > "A new shop registers its agent partway through the session. Its $4.95 Brown Sugar Hojicha Milk was invisible a second ago; now it's #1 at 81, with Lantern Leaf's Osmanthus Milk Tea right behind it."
3. **I don't like brown sugar.**
   > "New information from the user. Brown Sugar Hojicha drops out of the top 3, and Osmanthus Milk Tea moves up to #1, in a dead heat with Wintermelon at 75."
   Click **What changed** in the nav: "Before and after: what moved, what left and why, and notice his priorities didn't change. The world changed, not his taste."
4. **#1's shop goes offline** (Lantern Leaf).
   > "The shop that just joined drops off the network. Its agent stops responding, so its drinks are ruled out. Nobody can confirm they're in stock, and we never recommend something we can't confirm. The team falls back to Wintermelon, Pearl, and Thai Milk Tea."

## 2:15 to 2:45: why should you trust it

Open **Why this order?** on the top drink.

> "Nothing here is a black box. Each agent's score, times Andrew's learned weight, adds up to the final number. The numbers are computed in code; an LLM never makes up a score."

Switch to the **Evidence** tab.

> "We tested this against simpler baselines. Three simulated users with hidden priorities each made 8 picks. A hit means the recommender's #1 was that user's true favorite drink, which it never gets to see. Learning hit 7 of 24, fixed priorities 5, and just recommending the most popular drink 2. It also re-suggested drinks they'd already tried half as often. The loyalist's learned priorities land almost exactly on the hidden ones: taste 66% vs 70%."

*Be honest if asked: the sample is small, and for the price hunter and the explorer the learned weights are moving in the right direction but haven't converged in 8 picks (price 37% vs 55%, novelty 29% vs 50%).*

## 2:45 to 3:00: close

> "Agents with competing objectives, real-time adaptation when shops sell out, join, or go offline, a human in the loop when it's close, and a team that learns who you are. That's TeaLink."

AGNTCY passed its go/no-go. If the badge showed AGNTCY, add: "Every agent is a separate service talking A2A over NATS on Cisco's AGNTCY, and if the bus goes down, the same agents answer in-process, so the demo never breaks."

## Likely judge questions

- **"Why not let one LLM decide?"** One model hides the trade-off. Separate agents make the disagreement visible and auditable, and the shop agents hold information nobody else has (inventory).
- **"How does it learn?"** Each pick from the top 3 is compared with the drinks passed over. Weight moves toward the priorities where the pick scored higher. A minimum weight of 5% means no priority is ever ignored completely.
- **"What if everything is ruled out?"** The team says so and asks the user instead of recommending something unavailable.
- **"What's the human-in-the-loop rule?"** If the top two are within 0.02, or nothing survives, the team asks.

## Dry runs

| # | When | Who | Time | Notes |
|---|---|---|---|---|
| 0 | Sat 2:30 PM | Track B, technical click-through over AGNTCY | n/a | Every step matched. Added the two close-call lines, and replaced raw shop ids ("lantern_leaf") with names in the ruled-out reasons |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
