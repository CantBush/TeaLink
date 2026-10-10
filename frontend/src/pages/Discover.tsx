import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { social } from "../api/social.ts";
import type { FeedItem, UserProfile } from "../api/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { PreviewNote } from "../components/PreviewNote.tsx";
import { TasteBars } from "../components/TasteBars.tsx";
import { SendRec } from "../components/SendRec.tsx";
import { type CatalogDrink, type DrinkBase, allDrinks, drinkBase, drinkInfo } from "../lib/catalog.ts";
import { SHOP_IDS, matchPercent, price, shopLabel } from "../lib/format.ts";
import { drinkPhoto, shopPhoto } from "../lib/images.ts";
import { noteLabel } from "../lib/stats.ts";
import { useMe } from "../state/me.ts";
import { profilesChanged } from "../state/social.ts";

type Scope = "all" | "drinks" | "shops" | "people";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drinks", label: "Drinks" },
  { id: "shops", label: "Shops" },
  { id: "people", label: "People" },
];

const BASES: { id: DrinkBase; label: string }[] = [
  { id: "milk", label: "Milk tea" },
  { id: "fruit", label: "Fruit tea" },
  { id: "tea", label: "Tea-forward" },
];

const BASE_LABEL: Record<DrinkBase, string> = { milk: "Milk tea", fruit: "Fruit tea", tea: "Tea-forward" };
const FLAVORS = ["brown_sugar", "oolong", "matcha", "taro", "thai_tea", "hojicha", "jasmine", "fruit"];

function matches(text: string, query: string): boolean {
  return text.toLowerCase().includes(query);
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
        on ? "border-ink bg-ink text-foam" : "border-line bg-foam text-ink/80 hover:border-ink/40"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children, count }: { children: string; count: number }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 font-display text-2xl">
      {children}
      <span className="font-sans text-sm font-semibold text-mute">{count}</span>
    </h2>
  );
}

function DrinkRow({ drink, onOpen }: { drink: CatalogDrink; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 py-3 text-left">
        <img src={drinkPhoto(drink.id) ?? ""} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">{drink.name}</span>
          <span className="block truncate text-sm text-mute">
            {shopLabel(drink.shop_id)} · {BASE_LABEL[drinkBase(drink)]}
          </span>
        </span>
        <span className="shrink-0 font-semibold">{price(drink.price)}</span>
      </button>
    </li>
  );
}

function PersonCard({ person, onFollow }: { person: UserProfile; onFollow: () => void }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Link to={`/u/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar avatar={person.avatar} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{person.display_name}</span>
          <span className="block truncate text-sm text-mute">
            {person.stats.personality ?? `@${person.handle}`}
            {person.taste_match !== null ? ` · ${matchPercent(person.taste_match)}% match` : ""}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onFollow}
        className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
          person.followed_by_me ? "border border-line text-ink" : "bg-ink text-foam"
        }`}
      >
        {person.followed_by_me ? "Following" : "Follow"}
      </button>
    </li>
  );
}

