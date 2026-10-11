import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "../state/me.ts";
import { useRole } from "../state/role.ts";

/** Customer routes: stores go to their own pages, and nobody gets in without signing in. */
export function CustomerOnly() {
  const role = useRole();
  const me = useMe();
  if (role === "store") return <Navigate to="/shop" replace />;
  if (role !== "customer" || !me) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}
