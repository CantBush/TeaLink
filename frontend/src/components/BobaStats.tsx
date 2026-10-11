import type { BobaStats as Stats, StatKey } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { DIMENSIONS, dimensionLabel, shopLabel, timeAgo } from "../lib/format.ts";
import { tint } from "../lib/palette.ts";
import { RUN_STATS, STAT_LABELS, noteLabel, shownStats } from "../lib/stats.ts";

function Big({ value, unit }: { value: number; unit: string }) {
  return (
    <p className="mt-1 font-display text-4xl leading-none">
      {value}
      <span className="ml-1.5 font-sans text-sm font-semibold text-mute">{unit}</span>
    </p>
  );
}

function body(key: StatKey, stats: Partial<Stats>, accent: string, shown: StatKey[]) {
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
    case "streak":
    case "shops_visited":
    case "tried_count": {
      const rows = [
        { key: "streak", value: stats.streak_weeks, unit: "week streak" },
        { key: "shops_visited", value: stats.shops_visited, unit: "shops" },
        { key: "tried_count", value: stats.tried_count, unit: "drinks" },
      ].filter((row): row is { key: StatKey; value: number; unit: string } => row.value !== undefined && shown.includes(row.key as StatKey));
      if (rows.length === 0) return null;
      return (
        <div className="mt-1 flex gap-4">
          {rows.map((row) => (
            <div key={row.key} className="min-w-0 flex-1">
              <Big value={row.value} unit={row.unit} />
            </div>
          ))}
        </div>
      );
    }
    case "past_orders": {
      const orders = stats.past_orders;
      if (!orders) return null;
      if (orders.length === 0) return <p className="mt-1 text-sm text-mute">No orders yet.</p>;
      return (
        <ol className="mt-2 space-y-1.5 text-sm">
          {orders.slice(0, 5).map((order) => (
            <li key={`${order.drink_id}-${order.ordered_at}`} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{drinkInfo(order.drink_id)?.name ?? order.drink_id}</span>
                <span className="text-mute"> · {shopLabel(order.shop_id)}</span>
              </span>
              <span className="shrink-0 text-xs text-mute">{timeAgo(order.ordered_at)}</span>
            </li>
          ))}
        </ol>
      );
    }
    case "priorities": {
      const weights = stats.priorities;
      if (!weights) return null;
      const order = [...DIMENSIONS].sort((a, b) => weights[b] - weights[a]);
      return (
        <ol className="mt-2 space-y-1 text-sm">
          {order.map((dimension, index) => (
            <li key={dimension} className={index === 0 ? "font-semibold" : "text-mute"}>
              {index + 1}. {dimensionLabel(dimension).toLowerCase()}
            </li>
          ))}
        </ol>
      );
    }
  }
}

/** On a narrow window these stats span the whole row, including favorite shop. */
const WIDE: StatKey[] = ["priorities", "top_notes", "fav_drink", "fav_shop", "past_orders"];

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
  const keys = shownStats(order).filter((key, index, all) => !RUN_STATS.includes(key) || all.findIndex((item) => RUN_STATS.includes(item)) === index);
  const cards = keys.map((key) => ({ key, content: body(key, stats, tint(accent), order) })).filter((card) => card.content);
  if (cards.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-mute">No boba stats shared yet.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li
          key={card.key}
          className={`rounded-3xl border p-4 ${
            RUN_STATS.includes(card.key) ? "col-span-2 sm:col-span-3" : WIDE.includes(card.key) ? "col-span-2 sm:col-span-1" : ""
          } ${hidden.includes(card.key) ? "border-dashed border-line bg-cream" : "border-line bg-foam"}`}
        >
          <p className="flex justify-between gap-2 text-[11px] font-semibold tracking-[0.12em] text-mute lowercase">
            {RUN_STATS.includes(card.key) ? "Boba run" : STAT_LABELS[card.key]}
            {hidden.includes(card.key) ? <span className="tracking-normal normal-case">Only you</span> : null}
          </p>
          {card.content}
        </li>
      ))}
    </ul>
  );
}