function DrinkSheet({ drink, reviews, onClose }: { drink: CatalogDrink; reviews: FeedItem[]; onClose: () => void }) {
  const [sharing, setSharing] = useState(false);
  if (sharing) return <SendRec drinkId={drink.id} onClose={onClose} />;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal
        aria-label={drink.name}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-foam p-6 sm:rounded-[32px]"
      >
        <img src={drinkPhoto(drink.id) ?? ""} alt={drink.name} className="-mx-6 -mt-6 mb-5 aspect-[4/3] w-[calc(100%+3rem)] max-w-none object-cover" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl leading-tight">{drink.name}</h2>
            <p className="mt-1 text-mute">
              {shopLabel(drink.shop_id)} · {price(drink.price)} · {BASE_LABEL[drinkBase(drink)]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-sm font-semibold text-mute" aria-label="Close">
            Close
          </button>
        </div>
        {drink.flavor_tags.length ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {drink.flavor_tags.map((tag) => (
              <li key={tag} className="rounded-full bg-[#f0e2d0] px-3 py-1 text-sm font-semibold">
                {noteLabel(tag)}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={() => setSharing(true)}
          className="mt-5 min-h-11 w-full rounded-full border border-ink font-semibold text-ink"
        >
          Send to a friend
        </button>

        <h3 className="mt-6 mb-3 font-display text-xl">How it tastes</h3>
        <TasteBars profile={drink.attributes} />

        <h3 className="mt-6 mb-2 font-display text-xl">From people you follow</h3>
        {reviews.length === 0 ? (
          <p className="text-[15px] text-mute">Nobody you follow has reviewed this yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <Avatar avatar={item.author.avatar} size="sm" />
                <p className="text-[15px]">
                  <span className="font-semibold">{item.author.display_name}</span>{" "}
                  <span className="text-amber">{"★".repeat(item.rating ?? 0)}</span>
                  {item.text ? <span className="block text-ink/80">{item.text}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function Discover() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const scope = (params.get("scope") as Scope | null) ?? "all";
  const [base, setBase] = useState<DrinkBase | null>(null);
  const [cheap, setCheap] = useState(false);
  const [flavor, setFlavor] = useState<string | null>(null);
  const [shop, setShop] = useState<string | null>(null);
  const [open, setOpenState] = useState<CatalogDrink | null>(() => drinkInfo(params.get("drink")));
  const setOpen = (drink: CatalogDrink | null) => {
    setOpenState(drink);
    if (!drink && params.has("drink")) {
      const copy = new URLSearchParams(params);
      copy.delete("drink");
      setParams(copy, { replace: true });
    }
  };
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    social
      .listUsers(me)
      .then((users) => {
        if (!cancelled) setPeople(users);
      })
      .catch(() => {});
    social
      .getFeed(me)
      .then((items) => {
        if (!cancelled) setFeed(items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me]);

  const q = query.trim().toLowerCase();
  const setScope = (next: Scope) => {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("scope");
    else copy.set("scope", next);
    setParams(copy, { replace: true });
  };

  const drinks = useMemo(
    () =>
      allDrinks().filter(
        (drink) =>
          (!q ||
            matches(drink.name, q) ||
            matches(shopLabel(drink.shop_id), q) ||
            drink.flavor_tags.some((tag) => matches(noteLabel(tag), q))) &&
          (!base || drinkBase(drink) === base) &&
          (!cheap || drink.price < 5) &&
          (!flavor || drink.flavor_tags.includes(flavor)) &&
          (!shop || drink.shop_id === shop),
      ),
    [q, base, cheap, flavor, shop],
  );

  const shops = SHOP_IDS.filter((id) => !q || matches(shopLabel(id), q) || allDrinks().some((d) => d.shop_id === id && matches(d.name, q)));
  const folks = people.filter(
    (person) =>
      !q || matches(person.display_name, q) || matches(person.handle, q) || matches(person.stats.personality ?? "", q),
  );

  const follow = (person: UserProfile) => {
    const on = !person.followed_by_me;
    setPeople((list) => list.map((item) => (item.user_id === person.user_id ? { ...item, followed_by_me: on } : item)));
    void social.follow(person.user_id, me, on).then(() => profilesChanged());
  };

  const reviewsOf = (drinkId: string) => feed.filter((item) => item.kind === "review" && item.drink_id === drinkId);
  const show = (part: Scope) => scope === "all" || scope === part;
  const limit = (count: number) => (scope === "all" ? count : Infinity);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-6 sm:py-8">
      <PreviewNote />
      <header>
        <h1 className="font-display text-4xl">Discover</h1>
        <label className="mt-4 flex items-center gap-3 rounded-full border border-line bg-foam px-5 focus-within:border-amber">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search drinks, shops, or people"
            aria-label="Search"
            className="w-full bg-transparent py-3.5 text-[17px] outline-none"
          />
        </label>
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Show">
          {SCOPES.map((item) => (
            <Chip key={item.id} on={scope === item.id} onClick={() => setScope(item.id)}>
              {item.label}
            </Chip>
          ))}
        </div>
      </header>

      {show("people") && folks.length ? (
        <section>
          <SectionTitle count={folks.length}>People</SectionTitle>
          <ul className="divide-y divide-line">
            {folks.slice(0, limit(4)).map((person) => (
              <PersonCard key={person.user_id} person={person} onFollow={() => follow(person)} />
            ))}
          </ul>
          {scope === "all" && folks.length > 4 ? (
            <button type="button" onClick={() => setScope("people")} className="mt-1 min-h-11 text-sm font-semibold text-amber">
              See all {folks.length} people
            </button>
          ) : null}
        </section>
      ) : null}

      {show("shops") && shops.length ? (
        <section>
          <SectionTitle count={shops.length}>Shops</SectionTitle>
          <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {shops.map((id) => {
              const menu = allDrinks().filter((drink) => drink.shop_id === id);
              const low = Math.min(...menu.map((drink) => drink.price));
              const high = Math.max(...menu.map((drink) => drink.price));
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShop(shop === id ? null : id);
                      setScope("drinks");
                    }}
                    className={`block w-52 overflow-hidden rounded-3xl border text-left ${shop === id ? "border-ink" : "border-line"} bg-foam`}
                  >
                    <img src={shopPhoto(id) ?? ""} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    <span className="block px-4 pt-3 font-display text-lg leading-tight">{shopLabel(id)}</span>
                    <span className="block px-4 pb-3 text-sm text-mute">
                      {menu.length} drinks · {price(low)}–{price(high)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {show("drinks") ? (
        <section>
          <SectionTitle count={drinks.length}>Drinks</SectionTitle>
          <div className="-mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1">
            {shop ? (
              <Chip on onClick={() => setShop(null)}>
                {`${shopLabel(shop)} ×`}
              </Chip>
            ) : null}
            {BASES.map((item) => (
              <Chip key={item.id} on={base === item.id} onClick={() => setBase(base === item.id ? null : item.id)}>
                {item.label}
              </Chip>
            ))}
            <Chip on={cheap} onClick={() => setCheap(!cheap)}>
              Under $5
            </Chip>
            {FLAVORS.map((tag) => (
              <Chip key={tag} on={flavor === tag} onClick={() => setFlavor(flavor === tag ? null : tag)}>
                {noteLabel(tag)}
              </Chip>
            ))}
          </div>
          {drinks.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-mute">No drinks match. Try removing a filter.</p>
          ) : (
            <ul className="divide-y divide-line">
              {drinks.slice(0, limit(8)).map((drink) => (
                <DrinkRow key={drink.id} drink={drink} onOpen={() => setOpen(drink)} />
              ))}
            </ul>
          )}
          {scope === "all" && drinks.length > 8 ? (
            <button type="button" onClick={() => setScope("drinks")} className="mt-1 min-h-11 text-sm font-semibold text-amber">
              See all {drinks.length} drinks
            </button>
          ) : null}
        </section>
      ) : null}

      {q && !drinks.length && !shops.length && !folks.length ? (
        <p className="py-10 text-center text-mute">Nothing matches “{query}”.</p>
      ) : null}

      {open ? <DrinkSheet drink={open} reviews={reviewsOf(open.id)} onClose={() => setOpen(null)} /> : null}
    </main>
  );
}
