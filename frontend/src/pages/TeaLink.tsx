import { useEffect } from "react";
import { AgentTimeline } from "../components/AgentTimeline.tsx";
import { ControlPanel } from "../components/ControlPanel.tsx";
import { PriorityBars } from "../components/PriorityBars.tsx";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
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
    <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:py-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <TeaLinkTabs />
      <div className="space-y-6">
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
          <section id="taste" className="scroll-mt-24 rounded-[28px] border border-line bg-foam p-6">
            <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">My taste</p>
            <p className="mt-2 mb-4 text-sm text-mute">From {session.name}'s reviews and quiz answers.</p>
            <TasteBars profile={session.profile} />
          </section>
        </div>

        <section className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-2xl">People with your taste</h2>
          {session.similar.length === 0 ? (
            <p className="mt-3 text-sm text-mute">Finding people with similar taste…</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {session.similar.map((friend) => (
                <li
                  key={friend.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-cream px-4 py-3"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f0e2d0] font-display text-lg">
                    {friend.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block font-semibold">{friend.name}</span>
                    <span className="text-sm text-mute">{matchPercent(friend.similarity)}% similar</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ControlPanel decision={session.decision} running={session.running} />
      </div>

      <AgentTimeline
        name={session.name}
        events={session.events}
        usingMock={session.usingMock}
        started={session.started}
        health={session.health}
        busAgents={session.busAgents}
      />
    </main>
  );
}
