import { useEffect } from "react";
import { AgentTimeline } from "../components/AgentTimeline.tsx";
import { ControlPanel } from "../components/ControlPanel.tsx";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { loadProfile, startRecommendation, toggleAgent, useSession } from "../state/session.ts";

/** At the counter: the agents, their conversation about your order, and the what-if buttons. */
export function Counter() {
  const session = useSession();
  const { userId, started } = session;

  useEffect(() => {
    if (!started) startRecommendation();
    loadProfile(userId);
  }, [userId, started]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-6 sm:py-8">
      <TeaLinkTabs />
      <header>
        <h1 className="font-display text-4xl leading-none">at the counter</h1>
        <p className="mt-2 text-mute">The agents talk through your order here. Change something and watch them re-plan.</p>
      </header>
      <ControlPanel decision={session.decision} running={session.running} />
      <AgentTimeline
        events={session.events}
        usingMock={session.usingMock}
        started={session.started}
        health={session.health}
        busAgents={session.busAgents}
        stopped={session.stopped}
        onToggleAgent={toggleAgent}
      />
    </main>
  );
}
