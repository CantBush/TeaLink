import { Navigate, Outlet } from "react-router-dom";
import { useRole } from "../state/role.ts";

/** Customer pages. A store account always lands on its own dashboard instead. */
export function CustomerOnly() {
  const role = useRole();
  if (role === "store") return <Navigate to="/shop" replace />;
  return <Outlet />;
}
