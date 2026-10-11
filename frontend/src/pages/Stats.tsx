import { Sprout } from "../components/Doodles.tsx";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { BobaCard } from "../components/BobaCard.tsx";
import { EditProfile } from "../components/EditProfile.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { StatsReceipt } from "../components/StatsReceipt.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
import { CARD_COLORS, cardColor, setCardColor } from "../lib/cardColor.ts";
import { ALL_STATS, shownStats } from "../lib/stats.ts";
import { isSignedIn } from "../state/account.ts";
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
  if (!isSignedIn()) return <Navigate to="/welcome" replace />;
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-mute">Loading your stats…</main>;

  const visible = shownStats(profile.visible_stats);
  const color = cardColor(profile);
  const hidden = ALL_STATS.filter((key) => !visible.includes(key));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-6 sm:py-8">
      <PreviewNote />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-display text-4xl">
            Your stats
            <Sprout className="h-8 w-8 text-moss" />
          </h1>
          <p className="mt-1 text-mute">Updated every time you rate a drink.</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-foam">
          Choose what's public
        </button>
      </header>

      <div className="grid items-start gap-8 md:grid-cols-2">
        <section aria-label="Boba card" className="mx-auto w-full max-w-sm">
          <BobaCard
            name={profile.display_name}
            handle={profile.handle}
            avatar={profile.avatar}
            accent={profile.accent}
            color={color}
            stats={profile.stats}
          />
          <div className="mt-5">
            <p className="text-center text-xs tracking-[0.14em] text-mute">card color</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Card color">
              {CARD_COLORS.map((swatch) => (
                <button
                  key={swatch.color}
                  type="button"
                  role="radio"
                  aria-checked={swatch.color === color}
                  aria-label={swatch.name}
                  title={swatch.name}
                  onClick={() => setCardColor(profile.user_id, swatch.color)}
                  className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                    swatch.color === color ? "ring-2 ring-ink ring-offset-2 ring-offset-cream" : ""
                  }`}
                  style={{ background: swatch.color }}
                />
              ))}
              <label
                className="relative grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-dashed border-ink/40 text-sm text-mute transition-transform hover:scale-110"
                title="Pick any color"
              >
                +
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setCardColor(profile.user_id, event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick any card color"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl">your receipt</h2>
            <p className="text-sm text-mute">
              {visible.length} on your profile{hidden.length ? `, ${hidden.length} only you can see` : ""}
            </p>
          </div>
          <StatsReceipt stats={profile.stats} order={[...visible, ...hidden]} hidden={hidden} />
        </section>
      </div>

      <section className="rounded-[28px] border border-line bg-foam p-6">
        <h2 className="font-display text-2xl">Your taste profile</h2>
        <p className="mt-1 mb-5 text-[15px] text-mute">
          What the Taste agent scores drinks against for you. It shifts every time you rate a drink.
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
