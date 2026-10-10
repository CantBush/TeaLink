import { clearMe } from "./me.ts";
import { clearRole } from "./role.ts";
import { clearShopLocal } from "./shopLocal.ts";

/** Clear this browser's account so the customer-or-store step shows again. */
export function logOut() {
  clearMe();
  clearRole();
  clearShopLocal();
}
