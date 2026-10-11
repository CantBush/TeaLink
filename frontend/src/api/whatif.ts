import { parseWhatIfText } from "../lib/whatif.ts";
import { client } from "./client.ts";
import { Unavailable, request } from "./http.ts";
import type { TasteProfile, WhatIf, WhatIfParse } from "./types.ts";

/** How far one "sweeter" or "less milky" moves that attribute of your profile, on its 0–1 scale. */
const TASTE_STEP = 0.3;

export interface WhatIfResult {
  applied: WhatIf[];
  /** Kinds the API can't apply yet. Shown, never silently dropped. */
  skipped: WhatIf[];
}

/** Until `POST /whatif` is served, the kinds the existing event routes already cover. */
async function applyWithEvents(userId: string, profile: TasteProfile, changes: WhatIf[]): Promise<WhatIfResult> {
  const applied: WhatIf[] = [];
  const skipped: WhatIf[] = [];
  const overrides: Record<string, number> = {};
  for (const change of changes) {
    switch (change.kind) {
      case "sold_out":
        await client.setSoldOut(change.drink_id);
        break;
      case "shop_offline":
        await client.shopOffline(change.shop_id);
        break;
      case "shop_join":
      case "shop_online":
        await client.shopJoin(change.shop_id);
        break;
      case "avoid":
        overrides[change.tag] = 0;
        break;
      case "taste": {
        const step = change.direction === "more" ? TASTE_STEP : -TASTE_STEP;
        overrides[change.attribute] = Math.min(1, Math.max(0, profile[change.attribute] + step));
        break;
      }
      default:
        skipped.push(change);
        continue;
    }
    applied.push(change);
  }
  if (Object.keys(overrides).length) await client.setPreference(userId, overrides);
  return { applied, skipped };
}

export const whatif = {
  parse: async (text: string): Promise<WhatIfParse> => {
    try {
      return await request<WhatIfParse>("POST", "/whatif/parse", { text });
    } catch (error) {
      if (error instanceof Unavailable) return parseWhatIfText(text);
      throw error;
    }
  },

  apply: async (userId: string, profile: TasteProfile, changes: WhatIf[]): Promise<WhatIfResult> => {
    try {
      const body = await request<{ ok: boolean; applied: WhatIf[] }>("POST", "/whatif", { user_id: userId, changes });
      return { applied: body.applied, skipped: [] };
    } catch (error) {
      if (error instanceof Unavailable) return applyWithEvents(userId, profile, changes);
      throw error;
    }
  },
};
