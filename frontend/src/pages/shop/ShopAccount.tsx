import { useState } from "react";
import { useStorePreview } from "../../api/http.ts";
import { shops } from "../../api/shops.ts";
import { shopPhoto } from "../../lib/images.ts";
import { resizePhoto } from "../../lib/photo.ts";
import { shopProfilesChanged, useShopProfiles } from "../../lib/shopProfile.ts";
import { useShopId } from "../../state/role.ts";
import { setShopOnline, useShopOnline } from "../../state/shopLocal.ts";
import { ShopPage, useShopCatalog } from "./ShopLayout.tsx";

const STOREFRONTS = ["kungfu", "sunright", "tigersugar", "boba_guys", "sharetea", "lantern_leaf"];

/** Your shop's picture and description (shown on Discover), plus the online switch. */
export function ShopAccount() {
  const shopId = useShopId() ?? "";
  const online = useShopOnline(shopId);
  const preview = useStorePreview();
  const { shops: listings, error } = useShopCatalog();
  const shop = listings.find((item) => item.id === shopId);
  const saved = useShopProfiles()[shopId];
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [description, setDescription] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownPhoto = photo === undefined ? (saved?.photo ?? shopPhoto(shopId)) : photo;
  const shownDescription = description ?? saved?.description ?? "";
  const dirty = photo !== undefined || description !== undefined;

  const save = () => {
    setBusy(true);
    setStatus(null);
    shops
      .updateProfile(shopId, {
        ...(photo !== undefined ? { photo_url: photo } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
      })
      .then(() => {
        shopProfilesChanged();
        setPhoto(undefined);
        setDescription(undefined);
        setStatus("Saved. Customers see it on Discover.");
      })
      .catch((reason: unknown) => setStatus(reason instanceof Error ? reason.message : "Couldn't save."))
      .finally(() => setBusy(false));
  };

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss">shop</p>
        <h1 className="mt-1 font-display text-4xl leading-tight">{shop?.name ?? "Your shop"}</h1>
        {shop ? <p className="mt-1 text-lg text-mute">{shop.neighborhood}</p> : null}
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}

      <section className="space-y-4 rounded-[28px] border border-line bg-foam p-5">
        <h2 className="font-display text-2xl">how customers see you</h2>
        {shownPhoto ? <img src={shownPhoto} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover" /> : <div className="aspect-[4/3] w-full rounded-3xl bg-sage" />}
        <div>
          <p className="mb-2 text-sm font-semibold">Picture</p>
          <div className="flex flex-wrap gap-2">
            {STOREFRONTS.map((id) => {
              const src = shopPhoto(id)!;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPhoto(src)}
                  aria-label={`Use storefront photo ${id}`}
                  className={`h-14 w-14 overflow-hidden rounded-2xl ${shownPhoto === src ? "ring-2 ring-ink ring-offset-2" : ""}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
            <label className="grid h-14 w-14 cursor-pointer place-items-center rounded-2xl border border-dashed border-ink/40 text-xs text-mute" title="Upload a photo">
              upload
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) resizePhoto(file).then(setPhoto, (reason: Error) => setStatus(reason.message));
                }}
              />
            </label>
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Description</span>
          <textarea
            value={shownDescription}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={240}
            placeholder="What you're known for, in a sentence or two."
            className="w-full rounded-2xl border border-line bg-foam px-4 py-3 outline-none focus:border-moss"
          />
          <span className="mt-1 block text-right text-xs text-mute">{shownDescription.length}/240</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || busy} className="rounded-full bg-ink px-6 py-2.5 font-semibold text-foam disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
          {status ? <p className="text-sm text-mute">{status}</p> : null}
        </div>
        {preview ? <p className="text-xs text-mute">Saved in this browser until the API accepts shop pictures and descriptions.</p> : null}
      </section>

      <section className="flex items-center justify-between gap-4 rounded-[28px] border border-line bg-foam p-5">
        <div>
          <h2 className="font-display text-2xl">{online ? "online" : "offline"}</h2>
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
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-foam transition-all ${online ? "left-7" : "left-1"}`} />
        </button>
      </section>
    </ShopPage>
  );
}
