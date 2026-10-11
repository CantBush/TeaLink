import { TeaBowl } from "../components/Doodles.tsx";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { social } from "../api/social.ts";
import type { FeedItem, UserProfile } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { FeedCard } from "../components/FeedCard.tsx";
import { PostComposer } from "../components/PostComposer.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { matchPercent } from "../lib/format.ts";
import { tint } from "../lib/palette.ts";
import { useMe } from "../state/me.ts";
import { isSignedIn } from "../state/account.ts";
import { useRole } from "../state/role.ts";
import { profilesChanged, useProfile } from "../state/social.ts";

function Suggested({ users, onFollow }: { users: UserProfile[]; onFollow: (user: UserProfile) => void }) {
  if (users.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl">Suggested for you</h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {users.map((user) => (
          <li key={user.user_id} className="w-40 shrink-0 snap-start rounded-[24px] border border-line bg-foam p-4 text-center">
            <Link to={`/u/${user.handle}`} className="block">
              <Avatar avatar={user.avatar} size="lg" />
              <p className="mt-2 truncate font-semibold">{user.display_name}</p>
              <p className="truncate text-xs text-mute">{user.stats.personality ?? `@${user.handle}`}</p>
            </Link>
            {user.taste_match !== null ? (
              <p className="mt-1 text-xs font-semibold text-moss">{matchPercent(user.taste_match)}% taste match</p>
            ) : null}
            <button
              type="button"
              onClick={() => onFollow(user)}
              className="mt-3 w-full rounded-full py-1.5 text-sm font-semibold text-foam"
              style={{ background: tint(user.accent) }}
            >
              Follow
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Home() {
  const me = useMe();
  const role = useRole();
  const { profile } = useProfile();
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [tick, setTick] = useState(0);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    social
      .getFeed(me)
      .then((items) => {
        if (!cancelled) setFeed(items);
      })
      .catch(() => {
        if (!cancelled) setFeed([]);
      });
    social
      .listUsers(me)
      .then((users) => {
        if (!cancelled) setPeople(users.filter((user) => !user.followed_by_me).slice(0, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, tick]);

  const follow = (user: UserProfile) => {
    setPeople((list) => list.filter((item) => item.user_id !== user.user_id));
    void social.follow(user.user_id, me, true).then(() => {
      profilesChanged();
      setTick((value) => value + 1);
    });
  };

  const newcomer = profile !== null && (profile.stats.tried_count ?? 0) === 0;

  if (role === "store") return <Navigate to="/shop" replace />;
  if (!isSignedIn()) return <Navigate to="/welcome" replace />;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-5 sm:px-5 sm:py-8">
      <PreviewNote />
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-moss lowercase">Your friends</p>
          <h1 className="mt-1 flex items-center gap-3 font-display text-4xl">
            What everyone's sipping
            <TeaBowl steaming className="h-8 w-8 shrink-0 text-moss" />
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to="/" className="hidden rounded-full border border-ink px-4 py-2 text-sm font-semibold sm:block">
            Get a rec
          </Link>
          <button type="button" onClick={() => setComposing(true)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-foam">
            New post
          </button>
        </div>
      </header>

      {newcomer ? (
        <Link to="/" className="block rounded-[28px] bg-ink p-5 text-foam">
          <p className="font-display text-2xl">Your agents are ready</p>
          <p className="mt-1 text-sm text-foam/80">Your quiz answers set your starting priorities. Open TeaLink to get your first top 3.</p>
        </Link>
      ) : null}

      <Suggested users={people} onFollow={follow} />

      <section className="space-y-3">
        {feed === null ? (
          <p className="text-sm text-mute">Loading your feed…</p>
        ) : feed.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-mute">
            Follow a few people to fill your feed.
          </p>
        ) : (
          feed.slice(0, 40).map((item) => <FeedCard key={item.id} item={item} />)
        )}
      </section>
      {composing ? (
        <PostComposer onClose={() => setComposing(false)} onPosted={(item) => setFeed((list) => [item, ...(list ?? [])])} />
      ) : null}
    </main>
  );
}
