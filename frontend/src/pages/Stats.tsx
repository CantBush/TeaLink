import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BobaCard } from "../components/BobaCard.tsx";
import { BobaStatsGrid } from "../components/BobaStats.tsx";
import { EditProfile } from "../components/EditProfile.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
import { ALL_STATS } from "../lib/stats.ts";
import { hasChosenAccount } from "../state/me.ts";
import { useRole } from "../state/role.ts";
import { loadProfile, useSession } from "../state/session.ts";
import { useProfile } from "../state/social.ts";

/** Your own numbers: the shareable card, every stat (public or not), and the taste profile the agents use. */
export function Stats() {
  const role = useRole();
  const { profile } = useProfile();
  const session = useSession();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadProfile(session.userId);
  }, [session.userId]);

  if (role === "store") return <Navigate to="/shop" replace />;
  if (!hasChosenAccount()) return <Navigate to="/welcome" replace />;
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-mute">Loading your stats…</main>;

  const visible = profile.visible_stats;
  const hidden = ALL_STATS.filter((key) => !visible.includes(key));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-6 sm:py-8">
      <PreviewNote />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Your stats</h1>
          <p className="mt-1 text-mute">Updated every time you rate a drink.</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-foam">
          Choose what's public
        </button>
      </header>

      <section aria-label="Boba card" className="mx-auto max-w-sm">
        <BobaCard
          name={profile.display_name}
          handle={profile.handle}
          avatar={profile.avatar}
          accent={profile.accent}
          stats={profile.stats}
        />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">All stats</h2>
          <p className="text-sm text-mute">
            {visible.length} on your profile{hidden.length ? `, ${hidden.length} only you can see` : ""}
          </p>
        </div>
        <BobaStatsGrid stats={profile.stats} order={[...visible, ...hidden]} accent={profile.accent} hidden={hidden} />
      </section>

      <section className="rounded-[28px] border border-line bg-foam p-6">
        <h2 className="font-display text-2xl">Your taste profile</h2>
        <p className="mt-1 mb-5 text-[15px] text-mute">
          What the Taste agent scores drinks against. It shifts as you rate drinks.
        </p>
        <TasteBars profile={session.profile} />
      </section>

      <p className="text-center text-[15px] text-mute">
        Want today's picks from these numbers?{" "}
        <Link to="/" className="font-semibold text-moss">
          Open TeaLink
        </Link>
      </p>

      {editing ? <EditProfile profile={profile} onClose={() => setEditing(false)} /> : null}
    </main>
  );
}
