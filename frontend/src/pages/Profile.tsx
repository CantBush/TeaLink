import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { social } from "../api/social.ts";
import type { FeedItem } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { BobaStatsGrid } from "../components/BobaStats.tsx";
import { EditProfile } from "../components/EditProfile.tsx";
import { FeedCard } from "../components/FeedCard.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { SendRec } from "../components/SendRec.tsx";
import { drinkInfo } from "../lib/catalog.ts";
import { matchPercent, price, shopLabel } from "../lib/format.ts";
import { coverPhoto, drinkPhoto } from "../lib/images.ts";
import { tint } from "../lib/palette.ts";
import { ALL_STATS } from "../lib/stats.ts";
import { hasChosenAccount, useMe } from "../state/me.ts";
import { useRole } from "../state/role.ts";
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
  const role = useRole();
  if (role === "store") return <Navigate to="/shop" replace />;
  if (!hasChosenAccount()) return <Navigate to="/welcome" replace />;
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-sm text-mute">Loading your profile…</main>;
  return <Navigate to={`/u/${profile.handle}`} replace />;
}

export function Profile() {
  const { handle = "" } = useParams();
  const me = useMe();
  const { profile, error } = useProfile(handle);
  const [feed, setFeed] = useState<{ key: string; items: FeedItem[] }>({ key: "", items: [] });
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [recOpen, setRecOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${handle}:${me}`;
    social
      .getUserFeed(handle, me)
      .then((items) => {
        if (!cancelled) setFeed({ key, items });
      })
      .catch(() => {
        if (!cancelled) setFeed({ key, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, me, profile]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-5 py-8">
        <p className="rounded-[28px] border border-line bg-foam p-6">{error}</p>
        <Link to="/home" className="text-sm font-semibold text-moss">
          Back to Home
        </Link>
      </main>
    );
  }
  if (!profile) return <main className="mx-auto max-w-3xl px-5 py-8 text-sm text-mute">Loading profile…</main>;

  const own = profile.user_id === me;
  const pinned = drinkInfo(profile.pinned_drink_id);
  const reviews = feed.key === `${handle}:${me}` ? feed.items : [];
  const posts = reviews.filter((item) => item.drink_id);
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
        <img
          src={coverPhoto(profile)}
          alt=""
          className="h-28 w-full object-cover sm:h-40"
          style={{ background: tint(profile.accent) }}
        />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-12 flex items-end justify-between gap-3 sm:-mt-14">
            <Avatar avatar={profile.avatar} size="xl" ring={tint(profile.accent)} />
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
                <>
                  <button
                    type="button"
                    onClick={() => setRecOpen(true)}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold"
                  >
                    Send a rec
                  </button>
                  <button
                    type="button"
                    onClick={toggleFollow}
                    disabled={busy}
                    className={`rounded-full px-5 py-2 text-sm font-semibold ${
                      profile.followed_by_me ? "border border-line text-ink" : "text-foam"
                    }`}
                    style={profile.followed_by_me ? undefined : { background: tint(profile.accent) }}
                  >
                    {profile.followed_by_me ? "Following" : "Follow"}
                  </button>
                </>
              )}
            </div>
          </div>

          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{profile.display_name}</h1>
          <p className="text-sm text-mute">@{profile.handle}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.stats.personality ? (
              <span className="rounded-full px-3 py-1 text-xs font-semibold text-foam" style={{ background: tint(profile.accent) }}>
                {profile.stats.personality}
              </span>
            ) : null}
            {profile.taste_match !== null ? (
              <span className="rounded-full bg-sage px-3 py-1 text-xs font-semibold">
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
            {pinned ? <p className="text-sm text-mute">{shopLabel(pinned.shop_id)}</p> : null}
            {profile.pinned_shop_id && profile.pinned_shop_id !== pinned?.shop_id ? (
              <p className={pinned ? "mt-1 text-sm" : "font-display text-xl leading-tight"}>
                {pinned ? "Favorite spot: " : ""}
                {shopLabel(profile.pinned_shop_id)}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-2xl">{own ? "Highlights" : "Boba stats"}</h2>
          {own ? (
            <Link to="/stats" className="text-sm font-semibold text-moss">
              All stats{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
            </Link>
          ) : null}
        </div>
        <BobaStatsGrid
          stats={profile.stats}
          order={own ? profile.visible_stats.slice(0, 3) : profile.visible_stats}
          accent={profile.accent}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Posts</h2>
          {posts.length > 0 ? (
            <div className="flex rounded-full border border-line bg-foam p-1 text-sm font-semibold" role="tablist" aria-label="Show posts as">
              {(["grid", "list"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`min-h-9 rounded-full px-4 capitalize ${view === mode ? "bg-ink text-foam" : "text-ink/70"}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {posts.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-center text-[15px] text-mute">
            {own ? "Pick a drink on TeaLink and it shows up here." : "Nothing posted yet."}
          </p>
        ) : view === "grid" ? (
          <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-2xl">
            {posts.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setView("list");
                    requestAnimationFrame(() => document.getElementById(`post-${item.id}`)?.scrollIntoView({ block: "start" }));
                  }}
                  className="relative block aspect-square w-full"
                  aria-label={`${drinkInfo(item.drink_id)?.name ?? "Drink"}${item.rating ? `, ${item.rating} stars` : ""}`}
                >
                  <img src={drinkPhoto(item.drink_id, item.photo_url) ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {item.rating ? (
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/75 px-2 py-0.5 text-xs font-semibold text-foam">
                      ★ {item.rating}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {posts.map((item) => (
              <div key={item.id} id={`post-${item.id}`} className="scroll-mt-24">
                <FeedCard item={item} />
              </div>
            ))}
          </div>
        )}
      </section>

      {editing ? <EditProfile profile={profile} onClose={() => setEditing(false)} /> : null}
      {recOpen ? <SendRec to={profile} onClose={() => setRecOpen(false)} /> : null}
    </main>
  );
}
