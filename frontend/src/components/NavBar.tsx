import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useProfile } from "../state/social.ts";
import { Avatar } from "./Avatar.tsx";
import { BobaMark } from "./BobaMark.tsx";

/** The TeaLink tab owns these pages; see TeaLinkTabs. */
const TEALINK_PATHS = ["/", "/counterfactual", "/why", "/evidence"];

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
  const profilePath = profile ? `/u/${profile.handle}` : "/me";
  const quiz = pathname === "/welcome";

  const tabs: Tab[] = [
    { key: "home", to: "/home", label: "Home", icon: <HomeIcon />, active: (path) => path === "/home" },
    { key: "discover", to: "/discover", label: "Discover", icon: <SearchIcon />, active: (path) => path === "/discover" },
    { key: "tealink", to: "/", label: "TeaLink", icon: <BobaMark />, active: (path) => TEALINK_PATHS.includes(path) },
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
      <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-5 py-3 md:py-4">
          <NavLink to="/" className="flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
            <BobaMark />
            TeaLink
          </NavLink>
          <nav className="hidden items-center gap-1 text-sm font-semibold md:flex" aria-label="Main">
            {tabs.slice(0, 4).map((tab) => (
              <NavLink
                key={tab.key}
                to={tab.to}
                className={`rounded-full px-3.5 py-2 ${tab.active(pathname) ? "bg-ink text-foam" : "text-ink/75 hover:text-ink"}`}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to={profilePath} className="ml-auto flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="hidden md:inline">{profile?.display_name ?? "Profile"}</span>
            <Avatar avatar={profile?.avatar} size="sm" />
          </NavLink>
        </div>
      </header>

      <nav
        aria-label="Tabs"
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-foam/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden ${quiz ? "hidden" : ""}`}
      >
        <div className="mx-auto grid max-w-md grid-cols-5 text-[11px] font-semibold">
          {tabs.map((tab) => {
            const on = tab.active(pathname);
            const center = tab.key === "tealink";
            return (
              <NavLink
                key={tab.key}
                to={tab.to}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 ${on ? "text-amber" : "text-ink/70"}`}
              >
                <span
                  className={`grid place-items-center ${
                    center ? `-mt-5 h-12 w-12 rounded-full border-4 border-foam shadow ${on ? "bg-ink" : "bg-[#f0e2d0]"}` : "h-7"
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
