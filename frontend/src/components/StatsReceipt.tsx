import type { ReactNode } from "react";
import type { BobaStats, StatKey } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { DIMENSIONS, dimensionLabel, shopLabel } from "../lib/format.ts";
import { RUN_STATS, noteLabel } from "../lib/stats.ts";
import { BobaMark } from "./BobaMark.tsx";

const ZIGZAG = {
  WebkitMask:
    "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/14px 8px repeat-x, linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat",
  mask: "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/14px 8px repeat-x, linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat",
};

const TODAY = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).toLowerCase();

function Line({ label, value, hidden }: { label: string; value: ReactNode; hidden: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 text-[15px]">
      <span className="shrink-0 text-mute">{label}</span>
      {hidden ? <span className="shrink-0 text-[10px] tracking-[0.1em] text-mute/80">· only you</span> : null}
      <span className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-ink/25" aria-hidden />
      <span className="min-w-0 text-right font-semibold">{value}</span>
    </div>
  );
}

function Heading({ children, hidden }: { children: ReactNode; hidden: boolean }) {
  return (
    <p className="flex justify-between gap-2 pt-1 text-[11px] tracking-[0.16em] text-mute lowercase">
      {children}
      {hidden ? <span className="tracking-[0.1em]">only you</span> : null}
    </p>
  );
}

/** Your stats as a tea-shop receipt. Keys in `hidden` are marked as only visible to you. */
export function StatsReceipt({ stats, order, hidden }: { stats: Partial<BobaStats>; order: StatKey[]; hidden: StatKey[] }) {
  const isHidden = (key: StatKey) => hidden.includes(key);
  const blocks: ReactNode[] = [];
  let runDone = false;

  for (const key of order) {
    if (RUN_STATS.includes(key)) {
      if (runDone) continue;
      runDone = true;
      const runKeys = order.filter((item) => RUN_STATS.includes(item));
      const value = (item: StatKey) =>
        item === "streak"
          ? stats.streak_weeks !== undefined && `${stats.streak_weeks} ${stats.streak_weeks === 1 ? "week" : "weeks"}`
          : item === "shops_visited"
            ? stats.shops_visited
            : stats.tried_count;
      const label = (item: StatKey) => (item === "streak" ? "boba streak" : item === "shops_visited" ? "shops visited" : "drinks tried");
      const rows = runKeys.filter((item) => value(item) !== undefined && value(item) !== false);
      if (rows.length === 0) continue;
      blocks.push(
        <div key="run">
          <Heading hidden={false}>your boba run</Heading>
          {rows.map((item) => (
            <Line key={item} label={label(item)} value={value(item)} hidden={isHidden(item)} />
          ))}
        </div>,
      );
      continue;
    }
    if (key === "fav_drink") {
      const drink = drinkInfo(stats.fav_drink_id);
      if (drink)
        blocks.push(
          <div key={key}>
            <Line label="favorite drink" value={drink.name} hidden={isHidden(key)} />
            <p className="-mt-1 text-right text-xs text-mute">{shopLabel(drink.shop_id)}</p>
          </div>,
        );
    } else if (key === "fav_shop") {
      if (stats.fav_shop_id)
        blocks.push(
          <Line key={key} label="favorite shop" value={shopLabel(stats.fav_shop_id)} hidden={isHidden(key)} />,
        );
    } else if (key === "top_notes") {
      if (stats.top_notes?.length)
        blocks.push(
          <Line key={key} label="top flavors" value={stats.top_notes.map(noteLabel).join(", ").toLowerCase()} hidden={isHidden(key)} />,
        );
    } else if (key === "priorities") {
      const weights = stats.priorities;
      if (weights) {
        const ranked = [...DIMENSIONS].sort((a, b) => weights[b] - weights[a]);
        blocks.push(
          <div key={key}>
            <Heading hidden={isHidden(key)}>what matters most to you</Heading>
            <ol className="mt-1 space-y-1">
              {ranked.map((dimension, index) => (
                <li key={dimension} className="flex gap-3 text-[15px]">
                  <span className="w-5 text-mute tabular-nums">{index + 1}.</span>
                  <span className={index === 0 ? "font-semibold" : undefined}>{dimensionLabel(dimension).toLowerCase()}</span>
                </li>
              ))}
            </ol>
          </div>,
        );
      }
    } else if (key === "past_orders") {
      const orders = stats.past_orders;
      if (orders?.length)
        blocks.push(
          <div key={key}>
            <Heading hidden={isHidden(key)}>past orders</Heading>
            {orders.slice(0, 5).map((order) => (
              <Line
                key={`${order.drink_id}-${order.ordered_at}`}
                label={(drinkInfo(order.drink_id)?.name ?? order.drink_id).toLowerCase()}
                value={shopLabel(order.shop_id)}
                hidden={false}
              />
            ))}
          </div>,
        );
    }
  }

  if (blocks.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-mute">Rate a drink and your receipt starts printing.</p>;
  }

  return (
    <div className="timeline-in mx-auto max-w-sm drop-shadow-[0_6px_14px_rgba(21,35,27,0.08)]">
      <div className="bg-foam px-6 pt-6 pb-8" style={ZIGZAG}>
        <div className="flex flex-col items-center text-center">
          <BobaMark className="h-7 w-9 text-ink" />
          <p className="mt-1 font-display text-xl">tealink</p>
          <p className="text-xs tracking-[0.14em] text-mute">your boba receipt · {TODAY}</p>
        </div>
        <div className="mt-4 divide-y divide-dashed divide-ink/25 [&>*]:py-3">{blocks}</div>
        <p className="mt-5 border-t border-dashed border-ink/25 pt-4 text-center text-xs tracking-[0.14em] text-mute">
          thank you for sipping · see you soon
        </p>
      </div>
    </div>
  );
}
