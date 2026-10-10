import { shopPhoto } from "../../lib/images.ts";
import { useShopId } from "../../state/role.ts";
import { setShopOnline, useShopOnline } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

/** Name and neighborhood from the selected shop. The online switch stays in this browser. */
export function ShopAccount() {
  const shopId = useShopId() ?? "";
  const online = useShopOnline(shopId);
  const { shops, error } = useShopCatalog();
  const shop = shops.find((item) => item.id === shopId);
  const photo = shop ? shop.photo_url || shopPhoto(shop.id) : null;

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">Shop</p>
        <h1 className="mt-1 font-display text-4xl leading-tight">{shop?.name ?? "Your shop"}</h1>
        {shop ? <p className="mt-1 text-lg text-mute">{shop.neighborhood}</p> : null}
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}
      {photo ? <img src={photo} alt="" className="aspect-[4/3] w-full rounded-[28px] object-cover" /> : null}
      <section className="flex items-center justify-between gap-4 rounded-[28px] border border-line bg-foam p-5">
        <div>
          <h2 className="font-display text-2xl">{online ? "Online" : "Offline"}</h2>
          <p className="mt-1 text-sm text-mute">Stored in this browser only. The live demo is unchanged.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={online}
          aria-label="Shop online"
          onClick={() => setShopOnline(shopId, !online)}
          className={`relative h-8 w-14 shrink-0 rounded-full ${online ? "bg-ink" : "bg-line"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-foam ${online ? "left-7" : "left-1"}`} />
        </button>
      </section>
    </ShopPage>
  );
}
