import { useEffect, useId, useMemo, useState } from "react";
import { getShops } from "../api/client.ts";
import { SHOP_IDS, shopLabel } from "../lib/format.ts";

let popularityLoad: Promise<Record<string, number>> | null = null;

/** Shop id → popularity (0..1) from GET /shops, fetched once. Empty if the API is down. */
function loadPopularity(): Promise<Record<string, number>> {
  popularityLoad ??= getShops()
    .then((shops) => Object.fromEntries(shops.map((shop) => [shop.id, shop.popularity ?? 0])))
    .catch(() => ({}));
  return popularityLoad;
}

/** How well `query` matches a shop name: the name starts with it, then a word does, then it appears anywhere. */
function rank(name: string, query: string): number {
  const lower = name.toLowerCase();
  if (lower.startsWith(query)) return 0;
  if (lower.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (lower.includes(query)) return 2;
  let at = 0;
  for (const char of query) {
    at = lower.indexOf(char, at);
    if (at < 0) return -1;
    at += 1;
  }
  return 3;
}

/** Type a shop name and pick it from suggestions: closest match first, then the more popular shop. */
export function ShopSearch({
  label,
  onPick,
  exclude = [],
}: {
  label: string;
  onPick: (shopId: string) => void;
  exclude?: string[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [popularity, setPopularity] = useState<Record<string, number>>({});
  const listId = useId();
  const typed = query.trim().toLowerCase();
  const open = typed.length > 0 || focused;

  useEffect(() => {
    let live = true;
    void loadPopularity().then((loaded) => live && setPopularity(loaded));
    return () => {
      live = false;
    };
  }, []);

  const matches = useMemo(() => {
    const busier = (a: { id: string; name: string }, b: { id: string; name: string }) =>
      (popularity[b.id] ?? 0) - (popularity[a.id] ?? 0) || a.name.localeCompare(b.name);
    const shops = SHOP_IDS.filter((id) => !exclude.includes(id)).map((id) => ({ id, name: shopLabel(id) }));
    if (!typed) return shops.sort(busier);
    return shops
      .map((shop) => ({ ...shop, score: rank(shop.name, typed) }))
      .filter((shop) => shop.score >= 0)
      .sort((a, b) => a.score - b.score || busier(a, b));
  }, [typed, exclude, popularity]);

  const pick = (shopId: string) => {
    setQuery("");
    setActive(0);
    onPick(shopId);
  };

  return (
    <div>
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && matches[active]) {
            event.preventDefault();
            pick(matches[active].id);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        placeholder="Type a shop name"
        className="min-h-11 w-full rounded-2xl border border-line bg-foam px-3 text-sm outline-none focus:border-moss"
      />
      {open ? (
        <ul id={listId} role="listbox" className="mt-1 overflow-hidden rounded-2xl border border-line bg-foam">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-mute">{typed ? "No shop by that name on TeaLink yet." : "Every shop is already picked."}</li>
          ) : (
            matches.slice(0, 5).map((shop, index) => (
              <li key={shop.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(shop.id)}
                  onMouseEnter={() => setActive(index)}
                  className={`block min-h-11 w-full px-3 text-left text-sm ${index === active ? "bg-sage font-semibold" : ""}`}
                >
                  {shop.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
