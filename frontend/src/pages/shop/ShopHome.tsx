import { price } from "../../lib/format.ts";
import { useShopId } from "../../state/role.ts";
import { useShopOnline } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

const PICKUPS = 11;
const PICKUP_FEE = 0.35;

/** Today: teagent status, the scripted Sunright close call, and a sample pickup fee. */
export function ShopHome() {
  const shopId = useShopId() ?? "";
  const online = useShopOnline(shopId);
  const { shops, drinks, error } = useShopCatalog();
  const shop = shops.find((item) => item.id === shopId);
  const thai = drinks.find((item) => item.id === "kf_thai");
  const wintermelon = drinks.find((item) => item.id === "sr_wintermelon");
  const kungfu = shops.find((item) => item.id === "kungfu");

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">Today</p>
        <h1 className="mt-1 font-display text-4xl leading-tight">{shop?.name ?? "Your shop"}</h1>
        {shop ? <p className="mt-1 text-mute">{shop.neighborhood}</p> : null}
      </header>

      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}

      <section className="rounded-[28px] border border-line bg-foam p-5">
        <h2 className="font-display text-2xl">Shop teagent</h2>
        <p className="mt-2 text-lg">
          {online ? "Online. It can confirm what is in stock." : "Offline in this browser. It is not confirming stock."}
        </p>
        <p className="mt-2 text-sm text-mute">This status stays on this browser. It does not change the live demo.</p>
      </section>

      {shopId === "sunright" ? (
        <section className="rounded-[28px] border border-line bg-foam p-5">
          <h2 className="font-display text-2xl">Scripted close call</h2>
          <p className="mt-2">
            {thai?.name ?? "Thai Tea"} at {kungfu?.name ?? "Kung Fu Tea Co."} is 78
            {thai ? ` (${price(thai.price)})` : ""}. {wintermelon?.name ?? "Wintermelon Tea"} here is 77
            {wintermelon ? ` (${price(wintermelon.price)})` : ""}.
          </p>
          <p className="mt-3 text-mute">
            Wintermelon is the runner-up, the scores are within 0.02, and the shops differ. Wintermelon is already cheaper
            than Kung Fu's Thai Tea, so it is not losing on price. No offer.
          </p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-line bg-foam p-5">
        <h2 className="font-display text-2xl">Sample pickups</h2>
        <p className="mt-2 font-display text-4xl leading-none">
          {PICKUPS} <span className="text-2xl text-mute">pickups</span>
        </p>
        <p className="mt-2 text-lg">{price(PICKUPS * PICKUP_FEE)}</p>
        <p className="mt-2 text-sm text-mute">
          Pickup fee {price(PICKUP_FEE)}. Sample figure, not a real charge.
        </p>
      </section>
    </ShopPage>
  );
}
