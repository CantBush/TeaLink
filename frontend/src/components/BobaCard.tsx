import type { Avatar as AvatarData, BobaStats, Dimension } from "../api/types.ts";
import { DIMENSIONS, dimensionLabel, matchPercent } from "../lib/format.ts";
import { milkFruitWord, noteLabel, sweetnessWord, toppingsWord } from "../lib/stats.ts";
import { Avatar } from "./Avatar.tsx";
import { BobaMark } from "./BobaMark.tsx";

/** A bold, shareable summary of someone's boba taste, in the spirit of Spotify Wrapped. */
export function BobaCard({
  name,
  handle,
  avatar,
  accent,
  stats,
}: {
  name: string;
  handle: string;
  avatar: AvatarData;
  accent: string;
  stats: Partial<BobaStats>;
}) {
  const weights = stats.priorities;
  const top: Dimension | null = weights
    ? [...DIMENSIONS].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0))[0]
    : null;
  const traits = [
    stats.sweetness !== undefined ? sweetnessWord(stats.sweetness) : null,
    stats.milk_vs_fruit !== undefined ? milkFruitWord(stats.milk_vs_fruit) : null,
    stats.toppings !== undefined ? toppingsWord(stats.toppings) : null,
  ].filter((trait): trait is string => trait !== null);

  return (
    <article
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[36px] p-7 text-foam shadow-xl"
      style={{ background: `linear-gradient(160deg, ${accent} 0%, #2c1810 85%)` }}
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

      <p className="relative mt-8 text-xs font-semibold tracking-[0.2em] text-foam/70 uppercase">Your boba personality</p>
      <h2 className="relative mt-2 font-display text-4xl leading-[1.05]">{stats.personality || "Still steeping"}</h2>

      {traits.length > 0 ? (
        <ul className="relative mt-6 space-y-2">
          {traits.map((trait) => (
            <li key={trait} className="flex items-center gap-2 text-lg font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-foam" aria-hidden />
              {trait}
            </li>
          ))}
        </ul>
      ) : null}

      {stats.top_notes?.length ? (
        <div className="relative mt-6">
          <p className="text-xs font-semibold tracking-[0.2em] text-foam/70 uppercase">Top flavors</p>
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
          <p className="text-xs font-semibold tracking-[0.2em] text-foam/70 uppercase">What matters most</p>
          <p className="mt-1 font-display text-2xl">
            {dimensionLabel(top)} · {matchPercent(weights[top] ?? 0)}%
          </p>
        </div>
      ) : null}

      <p className="relative mt-8 flex items-center gap-2 font-display text-lg">
        <BobaMark />
        TeaLink
      </p>
    </article>
  );
}
