import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { client } from "../api/client.ts";
import type { SimilarUser, TasteProfile } from "../api/types.ts";
import { TASTE_ORDER, attributeLabel, matchPercent } from "../lib/format.ts";
import { USER_ID, loadProfile, useSession } from "../state/session.ts";

/** Attributes within this distance count as shared taste. */
const AGREE_WITHIN = 0.1;

function Compare({ mine, theirs, name }: { mine: TasteProfile; theirs: TasteProfile; name: string }) {
  const agree = TASTE_ORDER.filter((key) => Math.abs((mine[key] ?? 0) - (theirs[key] ?? 0)) <= AGREE_WITHIN);
  return (
    <>
      <div className="mt-5 flex gap-4 text-xs font-semibold text-mute">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" /> Andrew
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#8a6a52]" /> {name}
        </span>
      </div>
      <ul className="mt-3 space-y-4">
        {TASTE_ORDER.map((key) => (
          <li key={key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{attributeLabel(key)}</span>
              <span className="text-mute">
                {matchPercent(mine[key] ?? 0)}% vs {matchPercent(theirs[key] ?? 0)}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-[#eadfce]">
                <div className="h-full rounded-full bg-amber" style={{ width: `${matchPercent(mine[key] ?? 0)}%` }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#eadfce]">
                <div
                  className="h-full rounded-full bg-[#8a6a52]"
                  style={{ width: `${matchPercent(theirs[key] ?? 0)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm">
        {agree.length > 0
          ? `You and ${name} agree on ${agree.map((key) => attributeLabel(key).toLowerCase()).join(", ")}. The Social agent leans on people like ${name} when it suggests drinks you haven't tried.`
          : `You and ${name} differ on every attribute, so ${name} has little pull on the Social agent.`}
      </p>
    </>
  );
}

export function Friends() {
  const session = useSession();
  const [selected, setSelected] = useState<SimilarUser | null>(null);
  const [theirs, setTheirs] = useState<TasteProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const friend = selected ?? session.similar[0] ?? null;
  const friendId = friend?.id ?? null;

  useEffect(() => {
    loadProfile(USER_ID);
  }, []);

  useEffect(() => {
    if (!friendId) return;
    let cancelled = false;
    client
      .getProfile(friendId)
      .then((profile) => {
        if (!cancelled) setTheirs(profile);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link to="/" className="text-sm font-semibold text-mute hover:text-ink">
        Back to Discover
      </Link>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">People with your taste</p>
        <h1 className="mt-2 font-display text-4xl">Friends</h1>
        <p className="mt-2 text-mute">
          Ranked by how closely their reviews match Andrew's, the same similarity the Social agent uses.
        </p>
      </header>

      {session.similar.length === 0 ? (
        <p className="rounded-[28px] border border-line bg-foam p-6 text-sm text-mute">
          Finding people with similar taste… If this doesn't load, the API isn't running.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {session.similar.map((user) => {
            const active = friend?.id === user.id;
            return (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(user);
                    setTheirs(null);
                    setFailed(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
                    active ? "border-amber bg-[#fbf4ea]" : "border-line bg-cream hover:border-ink/30"
                  }`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#f0e2d0] font-display text-lg">
                    {user.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block font-semibold">{user.name}</span>
                    <span className="text-sm text-mute">{matchPercent(user.similarity)}% similar</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {friend ? (
        <article className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-3xl">Andrew and {friend.name}</h2>
          {theirs ? (
            <Compare mine={session.profile} theirs={theirs} name={friend.name} />
          ) : (
            <p className="mt-3 text-sm text-mute">
              {failed ? `Couldn't load ${friend.name}'s taste profile.` : "Loading taste profile…"}
            </p>
          )}
        </article>
      ) : null}
    </main>
  );
}
