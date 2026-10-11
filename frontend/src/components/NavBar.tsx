import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "../state/account.ts";
import { useMe } from "../state/me.ts";
import { useRole } from "../state/role.ts";
import { useProfile } from "../state/social.ts";
import { Avatar } from "./Avatar.tsx";
import { BobaMark } from "./BobaMark.tsx";
import { NotificationBell } from "./NotificationBell.tsx";

/** The TeaLink tab owns these pages; see TeaLinkTabs. */
const TEALINK_PATHS = ["/", "/counter", "/why", "/evidence"];

const icon = "h-6 w-6";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 20V11M12 20V4M19 20v-6" strokeLinecap="round" />
    </svg>
  );
}

interface Tab {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  active: (path: string) => boolean;
}

export function NavBar() {
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const leave = () => {
    void signOut();
    navigate("/welcome");
  };
  const profilePath = profile ? `/u/${profile.handle}` : "/me";
  const role = useRole();
  const store = role === "store" || pathname === "/shop" || pathname.startsWith("/shop/");
  const me = useMe();
  const signedOut = role === null || (role === "customer" && !me);
  const hideTabs = pathname === "/welcome" || store || signedOut;

  const tabs: Tab[] = [
    { key: "home", to: "/home", label: "Home", icon: <HomeIcon />, active: (path) => path === "/home" },
    { key: "discover", to: "/discover", label: "Discover", icon: <SearchIcon />, active: (path) => path === "/discover" },
    { key: "tealink", to: "/", label: "TeaLink", icon: <BobaMark className="h-7 w-9" />, active: (path) => TEALINK_PATHS.includes(path) },
    { key: "stats", to: "/stats", label: "Stats", icon: <StatsIcon />, active: (path) => path === "/stats" },
    {
      key: "profile",
      to: profilePath,
      label: "Profile",
      icon: <Avatar avatar={profile?.avatar} size="xs" />,
      active: (path) => path === profilePath || path === "/me",
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-foam/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-5 py-3 sm:gap-x-6 md:gap-x-8 md:py-4">
          <NavLink
            to={store ? "/shop" : "/"}
            className="flex items-center gap-2 text-ink"
            aria-label={store ? "TeaLink shop" : "TeaLink home"}
          >
            <BobaMark className="h-9 w-12" />
          </NavLink>
          {store || hideTabs ? null : (
            <nav className="hidden items-center gap-7 text-[15px] tracking-[0.08em] lowercase md:flex" aria-label="Main">
              {tabs.slice(0, 4).map((tab) => (
                <NavLink
                  key={tab.key}
                  to={tab.to}
                  className={`border-b-[1.5px] py-1.5 ${
                    tab.active(pathname) ? "border-ink text-ink" : "border-transparent text-ink/60 hover:text-ink"
                  }`}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          )}
          {store || hideTabs ? (
            <span className="ml-auto" />
          ) : (
            <NavLink
              to="/orders"
              className={({ isActive }) =>
                `ml-auto text-[15px] tracking-[0.04em] lowercase ${isActive ? "text-ink" : "text-ink/60 hover:text-ink"}`
              }
            >
              Orders
            </NavLink>
          )}
          {store || hideTabs ? null : <NotificationBell />}
          {store || hideTabs ? null : (
            <NavLink to={profilePath} className="flex items-center gap-2 text-[15px] tracking-[0.04em] text-ink">
              <span className="hidden lowercase md:inline">{profile?.display_name ?? "profile"}</span>
              <Avatar avatar={profile?.avatar} size="sm" />
            </NavLink>
          )}
          {pathname === "/welcome" || signedOut ? null : (
            <button type="button" onClick={leave} className="text-[15px] tracking-[0.04em] lowercase text-ink/60 hover:text-ink">
              Log out
            </button>
          )}
        </div>
      </header>

      <nav
        aria-label="Tabs"
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-foam/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden ${hideTabs ? "hidden" : ""}`}
      >
        <div className="mx-auto grid max-w-md grid-cols-5 text-[11px] tracking-[0.06em] lowercase">
          {tabs.map((tab) => {
            const on = tab.active(pathname);
            const center = tab.key === "tealink";
            return (
              <NavLink
                key={tab.key}
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 ${on ? "font-semibold text-ink" : "text-ink/55"}`}
              >
                <span
                  className={`grid place-items-center ${
                    center
                      ? `-mt-5 h-12 w-12 rounded-full border-4 bg-sage text-ink ${on ? "border-ink" : "border-foam"}`
                      : "h-7"
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
