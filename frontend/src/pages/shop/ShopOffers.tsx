import { useCallback, useEffect, useState } from "react";
import { useStorePreview } from "../../api/http.ts";
import { shops } from "../../api/shops.ts";
import type { MenuSection, OfferRuleInput, OfferRuleKind, OfferRules, ShopDrink } from "../../api/types.ts";
import { useShopId } from "../../state/role.ts";
import { setAutoOffer, useAutoOffer } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const field = "rounded-full border border-line bg-foam px-3 py-2 text-sm";
const small = "rounded-full border border-line px-3 py-1.5 text-xs font-semibold";

const KINDS: { kind: OfferRuleKind; label: string }[] = [
  { kind: "max_discount", label: "Smaller discount cap" },
  { kind: "drinks", label: "Only certain drinks" },
  { kind: "sections", label: "Only certain menu sections" },
  { kind: "hours", label: "Only during certain hours" },
  { kind: "days", label: "Only on certain days" },
  { kind: "daily_limit", label: "At most N offers a day" },
];

const hour = (value: number) => `${value % 12 || 12}${value < 12 ? "am" : "pm"}`;

function defaultRule(kind: OfferRuleKind, cap: OfferRules["cap"]): OfferRuleInput {
  switch (kind) {
    case "max_discount":
      return { kind, enabled: true, value: { percent: Math.min(5, cap.percent), dollars: Math.min(0.5, cap.dollars) } };
    case "drinks":
      return { kind, enabled: true, value: { drink_ids: [] } };
    case "sections":
      return { kind, enabled: true, value: { section_ids: [] } };
    case "hours":
      return { kind, enabled: true, value: { start: 14, end: 17 } };
    case "days":
      return { kind, enabled: true, value: { days: [1, 2, 3, 4] } };
    case "daily_limit":
      return { kind, enabled: true, value: { count: 10 } };
  }
}

function describe(rule: OfferRuleInput, drinks: ShopDrink[], sections: MenuSection[]): string {
  switch (rule.kind) {
    case "max_discount":
      return `Discount at most ${rule.value.percent}% and $${rule.value.dollars.toFixed(2)}.`;
    case "drinks":
      return rule.value.drink_ids.length
        ? `Only on ${rule.value.drink_ids.map((id) => drinks.find((drink) => drink.id === id)?.name ?? id).join(", ")}.`
        : "Only on drinks you pick (none picked yet, so no offers).";
    case "sections":
      return rule.value.section_ids.length
        ? `Only on drinks in ${rule.value.section_ids.map((id) => sections.find((section) => section.id === id)?.name ?? id).join(", ")}.`
        : "Only in sections you pick (none picked yet, so no offers).";
    case "hours":
      return `Only between ${hour(rule.value.start)} and ${hour(rule.value.end)}.`;
    case "days":
      return rule.value.days.length ? `Only on ${rule.value.days.map((day) => DAYS[day]).join(", ")}.` : "On no days (no offers).";
    case "daily_limit":
      return `At most ${rule.value.count} ${rule.value.count === 1 ? "offer" : "offers"} a day.`;
  }
}

function Checklist({ items, chosen, onChange }: { items: { id: string; label: string }[]; chosen: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const on = chosen.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? chosen.filter((id) => id !== item.id) : [...chosen, item.id])}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold normal-case tracking-normal ${on ? "border-ink bg-ink text-foam" : "border-line bg-foam"}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RuleFields({
  rule,
  cap,
  drinks,
  sections,
  onChange,
}: {
  rule: OfferRuleInput;
  cap: OfferRules["cap"];
  drinks: ShopDrink[];
  sections: MenuSection[];
  onChange: (rule: OfferRuleInput) => void;
}) {
  switch (rule.kind) {
    case "max_discount":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          at most
          <input
            type="number"
            min={1}
            max={cap.percent}
            value={rule.value.percent}
            onChange={(event) => onChange({ ...rule, value: { ...rule.value, percent: Math.min(cap.percent, Math.max(1, Number(event.target.value))) } })}
            aria-label="Percent"
            className={`${field} w-20`}
          />
          % and $
          <input
            type="number"
            min={0.05}
            max={cap.dollars}
            step={0.05}
            value={rule.value.dollars}
            onChange={(event) => onChange({ ...rule, value: { ...rule.value, dollars: Math.min(cap.dollars, Math.max(0.05, Number(event.target.value))) } })}
            aria-label="Dollars"
            className={`${field} w-24`}
          />
        </div>
      );
    case "drinks":
      return (
        <Checklist
          items={drinks.map((drink) => ({ id: drink.id, label: drink.name }))}
          chosen={rule.value.drink_ids}
          onChange={(drink_ids) => onChange({ ...rule, value: { drink_ids } })}
        />
      );
    case "sections":
      return (
        <Checklist
          items={sections.map((section) => ({ id: section.id, label: section.name }))}
          chosen={rule.value.section_ids}
          onChange={(section_ids) => onChange({ ...rule, value: { section_ids } })}
        />
      );
    case "hours":
      return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          from
          <select value={rule.value.start} onChange={(event) => onChange({ ...rule, value: { ...rule.value, start: Number(event.target.value) } })} aria-label="Start" className={field}>
            {Array.from({ length: 24 }, (_, value) => (
              <option key={value} value={value}>
                {hour(value)}
              </option>
            ))}
          </select>
          to
          <select value={rule.value.end} onChange={(event) => onChange({ ...rule, value: { ...rule.value, end: Number(event.target.value) } })} aria-label="End" className={field}>
            {Array.from({ length: 24 }, (_, value) => (
              <option key={value} value={value}>
                {hour(value)}
              </option>
            ))}
          </select>
        </div>
      );
    case "days":
      return (
        <Checklist
          items={DAYS.map((day, index) => ({ id: String(index), label: day }))}
          chosen={rule.value.days.map(String)}
          onChange={(ids) => onChange({ ...rule, value: { days: ids.map(Number).sort() } })}
        />
      );
    case "daily_limit":
      return (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={1}
            max={100}
            value={rule.value.count}
            onChange={(event) => onChange({ ...rule, value: { count: Math.max(1, Number(event.target.value)) } })}
            aria-label="Offers per day"
            className={`${field} w-20`}
          />
          offers a day
        </div>
      );
  }
}

