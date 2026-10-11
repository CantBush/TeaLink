import { useEffect, useState } from "react";
import { useStorePreview } from "../../api/http.ts";
import { shops } from "../../api/shops.ts";
import type { Demand, DemandRange } from "../../api/types.ts";
import { drinkInfo } from "../../lib/catalog.ts";
import { DIMENSIONS, dimensionLabel, shopLabel } from "../../lib/format.ts";
import { noteLabel } from "../../lib/stats.ts";
import { useShopId } from "../../state/role.ts";
import { ShopPage } from "./ShopLayout.tsx";

const RANGES: { id: DemandRange; label: string }[] = [
  { id: "week", label: "past week" },
  { id: "month", label: "past month" },
  { id: "year", label: "past year" },
];

const BASE_LABEL = { milk: "milk tea", fruit: "fruit tea", tea: "tea-forward" } as const;
const pct = (share: number) => `${Math.round(share * 100)}%`;

function Bar({ label, share }: { label: string; share: number }) {
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="text-mute">{pct(share)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-moss transition-[width] duration-500" style={{ width: pct(share) }} />
      </div>
    </li>
  );
}

function Ranked({ items }: { items: Demand["top_drinks"] }) {
  if (items.length === 0) return <p className="text-sm text-mute">Not enough orders in this range yet.</p>;
  return (
    <ol className="space-y-2">
      {items.map((item, index) => {
        const drink = drinkInfo(item.drink_id);
        return (
          <li key={item.drink_id} className="flex items-baseline gap-3">
            <span className="w-5 text-mute tabular-nums">{index + 1}.</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{drink?.name ?? item.drink_id}</span>
              {drink ? <span className="text-xs text-mute">{shopLabel(drink.shop_id)}</span> : null}
            </span>
            <span className="text-sm text-mute tabular-nums">{item.count}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Taste trends near you, anonymized: what people choose, what's popular, and what they weigh. */
export function ShopDemand() {
  const shopId = useShopId() ?? "";
  const preview = useStorePreview();
  const [range, setRange] = useState<DemandRange>("week");
  const [demand, setDemand] = useState<Demand | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    shops
      .demand(shopId, range)
      .then((next) => {
        if (!cancelled) setDemand(next);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load demand.");
      });
    return () => {
      cancelled = true;
    };
  }, [shopId, range]);

  const card = "rounded-[28px] border border-line bg-foam p-5";

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss">demand</p>
        <h1 className="mt-1 font-display text-4xl">taste trends</h1>
        <p className="mt-2 text-mute">
          What people near you choose. Anonymized, with no names, and groups smaller than 5 people are hidden.
          {preview ? " Sample data until the API serves real trends." : ""}
        </p>
      </header>

      <div className="flex gap-1 rounded-full border border-line bg-foam p-1" role="tablist" aria-label="Range">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={range === item.id}
            onClick={() => setRange(item.id)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${range === item.id ? "bg-ink text-foam" : "text-ink/70 hover:text-ink"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className={card}>{error}</p> : null}
      {demand ? (
        <div key={range} className="timeline-in space-y-4">
          <p className="text-center text-sm text-mute">
            {demand.people.toLocaleString()} people chose a drink in the {RANGES.find((item) => item.id === range)?.label}
          </p>
          <section className={card}>
            <h2 className="mb-3 font-display text-2xl">what they choose</h2>
            <ul className="space-y-3">
              {demand.bases.map((item) => (
                <Bar key={item.base} label={BASE_LABEL[item.base]} share={item.share} />
              ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className="mb-3 font-display text-2xl">top flavors</h2>
            <ul className="flex flex-wrap gap-2">
              {demand.flavors.map((item) => (
                <li key={item.tag} className="rounded-full bg-sage px-3 py-1.5 text-sm">
                  {noteLabel(item.tag).toLowerCase()} <span className="text-mute">{pct(item.share)}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className={card}>
              <h2 className="mb-3 font-display text-2xl">most popular</h2>
              <Ranked items={demand.top_drinks} />
            </section>
            <section className={card}>
              <h2 className="mb-3 font-display text-2xl">yours</h2>
              <Ranked items={demand.own_top_drinks} />
            </section>
          </div>
          <section className={card}>
            <h2 className="mb-3 font-display text-2xl">what they weigh</h2>
            <ul className="space-y-3">
              {[...DIMENSIONS]
                .sort((a, b) => demand.priorities[b] - demand.priorities[a])
                .map((dimension) => (
                  <Bar key={dimension} label={dimensionLabel(dimension).toLowerCase()} share={demand.priorities[dimension]} />
                ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className="text-mute">Loading demand…</p>
      )}
    </ShopPage>
  );
}
