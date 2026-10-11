import { useMemo, useState, type FormEvent } from "react";
import { Teapot } from "./Doodles.tsx";
import type { Decision, TasteAttribute, WhatIf, WhatIfKind } from "../api/types.ts";
import { client } from "../api/client.ts";
import { whatif } from "../api/whatif.ts";
import { allDrinks } from "../lib/catalog.ts";
import { SHOP_IDS, TASTE_ORDER, attributeLabel, shopLabel } from "../lib/format.ts";
import { noteLabel } from "../lib/stats.ts";
import { KIND_LABEL, allFlavors, describeWhatIf, sameWhatIf } from "../lib/whatif.ts";
import { getSession, pushStatus, rerun, resetAll, toggleCritic, useSession } from "../state/session.ts";

const button =
  "rounded-full border border-ink/15 bg-cream px-4 py-2 text-sm font-semibold disabled:opacity-40";
const field = "min-h-11 rounded-2xl border border-line bg-foam px-3 text-sm outline-none focus:border-moss";

async function act(action: () => Promise<unknown>, note: string) {
  try {
    await action();
    rerun(note);
  } catch {
    pushStatus(`${note} (the API did not answer)`);
  }
}

const DRINK_KINDS: WhatIfKind[] = ["sold_out", "restock", "price"];
const SHOP_KINDS: WhatIfKind[] = ["shop_offline", "shop_online", "shop_join"];

