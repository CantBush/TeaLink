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

/** Shrink an uploaded photo so it fits in a request and in browser storage. */
export function resizePhoto(file: File, maxSide = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    image.onerror = () => reject(new Error("That file isn't an image we can read."));
    image.src = URL.createObjectURL(file);
  });
}
