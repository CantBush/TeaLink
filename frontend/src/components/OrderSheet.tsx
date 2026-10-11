import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useStorePreview } from "../api/http.ts";
import { orders } from "../api/orders.ts";
import { shops } from "../api/shops.ts";
import type { PayMethod, ShopDrink } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { topOptions } from "../lib/diff.ts";
import { price, shopLabel } from "../lib/format.ts";
import { drinkPhoto } from "../lib/images.ts";
import { quote } from "../lib/order.ts";
import { orderedFromTop3, useSession } from "../state/session.ts";

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${on ? "border-ink bg-ink text-foam" : "border-line text-ink/80 hover:border-ink/40"}`}
    >
      {children}
    </button>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-line pt-2 font-semibold" : "text-ink/80"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Order one drink for pickup: options, checkout with any close-call offer, then pay at pickup or by card. */
export function OrderSheet({ drinkId, onClose }: { drinkId: string; onClose: () => void }) {
  const catalog = drinkInfo(drinkId);
  const shopId = catalog?.shop_id ?? "";
  const preview = useStorePreview();
  const { decision } = useSession();
  const [drink, setDrink] = useState<ShopDrink | null>(null);
  const [sugar, setSugar] = useState<string | undefined>();
  const [ice, setIce] = useState<string | undefined>();
  const [toppings, setToppings] = useState<string[]>([]);
  const [pay, setPay] = useState<PayMethod>("pickup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    shops
      .menu(shopId)
      .then((menu) => {
        if (cancelled) return;
        const found = menu.drinks.find((item) => item.id === drinkId) ?? null;
        setDrink(found);
        if (!found) setError("This drink isn't on the shop's menu anymore.");
        const options = found?.options;
        if (options) {
          setSugar(options.sugar.includes("50%") ? "50%" : options.sugar[0]);
          setIce(options.ice.at(-1));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the shop's menu.");
      });
    return () => {
      cancelled = true;
    };
  }, [shopId, drinkId]);

  const fromTop3 = decision ? topOptions(decision).find((option) => option.drink_id === drinkId) : undefined;
  const offer = fromTop3?.offer ?? null;
  const extras = toppings.reduce((sum, name) => sum + (drink?.options?.toppings.find((item) => item.name === name)?.price ?? 0), 0);
  const totals = drink ? quote(drink.price, extras, offer) : null;

  const place = () => {
    if (!drink) return;
    setBusy(true);
    setError(null);
    orders
      .create(
        { shop_id: shopId, items: [{ drink_id: drinkId, sugar, ice, toppings }], pay },
        offer ? { drink_id: drinkId, offer } : null,
      )
      .then((receipt) => {
        if (receipt.payment_url) {
          window.location.assign(receipt.payment_url);
          return;
        }
        setPlaced({ total: receipt.total });
        if (fromTop3) void orderedFromTop3(drinkId, fromTop3.drink_name, receipt.learned);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Couldn't place the order."))
      .finally(() => setBusy(false));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal
        aria-label={`Order ${catalog?.name ?? "a drink"}`}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-foam p-6 sm:rounded-[32px]"
      >
        <div className="flex items-start gap-4">
          {drinkPhoto(drinkId) ? <img src={drinkPhoto(drinkId)!} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.16em] text-moss">order for pickup</p>
            <h2 className="font-display text-2xl leading-tight">{catalog?.name ?? drinkId}</h2>
            <p className="text-sm text-mute">{shopLabel(shopId)}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-sm font-semibold text-mute" aria-label="Close">
            Close
          </button>
        </div>

        {placed ? (
          <div className="timeline-in mt-6 space-y-4">
            <p className="rounded-3xl bg-sage p-5">
              <span className="block font-display text-2xl">order placed</span>
              {shopLabel(shopId)} has it. Pay {price(placed.total)} when you pick it up.
            </p>
            <div className="flex gap-3">
              <Link to="/orders" onClick={onClose} className="flex-1 rounded-full bg-ink py-3 text-center font-semibold text-foam">
                See your orders
              </Link>
              <button type="button" onClick={onClose} className="flex-1 rounded-full border border-ink py-3 font-semibold">
                Done
              </button>
            </div>
          </div>
        ) : !drink ? (
          <p className="mt-6 text-mute">{error ?? "Loading the menu…"}</p>
        ) : !drink.available ? (
          <p className="mt-6 rounded-3xl bg-sage p-5">{drink.name} is sold out right now. Try another of your picks.</p>
        ) : (
          <div className="mt-5 space-y-5">
            {drink.options ? (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Sugar</legend>
                  <div className="flex flex-wrap gap-2">
                    {drink.options.sugar.map((level) => (
                      <Choice key={level} on={sugar === level} onClick={() => setSugar(level)}>
                        {level}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Ice</legend>
                  <div className="flex flex-wrap gap-2">
                    {drink.options.ice.map((level) => (
                      <Choice key={level} on={ice === level} onClick={() => setIce(level)}>
                        {level}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
                {drink.options.toppings.length ? (
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Toppings</legend>
                    <div className="flex flex-wrap gap-2">
                      {drink.options.toppings.map((topping) => (
                        <Choice
                          key={topping.name}
                          on={toppings.includes(topping.name)}
                          onClick={() =>
                            setToppings((list) =>
                              list.includes(topping.name) ? list.filter((name) => name !== topping.name) : [...list, topping.name],
                            )
                          }
                        >
                          {`${topping.name} +${price(topping.price)}`}
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </>
            ) : null}

            {totals ? (
              <div className="space-y-1.5 rounded-3xl border border-line p-4 text-[15px]">
                <Line label={drink.name} value={price(drink.price)} />
                {extras > 0 ? <Line label="Toppings" value={price(extras)} /> : null}
                {offer && totals.discount > 0 ? (
                  <Line label={`Close-call offer, ${offer.percent}% off from ${shopLabel(offer.shop_id)}`} value={`−${price(totals.discount)}`} />
                ) : null}
                <Line label="Pickup fee" value={price(totals.pickup_fee)} />
                <Line label="Total" value={price(totals.total)} strong />
                {offer ? <p className="pt-1 text-xs text-mute">The offer only applies while this close call is your current recommendation.</p> : null}
              </div>
            ) : null}

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Payment</legend>
              <div className="flex flex-wrap gap-2">
                <Choice on={pay === "pickup"} onClick={() => setPay("pickup")}>
                  Pay at pickup
                </Choice>
                {preview ? null : (
                  <Choice on={pay === "card"} onClick={() => setPay("card")}>
                    Card
                  </Choice>
                )}
              </div>
              {preview ? <p className="mt-2 text-xs text-mute">Card payments open once the server has Stripe test mode. Until then it's pay at pickup.</p> : null}
            </fieldset>

            {error ? <p className="text-sm text-[#a33]">{error}</p> : null}
            <button type="button" onClick={place} disabled={busy} className="min-h-12 w-full rounded-full bg-ink font-semibold text-foam disabled:opacity-40">
              {busy ? "Placing…" : `Place order · ${totals ? price(totals.total) : ""}`}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
