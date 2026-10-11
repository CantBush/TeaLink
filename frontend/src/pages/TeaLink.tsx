import { useEffect } from "react";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { TopChoices } from "../components/TopChoices.tsx";
import { loadProfile, startRecommendation, useSession } from "../state/session.ts";

/** Today's picks: only the top 3. The agents' story is on the at the counter sub-tab. */
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
      <TopChoices decision={session.decision} running={session.running} />
    </main>
  );
}
