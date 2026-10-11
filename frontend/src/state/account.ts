import { auth } from "../api/auth.ts";
import type { Account } from "../api/types.ts";
import { logOut } from "./logout.ts";
import { getMe, setMe } from "./me.ts";
import { getRole, getShopId, setRole, setShopId } from "./role.ts";
import { switchUser } from "./session.ts";
import { profilesChanged } from "./social.ts";

/** A customer with a user id, or a store with a shop. Nothing else gets past `/welcome`. */
export function isSignedIn(): boolean {
  const role = getRole();
  if (role === "store") return Boolean(getShopId());
  return role === "customer" && Boolean(getMe());
}

export function signIn(account: Account) {
  setRole(account.role);
  if (account.role === "store" && account.shop_id) {
    setShopId(account.shop_id);
    return;
  }
  setMe(account.user_id);
  switchUser();
  profilesChanged();
}

/** Clears this browser first so `/welcome` opens on sign in, then ends the server session. */
export async function signOut() {
  logOut();
  await auth.logout().catch(() => undefined);
}

/** On load: if the API serves sessions and says ours is gone, sign this browser out too. */
export async function verifySession() {
  const live = await auth.me();
  if (live === null && isSignedIn()) logOut();
  if (!live) return;
  const same = live.role === getRole() && (live.role === "store" ? live.shop_id === getShopId() : live.user_id === getMe());
  if (!same) signIn(live);
}