/** Pick a kind, then a real target, and add it to the stack. */
function Builder({ defaultDrink, onAdd }: { defaultDrink: string; onAdd: (change: WhatIf) => void }) {
  const drinks = useMemo(() => [...allDrinks()].sort((a, b) => a.name.localeCompare(b.name)), []);
  const flavors = useMemo(() => allFlavors(), []);
  const [kind, setKind] = useState<WhatIfKind>("sold_out");
  const [drinkId, setDrinkId] = useState(defaultDrink || drinks[0]?.id || "");
  const [shopId, setShopId] = useState(SHOP_IDS[0]);
  const [tag, setTag] = useState(flavors[0] ?? "");
  const [attribute, setAttribute] = useState<TasteAttribute>("sweetness");
  const [direction, setDirection] = useState<"more" | "less">("less");
  const [dollars, setDollars] = useState("6");

  const amount = Number(dollars);
  const valid = !(kind === "max_price" || kind === "price") || (Number.isFinite(amount) && amount > 0 && amount < 50);

  const build = (): WhatIf => {
    if (kind === "sold_out" || kind === "restock") return { kind, drink_id: drinkId };
    if (kind === "price") return { kind, drink_id: drinkId, dollars: amount };
    if (kind === "shop_offline" || kind === "shop_online" || kind === "shop_join") return { kind, shop_id: shopId };
    if (kind === "avoid") return { kind, tag };
    if (kind === "taste") return { kind, attribute, direction };
    return { kind: "max_price", dollars: amount };
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Kind of change" value={kind} onChange={(event) => setKind(event.target.value as WhatIfKind)} className={field}>
        {(Object.keys(KIND_LABEL) as WhatIfKind[]).map((item) => (
          <option key={item} value={item}>
            {KIND_LABEL[item]}
          </option>
        ))}
      </select>
      {DRINK_KINDS.includes(kind) ? (
        <select aria-label="Drink" value={drinkId} onChange={(event) => setDrinkId(event.target.value)} className={`${field} max-w-full`}>
          {drinks.map((drink) => (
            <option key={drink.id} value={drink.id}>
              {drink.name} · {shopLabel(drink.shop_id)}
            </option>
          ))}
        </select>
      ) : null}
      {SHOP_KINDS.includes(kind) ? (
        <select aria-label="Shop" value={shopId} onChange={(event) => setShopId(event.target.value)} className={field}>
          {SHOP_IDS.map((id) => (
            <option key={id} value={id}>
              {shopLabel(id)}
            </option>
          ))}
        </select>
      ) : null}
      {kind === "avoid" ? (
        <select aria-label="Flavor" value={tag} onChange={(event) => setTag(event.target.value)} className={field}>
          {flavors.map((item) => (
            <option key={item} value={item}>
              {noteLabel(item).toLowerCase()}
            </option>
          ))}
        </select>
      ) : null}
      {kind === "taste" ? (
        <>
          <select aria-label="More or less" value={direction} onChange={(event) => setDirection(event.target.value as "more" | "less")} className={field}>
            <option value="less">less</option>
            <option value="more">more</option>
          </select>
          <select aria-label="Taste" value={attribute} onChange={(event) => setAttribute(event.target.value as TasteAttribute)} className={field}>
            {TASTE_ORDER.map((item) => (
              <option key={item} value={item}>
                {attributeLabel(item).toLowerCase()}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {kind === "max_price" || kind === "price" ? (
        <label className={`${field} flex items-center gap-1`}>
          <span className="text-mute">{kind === "max_price" ? "under $" : "now $"}</span>
          <input
            type="number"
            min="1"
            step="0.25"
            value={dollars}
            onChange={(event) => setDollars(event.target.value)}
            aria-label="Dollars"
            className="w-16 bg-transparent outline-none"
          />
        </label>
      ) : null}
      <button type="button" disabled={!valid} onClick={() => onAdd(build())} className={button}>
        Add
      </button>
    </div>
  );
}

export function ControlPanel({ decision, running }: { decision: Decision | null; running: boolean }) {
  const top = decision?.options?.[0] ?? null;
  const topShop = top?.shop_id ?? decision?.shop_id ?? "";
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState<WhatIf[]>([]);
  const [unclear, setUnclear] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<WhatIf[]>([]);
  const [applying, setApplying] = useState(false);
  const { critic } = useSession();

  const add = (changes: WhatIf[]) =>
    setPending((list) => [...list, ...changes.filter((change) => !list.some((item) => sameWhatIf(item, change)))]);

  const read = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setReading(true);
    whatif
      .parse(text)
      .then((result) => {
        add(result.changes);
        setUnclear((list) => [...list, ...result.not_understood.filter((item) => !list.includes(item))]);
        setText("");
      })
      .catch(() => setUnclear((list) => [...list, text]))
      .finally(() => setReading(false));
  };

  const replan = async () => {
    const { userId, profile } = getSession();
    const changes = pending;
    setApplying(true);
    setSkipped([]);
    try {
      const result = await whatif.apply(userId, profile, changes);
      setSkipped(result.skipped);
      setPending([]);
      setUnclear([]);
      if (result.applied.length) rerun(`You: ${result.applied.map(describeWhatIf).join("; ")}.`);
    } catch {
      pushStatus("Your changes didn't go through (the API did not answer).");
    } finally {
      setApplying(false);
    }
  };

  const busy = running || applying;

  return (
    <section className="rounded-[28px] border border-line bg-foam p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-2xl leading-none"><Teapot className="h-6 w-6 shrink-0 text-moss" />what if…</h2>
      <p className="mt-1 text-sm text-mute">
        Change something, then watch the agents re-plan your order. Each button starts a fresh round.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={busy || !top}
          onClick={() =>
            top && void act(() => client.setSoldOut(top.drink_id), `${top.drink_name} just sold out.`)
          }
        >
          #1 sells out
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || !topShop}
          onClick={() =>
            void act(() => client.shopOffline(topShop), `${shopLabel(topShop)}'s agent went offline.`)
          }
        >
          #1's shop goes offline
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => void act(() => client.shopJoin("lantern_leaf"), "Lantern Leaf just joined TeaLink.")}
        >
          Lantern Leaf joins
        </button>
        <button
          type="button"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream disabled:opacity-40"
          disabled={busy}
          onClick={() =>
            void act(
              () => client.setPreference(getSession().userId, { brown_sugar: 0 }),
              "You don't like brown sugar.",
            )
          }
        >
          I don't like brown sugar
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => void resetAll()}>
          Reset demo
        </button>
      </div>
      <div className="mt-4 flex w-fit items-center gap-3 text-sm">
        <button
          type="button"
          role="switch"
          aria-checked={critic}
          disabled={busy}
          onClick={toggleCritic}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${critic ? "bg-moss" : "bg-line"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-foam shadow transition-transform ${critic ? "translate-x-5" : ""}`}
          />
        </button>
        <span>
          <span className="font-semibold">Critic</span>
          <span className="text-mute"> challenges the #1 before it's final</span>
        </span>
      </div>

      <div className="mt-6 space-y-3 border-t border-line pt-5">
        <h3 className="font-display text-xl">your own change</h3>
        <form onSubmit={read} className="flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="e.g. taro is sold out at sharetea, and less sweet under $6"
            aria-label="Describe a change"
            className={`${field} min-w-0 flex-1 px-4`}
          />
          <button type="submit" disabled={reading || !text.trim()} className={button}>
            {reading ? "Reading…" : "Read it"}
          </button>
        </form>
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-moss">or build one from lists</summary>
          <div className="mt-3">
            <Builder defaultDrink={top?.drink_id ?? ""} onAdd={(change) => add([change])} />
          </div>
        </details>

        {unclear.length ? (
          <p className="text-sm text-mute">
            Not understood, so it won't be applied: {unclear.map((item) => `“${item}”`).join(", ")}
          </p>
        ) : null}

        {pending.length ? (
          <div className="space-y-3 rounded-3xl bg-sage p-4">
            <p className="text-sm">Check these before the agents re-plan. Nothing runs until you press the button.</p>
            <ul className="flex flex-wrap gap-2">
              {pending.map((change, index) => (
                <li key={index} className="flex items-center gap-1 rounded-full bg-foam py-1 pr-1 pl-3 text-sm font-semibold">
                  {describeWhatIf(change)}
                  <button
                    type="button"
                    aria-label={`Remove ${describeWhatIf(change)}`}
                    onClick={() => setPending((list) => list.filter((_, at) => at !== index))}
                    className="grid h-7 w-7 place-items-center rounded-full text-mute hover:bg-cream hover:text-ink"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() => void replan()}
              className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-cream disabled:opacity-40"
            >
              {applying ? "Re-planning…" : `Re-plan with ${pending.length === 1 ? "this change" : `these ${pending.length} changes`}`}
            </button>
          </div>
        ) : null}

        {skipped.length ? (
          <p className="text-sm text-mute">
            Not applied yet, because the API can't do these until custom what-ifs ship: {skipped.map(describeWhatIf).join(", ")}.
          </p>
        ) : null}
      </div>
    </section>
  );
}

