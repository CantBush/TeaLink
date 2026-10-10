import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../../api/client.ts";
import type { ShopListing } from "../../api/types.ts";
import { Shell } from "../../components/OnboardingShell.tsx";
import { shopPhoto } from "../../lib/images.ts";
import { setShopId } from "../../state/role.ts";

/** Every shop from GET /shops, including ones that have not joined yet. */
export function ShopPicker() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<ShopListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getShops()
      .then((list) => {
        if (!cancelled) setShops(list);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load shops.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (id: string) => {
    setShopId(id);
    navigate("/shop");
  };

  return (
    <Shell>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">Which shop is yours?</h1>
      <p className="mt-3 text-lg text-mute">Pick one. This stays on this browser and does not create a customer profile.</p>
      {error ? <p className="mt-6 rounded-3xl border border-line bg-foam p-6">{error}</p> : null}
      {shops === null && !error ? <p className="mt-8 text-mute">Loading shops…</p> : null}
      <ul className="mt-8 grid gap-3">
        {shops?.map((shop) => {
          const photo = shop.photo_url || shopPhoto(shop.id);
          return (
            <li key={shop.id}>
              <button
                type="button"
                onClick={() => choose(shop.id)}
                className="flex w-full items-center gap-4 rounded-3xl border-2 border-line bg-foam px-4 py-3 text-left hover:border-ink/30"
              >
                {photo ? <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" /> : null}
                <span>
                  <span className="block font-display text-2xl leading-tight">{shop.name}</span>
                  <span className="block text-mute">{shop.neighborhood}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
