import { useCallback, useEffect, useState } from "react";
import { useStorePreview } from "../../api/http.ts";
import { shops } from "../../api/shops.ts";
import type { DrinkInput, MenuSection, ShopDrink, TasteAttribute } from "../../api/types.ts";
import { TASTE_ORDER, attributeLabel, price } from "../../lib/format.ts";
import { drinkPhoto } from "../../lib/images.ts";
import { useShopId } from "../../state/role.ts";
import { ShopPage } from "./ShopLayout.tsx";

const small = "rounded-full border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-30";
const field = "w-full rounded-2xl border border-line bg-foam px-4 py-2.5 outline-none focus:border-moss";

const BLANK: DrinkInput = {
  name: "",
  price: 5,
  description: "",
  flavor_tags: [],
  attributes: { sweetness: 0.5, milkiness: 0.5, tea_intensity: 0.5, fruitiness: 0.2, toppings: 0.3 },
};

function DrinkEditor({
  drink,
  sections,
  sectionId,
  onSave,
  onRemove,
  onClose,
}: {
  drink: ShopDrink | null;
  sections: MenuSection[];
  sectionId: string;
  onSave: (input: DrinkInput, sectionId: string) => Promise<void>;
  onRemove?: () => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<DrinkInput>(drink ?? BLANK);
  const [tags, setTags] = useState((drink?.flavor_tags ?? []).join(", "));
  const [section, setSection] = useState(sectionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    action()
      .then(onClose)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't save.");
        setBusy(false);
      });
  };
  const setAttribute = (key: TasteAttribute, value: number) => setForm({ ...form, attributes: { ...form.attributes, [key]: value } });

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <form
        role="dialog"
        aria-modal
        aria-label={drink ? `Edit ${drink.name}` : "Add a drink"}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const flavor_tags = tags
            .split(",")
            .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "_"))
            .filter(Boolean);
          run(() => onSave({ ...form, name: form.name.trim(), flavor_tags }, section));
        }}
        className="max-h-[88vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-[32px] bg-foam p-6 sm:rounded-[32px]"
      >
        <h2 className="font-display text-3xl">{drink ? "edit drink" : "add a drink"}</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Name</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={60} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Price</span>
            <input
              type="number"
              min={0}
              step={0.05}
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
              required
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Section</span>
            <select value={section} onChange={(event) => setSection(event.target.value)} className={field}>
              {sections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Description</span>
          <textarea
            value={form.description ?? ""}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
            maxLength={200}
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Flavors</span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="brown sugar, oolong" className={field} />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">How it tastes</legend>
          <p className="mb-2 text-xs text-mute">The Taste agent matches these against what each customer likes.</p>
          {TASTE_ORDER.map((key) => (
            <label key={key} className="flex items-center gap-3 py-1 text-sm">
              <span className="w-24 shrink-0 text-mute">{attributeLabel(key)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={form.attributes[key]}
                onChange={(event) => setAttribute(key, Number(event.target.value))}
                className="flex-1 accent-[#3d6b4f]"
              />
            </label>
          ))}
        </fieldset>
        {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="submit" disabled={busy || !form.name.trim()} className="rounded-full bg-ink px-6 py-3 font-semibold text-foam disabled:opacity-40">
            {drink ? "Save" : "Add to menu"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-3 font-semibold text-mute">
            Cancel
          </button>
          {onRemove ? (
            <button type="button" disabled={busy} onClick={() => run(onRemove)} className="ml-auto rounded-full px-4 py-3 text-sm font-semibold text-[#b33]">
              Remove from menu
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/** Your menu: sections you can add, rename, reorder, and remove, and the drinks in them. */
export function ShopMenu() {
  const shopId = useShopId() ?? "";
  const preview = useStorePreview();
  const [menu, setMenu] = useState<{ drinks: ShopDrink[]; sections: MenuSection[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ drink: ShopDrink | null; sectionId: string } | null>(null);
  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    shops
      .menu(shopId)
      .then(setMenu)
      .catch(() => setError("Couldn't load your menu."));
  }, [shopId]);

  useEffect(load, [load]);

  const saveSections = (next: MenuSection[]) => {
    setMenu((current) => (current ? { ...current, sections: next } : current));
    shops
      .saveSections(shopId, next)
      .then(load)
      .catch(() => setError("Couldn't save your sections."));
  };

  if (!menu) {
    return <ShopPage>{error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : <p className="text-mute">Loading your menu…</p>}</ShopPage>;
  }

  const byId = new Map(menu.drinks.map((drink) => [drink.id, drink]));
  const move = (index: number, step: number) => {
    const next = [...menu.sections];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    saveSections(next.map((section, order) => ({ ...section, order })));
  };
  const moveDrink = (drinkId: string, toId: string) =>
    saveSections(
      menu.sections.map((section) => ({
        ...section,
        drink_ids:
          section.id === toId
            ? [...section.drink_ids.filter((id) => id !== drinkId), drinkId]
            : section.drink_ids.filter((id) => id !== drinkId),
      })),
    );
  const removeSection = (index: number) => {
    const [gone] = menu.sections.slice(index, index + 1);
    const rest = menu.sections.filter((_, at) => at !== index);
    rest[0] = { ...rest[0], drink_ids: [...rest[0].drink_ids, ...gone.drink_ids] };
    saveSections(rest);
  };

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss">menu</p>
        <h1 className="mt-1 font-display text-4xl">your drinks</h1>
        <p className="mt-1 text-mute">
          Edit drinks and sections here. Marking a drink sold out tells the agents right away.
          {preview ? " Other edits are saved in this browser until the API serves menus." : ""}
        </p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-4 text-sm">{error}</p> : null}

      {menu.sections.map((section, index) => (
        <section key={section.id} className="timeline-in overflow-hidden rounded-[28px] border border-line bg-foam">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {renaming?.id === section.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (renaming.name.trim())
                    saveSections(menu.sections.map((item) => (item.id === section.id ? { ...item, name: renaming.name.trim() } : item)));
                  setRenaming(null);
                }}
              >
                <input
                  autoFocus
                  value={renaming.name}
                  onChange={(event) => setRenaming({ id: section.id, name: event.target.value })}
                  maxLength={30}
                  aria-label="Section name"
                  className="min-w-0 flex-1 rounded-full border border-line px-3 py-1.5"
                />
                <button type="submit" className={small}>
                  Save
                </button>
              </form>
            ) : (
              <h2 className="min-w-0 flex-1 truncate font-display text-2xl">{section.name}</h2>
            )}
            {renaming?.id === section.id ? null : (
              <>
                <button type="button" className={small} onClick={() => setRenaming({ id: section.id, name: section.name })}>
                  Rename
                </button>
                <button type="button" className={small} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${section.name} up`}>
                  ↑
                </button>
                <button
                  type="button"
                  className={small}
                  disabled={index === menu.sections.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${section.name} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={small}
                  disabled={menu.sections.length === 1}
                  onClick={() => removeSection(index)}
                  title="Its drinks move to the first section"
                >
                  Remove
                </button>
              </>
            )}
          </div>
          <ul className="divide-y divide-line">
            {section.drink_ids.map((drinkId) => {
              const drink = byId.get(drinkId);
              if (!drink) return null;
              const photo = drink.photo_url || drinkPhoto(drink.id);
              return (
                <li key={drink.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {photo ? <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-2xl bg-sage" />}
                  <button type="button" onClick={() => setEditing({ drink, sectionId: section.id })} className="min-w-0 flex-1 text-left normal-case">
                    <span className="block truncate font-semibold tracking-normal">{drink.name}</span>
                    <span className="text-sm tracking-normal text-mute">
                      {price(drink.price)}
                      {drink.available ? "" : " · sold out"}
                    </span>
                  </button>
                  <select
                    value={section.id}
                    onChange={(event) => moveDrink(drink.id, event.target.value)}
                    aria-label={`Section for ${drink.name}`}
                    className="max-w-28 rounded-full border border-line bg-foam px-2 py-1.5 text-xs"
                  >
                    {menu.sections.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={`${small} ${drink.available ? "" : "border-ink bg-ink text-foam"}`}
                    onClick={() =>
                      void shops
                        .updateDrink(shopId, drink.id, { available: !drink.available })
                        .then(load)
                        .catch(() => setError("Couldn't update that drink."))
                    }
                  >
                    {drink.available ? "Sold out" : "Restock"}
                  </button>
                </li>
              );
            })}
            {section.drink_ids.length === 0 ? <li className="px-4 py-3 text-sm text-mute">No drinks here yet.</li> : null}
          </ul>
          <button type="button" onClick={() => setEditing({ drink: null, sectionId: section.id })} className="w-full border-t border-line px-4 py-3 text-left text-sm font-semibold text-moss">
            + Add a drink to {section.name}
          </button>
        </section>
      ))}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newSection.trim()) return;
          saveSections([...menu.sections, { id: "", name: newSection.trim(), order: menu.sections.length, drink_ids: [] }]);
          setNewSection("");
        }}
      >
        <input
          value={newSection}
          onChange={(event) => setNewSection(event.target.value)}
          placeholder="New section, e.g. seasonal"
          maxLength={30}
          aria-label="New section name"
          className="min-w-0 flex-1 rounded-full border border-line bg-foam px-4 py-2.5"
        />
        <button type="submit" disabled={!newSection.trim()} className="rounded-full bg-ink px-5 text-sm font-semibold text-foam disabled:opacity-40">
          Add section
        </button>
      </form>

      {editing ? (
        <DrinkEditor
          drink={editing.drink}
          sections={menu.sections}
          sectionId={editing.sectionId}
          onClose={() => setEditing(null)}
          onSave={async (input, sectionId) => {
            const saved = editing.drink ? await shops.updateDrink(shopId, editing.drink.id, input) : await shops.addDrink(shopId, input);
            const current = await shops.menu(shopId);
            const placed = current.sections.find((section) => section.drink_ids.includes(saved.id));
            if (placed?.id !== sectionId) {
              await shops.saveSections(
                shopId,
                current.sections.map((section) => ({
                  ...section,
                  drink_ids:
                    section.id === sectionId
                      ? [...section.drink_ids.filter((id) => id !== saved.id), saved.id]
                      : section.drink_ids.filter((id) => id !== saved.id),
                })),
              );
            }
            load();
          }}
          onRemove={
            editing.drink
              ? async () => {
                  await shops.removeDrink(shopId, editing.drink!.id);
                  load();
                }
              : undefined
          }
        />
      ) : null}
    </ShopPage>
  );
}
