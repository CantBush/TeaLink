import { useShopId } from "../../state/role.ts";
import { setAutoOffer, useAutoOffer } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

const RULES = [
  "Your drink is the runner-up.",
  "The top two scores are within 0.02.",
  "The top two come from different shops.",
  "Your drink is losing on price.",
];

/** The four close-call rules, plus a local auto-offer switch. */
export function ShopOffers() {
  const shopId = useShopId() ?? "";
  const on = useAutoOffer(shopId);
  const { shops } = useShopCatalog();
  const shop = shops.find((item) => item.id === shopId);

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">Offers</p>
        <h1 className="mt-1 font-display text-4xl">Close-call discounts</h1>
        <p className="mt-2 text-mute">
          {shop?.name ?? "Your shop"} can discount only when every rule below is true. The cap is 10% and $1.
        </p>
      </header>

      <ol className="space-y-3">
        {RULES.map((rule, index) => (
          <li key={rule} className="rounded-3xl border border-line bg-foam px-5 py-4">
            <span className="text-sm font-semibold text-moss">Rule {index + 1}</span>
            <p className="mt-1 text-lg font-semibold">{rule}</p>
          </li>
        ))}
      </ol>

      {shopId === "sunright" ? (
        <p className="rounded-[28px] border border-line bg-foam p-5 text-mute">
          On the scripted opening, Wintermelon is already cheaper than Kung Fu's Thai Tea, so it is not losing on price.
          No offer.
        </p>
      ) : null}

      <section className="flex items-center justify-between gap-4 rounded-[28px] border border-line bg-foam p-5">
        <div>
          <h2 className="font-display text-2xl">Auto-offer</h2>
          <p className="mt-1 text-sm text-mute">
            {on ? "On in this browser. A discount still needs all four rules." : "Off in this browser. No discount is prepared."}{" "}
            Nothing is sent to the recommender.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Auto-offer"
          onClick={() => setAutoOffer(shopId, !on)}
          className={`relative h-8 w-14 shrink-0 rounded-full ${on ? "bg-ink" : "bg-line"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-foam ${on ? "left-7" : "left-1"}`} />
        </button>
      </section>
    </ShopPage>
  );
}
