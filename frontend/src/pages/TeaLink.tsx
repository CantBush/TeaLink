import { useEffect } from "react";
import { AgentTimeline } from "../components/AgentTimeline.tsx";
import { PriorityBars } from "../components/PriorityBars.tsx";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
import { LeafPair, Sprout } from "../components/Doodles.tsx";
import { TopChoices } from "../components/TopChoices.tsx";
import { matchPercent } from "../lib/format.ts";
import { loadProfile, pick, startRecommendation, useSession } from "../state/session.ts";

export function TeaLink() {
  const session = useSession();
  const { userId, started } = session;

  useEffect(() => {
    if (!started) startRecommendation();
    loadProfile(userId);
  }, [userId, started]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6 sm:py-8">
      <TeaLinkTabs />
      <div className="min-w-0 space-y-6">
        <TopChoices
          name={session.name}
          decision={session.decision}
          running={session.running}
          onPick={(option) => void pick(option.drink_id, option.drink_name)}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <PriorityBars
            name={session.name}
            weights={session.weights}
            summary={session.preferenceSummary}
            learned={session.learned}
          />
          <section id="taste" className="min-w-0 scroll-mt-24 rounded-[28px] border border-line bg-foam p-6">
            <h2 className="flex items-center gap-2 font-display text-2xl leading-none"><Sprout className="h-6 w-6 shrink-0 text-moss" />my taste</h2>
            <p className="mt-2 mb-4 text-sm text-mute">From {session.name}'s reviews and quiz answers.</p>
            <TasteBars profile={session.profile} />
          </section>
        </div>

        <section className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="flex items-center gap-2 font-display text-2xl leading-none"><LeafPair className="h-6 w-6 shrink-0 text-moss" />people with your taste</h2>
          {session.similar.length === 0 ? (
            <p className="mt-3 text-sm text-mute">Finding people with similar taste…</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {session.similar.map((friend) => (
                <li
                  key={friend.id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl bg-mist px-4 py-3"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sage font-display text-lg">
                    {friend.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{friend.name}</span>
                    <span className="text-sm text-mute">{matchPercent(friend.similarity)}% similar</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AgentTimeline
          name={session.name}
          events={session.events}
          usingMock={session.usingMock}
          started={session.started}
          health={session.health}
          busAgents={session.busAgents}
        />
      </div>
    </main>
  );
}
