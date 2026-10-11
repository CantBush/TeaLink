import { social } from "../api/social.ts";
import type { UserProfile } from "../api/types.ts";
import { profilesChanged } from "../state/social.ts";
import { tint } from "./palette.ts";

export const CARD_COLORS: { color: string; name: string }[] = [
  { color: "#3d6b4f", name: "matcha" },
  { color: "#5f8a6b", name: "jade" },
  { color: "#8a9a5b", name: "sencha" },
  { color: "#7b5e3f", name: "hojicha" },
  { color: "#b0703c", name: "thai tea" },
  { color: "#8a6a9a", name: "taro" },
  { color: "#b5656f", name: "lychee rose" },
  { color: "#4f6f8a", name: "butterfly pea" },
  { color: "#15231b", name: "oolong" },
];

const key = (userId: string) => `tealink.card_color.${userId}`;

/** The card background you chose; the API value wins once it serves `card_color`. */
export function cardColor(profile: UserProfile): string {
  return profile.card_color ?? localStorage.getItem(key(profile.user_id)) ?? tint(profile.accent);
}

export function setCardColor(userId: string, color: string) {
  localStorage.setItem(key(userId), color);
  profilesChanged();
  void social
    .patchUser(userId, { card_color: color })
    .catch(() => undefined)
    .finally(profilesChanged);
}
