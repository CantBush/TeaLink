import type { Avatar as AvatarData, BobaStats, Dimension } from "../api/types.ts";
import { DIMENSIONS, dimensionLabel } from "../lib/format.ts";
import { tint } from "../lib/palette.ts";
import { noteLabel } from "../lib/stats.ts";
import { Avatar } from "./Avatar.tsx";
import { BobaMark } from "./BobaMark.tsx";

/** A bold, shareable summary of someone's boba taste, in the spirit of Spotify Wrapped. */
export function BobaCard({
  name,
  handle,
  avatar,
  accent,
  color,
  stats,
}: {
  name: string;
  handle: string;
  avatar: AvatarData;
  accent: string;
  /** Card background you picked; defaults to your profile accent. */
  color?: string;
  stats: Partial<BobaStats>;
}) {
  const weights = stats.priorities;
  const top: Dimension | null = weights
    ? [...DIMENSIONS].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0))[0]
    : null;

  return (
    <article
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[36px] p-7 text-foam shadow-xl transition-[background] duration-500"
      style={{ background: `linear-gradient(160deg, ${color ?? tint(accent)} 0%, #15231b 92%)` }}
    >
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-foam/10" aria-hidden />
      <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-foam/5" aria-hidden />

      <div className="relative flex items-center gap-3">
        <Avatar avatar={avatar} size="md" />
        <div>
          <p className="font-semibold leading-tight">{name}</p>
          <p className="text-sm text-foam/70">@{handle}</p>
        </div>
      </div>

      <p className="relative mt-8 text-xs font-semibold tracking-[0.2em] text-foam/70 lowercase">Your boba personality</p>
      <h2 className="relative mt-2 font-display text-4xl leading-[1.05]">{stats.personality || "Still steeping"}</h2>

      {stats.top_notes?.length ? (
        <div className="relative mt-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-foam/70 lowercase">Top flavors</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {stats.top_notes.map((tag) => (
              <li key={tag} className="rounded-full bg-foam px-3 py-1 text-sm font-semibold text-ink">
                {noteLabel(tag)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {top && weights ? (
        <div className="relative mt-6 rounded-2xl bg-foam/10 px-4 py-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-foam/70 lowercase">What matters most to you</p>
          <p className="mt-1 font-display text-2xl">
            {dimensionLabel(top).toLowerCase()}
          </p>
        </div>
      ) : null}

      <p className="relative mt-8 flex items-center gap-2 font-display text-lg tracking-[0.14em]">
        <BobaMark />
        TeaLink
      </p>
    </article>
  );
}
