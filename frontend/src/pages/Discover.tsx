import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentTimeline } from "../components/AgentTimeline.tsx";
import { ControlPanel } from "../components/ControlPanel.tsx";
import { RecommendationCard } from "../components/RecommendationCard.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
import { matchPercent } from "../lib/format.ts";
import { loadProfile, startRecommendation, useSession } from "../state/session.ts";

const FRIENDS = [
  { name: "Sarah", match: 0.94, href: "/friends" },
  { name: "Mike", match: 0.91, href: null },
];

export function Discover() {
  const session = useSession();
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    startRecommendation();
    loadProfile("andrew");
  }, []);

  const decision = session.decision;
  const options = decision
    ? [
        {
          drink_id: decision.drink_id,
          drink_name: decision.drink_name,
          score: decision.score,
          shop_id: decision.shop_id,
        },
        ...decision.alternatives.map((drink) => ({
          drink_id: drink.drink_id,
          drink_name: drink.drink_name,
          score: drink.score,
          shop_id: decision.shop_id,
        })),
      ]
    : [];
  const featured = options[cursor] ?? options[0];
  const showingAlternative = Boolean(featured && decision && featured.drink_id !== decision.drink_id);

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <div className="space-y-6">
        <section id="taste" className="scroll-mt-24 rounded-[28px] border border-line bg-foam p-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">
            My taste
          </p>
          <h1 className="mt-2 font-display text-4xl">Andrew's usual</h1>
          <p className="mt-2 mb-5 max-w-lg text-mute">
            Sweet, extra milky, a real tea base, and toppings more often than fruit.
          </p>
          <TasteBars profile={session.profile} />
        </section>

        <RecommendationCard
          drinkName={featured?.drink_name ?? ""}
          score={featured?.score ?? 0}
          shopId={featured?.shop_id ?? "kungfu"}
          ready={Boolean(featured)}
          note={
            showingAlternative
              ? `Another drink from this round. The counter's pick is still ${decision?.drink_name}.`
              : undefined
          }
          onElse={() => {
            if (options.length < 2) return;
            setCursor((current) => (current + 1) % options.length);
          }}
        />

        <section className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-2xl">People with your taste</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FRIENDS.map((friend) => {
              const body = (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f0e2d0] font-display text-lg">
                    {friend.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block font-semibold">{friend.name}</span>
                    <span className="text-sm text-mute">
                      {matchPercent(friend.match)}% similar
                    </span>
                  </span>
                </>
              );
              return (
                <li key={friend.name}>
                  {friend.href ? (
                    <Link
                      to={friend.href}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-cream px-4 py-3"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-line bg-cream px-4 py-3">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <ControlPanel
          drinkId={featured?.drink_id ?? "brown-sugar-oolong"}
          drinkName={featured?.drink_name ?? "Brown Sugar Oolong Milk Tea"}
        />
      </div>

      <AgentTimeline
        events={session.events}
        usingMock={session.usingMock}
        started={session.started}
      />
    </main>
  );
}
