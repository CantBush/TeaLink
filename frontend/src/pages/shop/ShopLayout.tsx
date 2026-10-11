import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { client } from "../../api/client.ts";
import type { DrinkListing, ShopListing } from "../../api/types.ts";
import { isSignedIn } from "../../state/account.ts";
import { useRole, useShopId } from "../../state/role.ts";

interface ShopCatalog {
  shops: ShopListing[];
  drinks: DrinkListing[];
  error: string | null;
}

const CatalogContext = createContext<ShopCatalog>({ shops: [], drinks: [], error: null });

export function useShopCatalog(): ShopCatalog {
  return useContext(CatalogContext);
}

const TABS = [
  { to: "/shop", label: "Today", end: true },
  { to: "/shop/orders", label: "Orders", end: false },
  { to: "/shop/menu", label: "Menu", end: false },
  { to: "/shop/offers", label: "Offers", end: false },
  { to: "/shop/demand", label: "Demand", end: false },
  { to: "/shop/account", label: "Shop", end: false },
];

function tabClass(on: boolean): string {
  return on ? "bg-ink text-foam" : "text-ink/75 hover:text-ink";
}

export function ShopPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-xl space-y-6 px-5 py-6 sm:py-8">{children}</main>;
}

export function ShopLayout() {
  const role = useRole();
  const shopId = useShopId();
  const [catalog, setCatalog] = useState<ShopCatalog>({ shops: [], drinks: [], error: null });

  useEffect(() => {
    if (role !== "store" || !shopId) return;
    let cancelled = false;
    Promise.all([client.getShops(), client.getDrinks()])
      .then(([shops, drinks]) => {
        if (!cancelled) setCatalog({ shops, drinks, error: null });
      })
      .catch(() => {
        if (!cancelled) setCatalog({ shops: [], drinks: [], error: "Couldn't load shops and drinks." });
      });
    return () => {
      cancelled = true;
    };
  }, [role, shopId]);

  if (role !== "store" || !shopId) {
    if (isSignedIn()) return <Navigate to="/home" replace />;
    return <Navigate to="/welcome" replace />;
  }

  return (
    <CatalogContext.Provider value={catalog}>
      <nav aria-label="Shop" className="mx-auto hidden max-w-xl px-5 pt-6 md:block">
        <ul className="flex gap-1 rounded-full border border-line bg-foam p-1">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `block rounded-full px-2 py-2.5 text-center text-sm font-semibold ${tabClass(isActive)}`}
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
      <nav
        aria-label="Shop tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-foam/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-6 text-[11px] tracking-[0.06em] lowercase">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex min-h-14 items-center justify-center ${isActive ? "font-semibold text-ink" : "text-ink/55"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </CatalogContext.Provider>
  );
}
