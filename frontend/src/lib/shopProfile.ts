import { useEffect, useState } from "react";
import { client } from "../api/client.ts";
import type { ShopProfilePatch } from "../api/types.ts";
import { shopMock } from "../mocks/shopStore.ts";
import { shopPhoto } from "./images.ts";

export type ShopProfiles = Record<string, { description: string; photo: string | null }>;

let version = 0;
const listeners = new Set<() => void>();

/** Ask mounted shop cards to refetch after a shop edits its picture or description. */
export function shopProfilesChanged() {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Each shop's description and picture: the API's value, else what the shop saved in this browser. */
export function useShopProfiles(): ShopProfiles {
  const [profiles, setProfiles] = useState<ShopProfiles>({});
  const [tick, setTick] = useState(version);

  useEffect(() => {
    const listener = () => setTick(version);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    client
      .getShops()
      .catch(() => [])
      .then((listings) => {
        if (cancelled) return;
        const next: ShopProfiles = {};
        for (const listing of listings) {
          const local: ShopProfilePatch = shopMock.profile(listing.id);
          next[listing.id] = {
            description: listing.description ?? local.description ?? "",
            photo: listing.photo_url || local.photo_url || shopPhoto(listing.id),
          };
        }
        setProfiles(next);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return profiles;
}
