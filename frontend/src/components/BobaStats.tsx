import type { BobaStats as Stats, StatKey } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { DIMENSIONS, dimensionLabel, matchPercent, shopLabel } from "../lib/format.ts";
import { tint } from "../lib/palette.ts";
import { STAT_LABELS, milkFruitWord, noteLabel, sweetnessWord, toppingsWord } from "../lib/stats.ts";

function Meter({ value, left, right, accent }: { value: number; left: string; right: string; accent: string }) {
  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full bg-line">
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foam shadow"
          style={{ left: `${Math.min(Math.max(value, 0.04), 0.96) * 100}%`, background: accent }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-mute">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function Big({ value, unit }: { value: number; unit: string }) {
  return (
    <p className="mt-1 font-display text-4xl leading-none">
      {value}
      <span className="ml-1.5 font-sans text-sm font-semibold text-mute">{unit}</span>
    </p>
  );
}

function body(key: StatKey, stats: Partial<Stats>, accent: string) {
  switch (key) {
    case "fav_drink": {
      const drink = drinkInfo(stats.fav_drink_id);
      if (!drink) return null;
      return (
        <>
          <p className="mt-1 font-display text-xl leading-tight">{drink.name}</p>
          <p className="text-sm text-mute">{shopLabel(drink.shop_id)}</p>
        </>
      );
    }
    case "fav_shop":
      if (!stats.fav_shop_id) return null;
      return <p className="mt-1 font-display text-xl leading-tight">{shopLabel(stats.fav_shop_id)}</p>;
    case "sweetness":
      if (stats.sweetness === undefined) return null;
      return (
        <>
          <p className="mt-1 font-semibold">{sweetnessWord(stats.sweetness)}</p>
          <Meter value={stats.sweetness} left="Not sweet" right="Very sweet" accent={accent} />
        </>
      );
    case "milk_vs_fruit":
      if (stats.milk_vs_fruit === undefined) return null;
      return (
        <>
          <p className="mt-1 font-semibold">{milkFruitWord(stats.milk_vs_fruit)}</p>
          <Meter value={stats.milk_vs_fruit} left="Fruit" right="Milk" accent={accent} />
        </>
      );
    case "toppings":
      if (stats.toppings === undefined) return null;
      return (
        <>
          <p className="mt-1 font-semibold">{toppingsWord(stats.toppings)}</p>
          <Meter value={stats.toppings} left="None" right="Loaded" accent={accent} />
        </>
      );
    case "top_notes":
      if (!stats.top_notes?.length) return null;
      return (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {stats.top_notes.map((tag) => (
            <li key={tag} className="rounded-full px-2.5 py-1 text-xs font-semibold text-foam" style={{ background: accent }}>
              {noteLabel(tag)}
            </li>
          ))}
        </ul>
      );
    case "tried_count":
      return stats.tried_count === undefined ? null : <Big value={stats.tried_count} unit="drinks" />;
    case "shops_visited":
      return stats.shops_visited === undefined ? null : <Big value={stats.shops_visited} unit="shops" />;
    case "streak":
      return stats.streak_weeks === undefined ? null : <Big value={stats.streak_weeks} unit={stats.streak_weeks === 1 ? "week 🔥" : "weeks 🔥"} />;
    case "priorities": {
      const weights = stats.priorities;
      if (!weights) return null;
      const order = [...DIMENSIONS].sort((a, b) => weights[b] - weights[a]);
      return (
        <ul className="mt-2 space-y-1.5">
          {order.map((dimension) => (
            <li key={dimension} className="flex items-center gap-2 text-xs font-semibold">
              <span className="w-24 shrink-0 text-mute">{dimensionLabel(dimension)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span className="block h-full rounded-full" style={{ width: `${matchPercent(weights[dimension])}%`, background: accent }} />
              </span>
              <span className="w-8 text-right">{matchPercent(weights[dimension])}%</span>
            </li>
          ))}
        </ul>
      );
    }
  }
}

const WIDE: StatKey[] = ["priorities", "top_notes", "fav_drink"];

/** The stats a profile chose to show, in the order it chose. Keys in `hidden` are marked as private. */
export function BobaStatsGrid({
  stats,
  order,
  accent,
  hidden = [],
}: {
  stats: Partial<Stats>;
  order: StatKey[];
  accent: string;
  hidden?: StatKey[];
}) {
  const cards = order.map((key) => ({ key, content: body(key, stats, tint(accent)) })).filter((card) => card.content);
  if (cards.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-mute">No boba stats shared yet.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.key}
          className={`rounded-3xl border p-4 ${WIDE.includes(card.key) ? "col-span-2 sm:col-span-1" : ""} ${
            hidden.includes(card.key) ? "border-dashed border-line bg-cream" : "border-line bg-foam"
          }`}
        >
          <p className="flex justify-between gap-2 text-[11px] font-semibold tracking-[0.12em] text-mute uppercase">
            {STAT_LABELS[card.key]}
            {hidden.includes(card.key) ? <span className="tracking-normal normal-case">Only you</span> : null}
          </p>
          {card.content}
        </li>
      ))}
    </ul>
  );
}
