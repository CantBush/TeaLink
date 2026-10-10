import { price } from "../../lib/format.ts";
import { drinkPhoto } from "../../lib/images.ts";
import { useShopId } from "../../state/role.ts";
import { markSoldOut, useSoldOut } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

/** This shop's drinks. Sold out and restock stay in this browser. */
export function ShopMenu() {
  const shopId = useShopId() ?? "";
  const sold = useSoldOut();
  const { drinks, error } = useShopCatalog();
  const menu = drinks.filter((drink) => drink.shop_id === shopId).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">Menu</p>
        <h1 className="mt-1 font-display text-4xl">Your drinks</h1>
        <p className="mt-1 text-mute">Sold out and restock apply only in this browser.</p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}
      {drinks.length === 0 && !error ? <p className="text-mute">Loading the menu…</p> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-[28px] border border-line bg-foam">
        {menu.map((drink) => {
          const out = sold.includes(drink.id);
          const photo = drinkPhoto(drink.id, drink.photo_url);
          return (
            <li key={drink.id} className="flex items-center gap-3 px-4 py-3">
              {photo ? <img src={photo} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{drink.name}</span>
                <span className="text-sm text-mute">
                  {price(drink.price)}
                  {out ? " · Sold out" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => markSoldOut(drink.id, !out)}
                className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold"
              >
                {out ? "Restock" : "Sold out"}
              </button>
            </li>
          );
        })}
      </ul>
    </ShopPage>
  );
}