/** Close-call discounts: the platform's locked rules, plus rules you add on top. */
export function ShopOffers() {
  const shopId = useShopId() ?? "";
  const on = useAutoOffer(shopId);
  const preview = useStorePreview();
  const { shops: listings } = useShopCatalog();
  const shop = listings.find((item) => item.id === shopId);
  const [data, setData] = useState<{ rules: OfferRules; drinks: ShopDrink[]; sections: MenuSection[] } | null>(null);
  const [draft, setDraft] = useState<{ id: string | null; rule: OfferRuleInput } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([shops.rules(shopId), shops.menu(shopId)])
      .then(([rules, menu]) => setData({ rules, drinks: menu.drinks, sections: menu.sections }))
      .catch(() => setError("Couldn't load your rules."));
  }, [shopId]);

  useEffect(load, [load]);

  const act = (action: Promise<unknown>) =>
    void action.then(load).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Couldn't save that rule."));

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss">offers</p>
        <h1 className="mt-1 font-display text-4xl">close-call discounts</h1>
        <p className="mt-2 text-mute">
          {shop?.name ?? "Your shop"} can only offer a discount in a close call. Add your own rules to narrow when it happens.
          {preview ? " Your rules are saved in this browser until the API serves them." : ""}
        </p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-4 text-sm">{error}</p> : null}

      {data ? (
        <>
          <section>
            <h2 className="mb-2 font-display text-2xl">always on</h2>
            <ol className="space-y-2">
              {data.rules.platform.map((rule) => (
                <li key={rule.id} className="flex items-center gap-3 rounded-3xl border border-line bg-cream px-5 py-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Locked">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  <span>{rule.text}</span>
                </li>
              ))}
              <li className="flex items-center gap-3 rounded-3xl border border-line bg-cream px-5 py-3 text-sm text-mute">
                Never more than {data.rules.cap.percent}% or ${data.rules.cap.dollars.toFixed(2)}, and every offer is labelled for the customer.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="mb-2 font-display text-2xl">your rules</h2>
            {data.rules.rules.length === 0 ? <p className="text-sm text-mute">No rules yet, so any close call that passes the rules above can get an offer.</p> : null}
            <ul className="space-y-2">
              {data.rules.rules.map((rule) =>
                draft?.id === rule.id ? null : (
                  <li key={rule.id} className={`timeline-in flex flex-wrap items-center gap-3 rounded-3xl border border-line px-5 py-3 ${rule.enabled ? "bg-foam" : "bg-cream text-mute"}`}>
                    <span className="min-w-0 flex-1">{describe(rule, data.drinks, data.sections)}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label="Rule on"
                      onClick={() => act(shops.updateRule(shopId, rule.id, { enabled: !rule.enabled }))}
                      className={`relative h-6 w-11 shrink-0 rounded-full ${rule.enabled ? "bg-ink" : "bg-line"}`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-foam transition-all ${rule.enabled ? "left-6" : "left-1"}`} />
                    </button>
                    <button type="button" className={small} onClick={() => setDraft({ id: rule.id, rule: rule as OfferRuleInput })}>
                      Edit
                    </button>
                    <button type="button" className={small} onClick={() => act(shops.removeRule(shopId, rule.id))}>
                      Remove
                    </button>
                  </li>
                ),
              )}
            </ul>

            {draft ? (
              <form
                className="timeline-in mt-3 space-y-3 rounded-3xl border border-ink/70 bg-foam p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const { id, rule } = draft;
                  setDraft(null);
                  act(id ? shops.updateRule(shopId, id, rule) : shops.addRule(shopId, rule));
                }}
              >
                <p className="text-sm font-semibold">{KINDS.find((item) => item.kind === draft.rule.kind)?.label}</p>
                <RuleFields rule={draft.rule} cap={data.rules.cap} drinks={data.drinks} sections={data.sections} onChange={(rule) => setDraft({ ...draft, rule })} />
                <p className="text-xs text-mute">{describe(draft.rule, data.drinks, data.sections)}</p>
                <div className="flex gap-2">
                  <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-foam">
                    {draft.id ? "Save rule" : "Add rule"}
                  </button>
                  <button type="button" onClick={() => setDraft(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-mute">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <label className="mt-3 flex items-center gap-2">
                <span className="text-sm font-semibold">Add a rule</span>
                <select
                  value=""
                  onChange={(event) => event.target.value && setDraft({ id: null, rule: defaultRule(event.target.value as OfferRuleKind, data.rules.cap) })}
                  className={field}
                >
                  <option value="">choose…</option>
                  {KINDS.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>
        </>
      ) : (
        <p className="text-mute">Loading your rules…</p>
      )}

      <section className="flex items-center justify-between gap-4 rounded-[28px] border border-line bg-foam p-5">
        <div>
          <h2 className="font-display text-2xl">auto-offer</h2>
          <p className="mt-1 text-sm text-mute">
            {on ? "On in this browser. A discount still needs every rule above." : "Off in this browser. No discount is prepared."} Nothing is sent to the recommender.
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
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-foam transition-all ${on ? "left-7" : "left-1"}`} />
        </button>
      </section>
    </ShopPage>
  );
}
