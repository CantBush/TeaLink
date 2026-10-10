import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { social } from "../api/social.ts";
import type { FeedItem } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BobaStatsGrid } from "../components/BobaStats.tsx";
import { EditProfile } from "../components/EditProfile.tsx";
import { FeedCard } from "../components/FeedCard.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { drinkInfo } from "../lib/catalog.ts";
import { matchPercent, price, shopLabel } from "../lib/format.ts";
import { ALL_STATS } from "../lib/stats.ts";
import { useMe } from "../state/me.ts";
import { profilesChanged, useProfile } from "../state/social.ts";

function Count({ value, label }: { value: number; label: string }) {
  return (
    <p className="text-center">
      <span className="block font-display text-2xl leading-none">{value}</span>
      <span className="text-xs font-semibold text-mute">{value === 1 ? label.replace(/s$/, "") : label}</span>
    </p>
  );
}

/** `/me` → your own profile. */
export function MyProfile() {
  const { profile } = useProfile();
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-sm text-mute">Loading your profile…</main>;
  return <Navigate to={`/u/${profile.handle}`} replace />;
}

export function Profile() {
  const { handle = "" } = useParams();
  const me = useMe();
  const { profile, error } = useProfile(handle);
  const [posts, setPosts] = useState<{ key: string; items: FeedItem[] }>({ key: "", items: [] });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${handle}:${me}`;
    social
      .getUserFeed(handle, me)
      .then((items) => {
        if (!cancelled) setPosts({ key, items });
      })
      .catch(() => {
        if (!cancelled) setPosts({ key, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, me, profile]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-8">
        <p className="rounded-[28px] border border-line bg-foam p-6">{error}</p>
        <Link to="/home" className="text-sm font-semibold text-amber">
          Back to Home
        </Link>
      </main>
    );
  }
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-sm text-mute">Loading profile…</main>;

  const own = profile.user_id === me;
  const pinned = drinkInfo(profile.pinned_drink_id);
  const reviews = posts.key === `${handle}:${me}` ? posts.items : [];
  const hiddenCount = own ? ALL_STATS.length - profile.visible_stats.length : 0;

  const toggleFollow = () => {
    setBusy(true);
    social
      .follow(profile.user_id, me, !profile.followed_by_me)
      .then(() => profilesChanged())
      .finally(() => setBusy(false));
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-5 sm:py-8">
      <PreviewNote />

      <section className="overflow-hidden rounded-[32px] border border-line bg-foam">
        <div className="h-24 sm:h-32" style={{ background: `linear-gradient(120deg, ${profile.accent}, ${profile.avatar.color})` }} />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <Avatar avatar={profile.avatar} size="xl" ring={profile.accent} />
            <div className="flex gap-2 pb-1">
              {own ? (
                <>
                  <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-foam">
                    Edit profile
                  </button>
                  <Link to="/welcome" className="rounded-full border border-line px-4 py-2 text-sm font-semibold">
                    Retake quiz
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={busy}
                  className={`rounded-full px-5 py-2 text-sm font-semibold ${
                    profile.followed_by_me ? "border border-line text-ink" : "text-foam"
                  }`}
                  style={profile.followed_by_me ? undefined : { background: profile.accent }}
                >
                  {profile.followed_by_me ? "Following" : "Follow"}
                </button>
              )}
            </div>
          </div>

          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{profile.display_name}</h1>
          <p className="text-sm text-mute">@{profile.handle}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.stats.personality ? (
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-foam" style={{ background: profile.accent }}>
                {profile.stats.personality}
              </span>
            ) : null}
            {profile.taste_match !== null ? (
              <span className="rounded-full bg-[#f0e2d0] px-3 py-1 text-xs font-semibold">
                {matchPercent(profile.taste_match)}% taste match with you
              </span>
            ) : null}
          </div>
          {profile.bio ? <p className="mt-3 max-w-prose">{profile.bio}</p> : null}

          <div className="mt-5 grid grid-cols-3 rounded-2xl bg-cream py-3">
            <Count value={reviews.filter((item) => item.kind === "review").length} label="reviews" />
            <Count value={profile.followers} label="followers" />
            <Count value={profile.following} label="following" />
          </div>
        </div>
      </section>

      {pinned || profile.pinned_shop_id ? (
        <section className="flex items-center gap-4 rounded-[28px] border border-line bg-foam p-5">
          <span className="text-3xl" aria-hidden>
            📌
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">Go-to order</p>
            {pinned ? (
              <p className="font-display text-xl leading-tight">
                {pinned.name} <span className="font-sans text-sm text-mute">{price(pinned.price)}</span>
              </p>
            ) : null}
            <p className="text-sm text-mute">{shopLabel(profile.pinned_shop_id ?? pinned?.shop_id ?? "")}</p>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Boba stats</h2>
          {own && hiddenCount > 0 ? <p className="text-xs text-mute">{hiddenCount} hidden from others</p> : null}
        </div>
        <BobaStatsGrid stats={profile.stats} order={profile.visible_stats} accent={profile.accent} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl">Reviews</h2>
        {reviews.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-mute">
            {own ? "Pick a drink on Discover and it shows up here." : "Nothing posted yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {editing ? <EditProfile profile={profile} onClose={() => setEditing(false)} /> : null}
    </main>
  );
}
