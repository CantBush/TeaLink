import { NavLink, useLocation } from "react-router-dom";
import { useProfile } from "../state/social.ts";
import { Avatar } from "./Avatar.tsx";
import { BobaMark } from "./BobaMark.tsx";

function itemClass(active: boolean): string {
  return active ? "text-amber" : "text-ink/75 hover:text-ink";
}

const DESKTOP_LINKS = [
  { to: "/home", label: "Home" },
  { to: "/", label: "Discover", end: true },
  { to: "/counterfactual", label: "What changed" },
  { to: "/friends", label: "Friends" },
  { to: "/evidence", label: "Evidence" },
];

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 4h10l-1.5 16a1 1 0 0 1-1 .9h-5a1 1 0 0 1-1-.9z" strokeLinejoin="round" />
      <path d="M6 8h12M13 4l2-2" strokeLinecap="round" />
      <circle cx="10" cy="16" r="1" fill="currentColor" />
      <circle cx="13.5" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function NavBar() {
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const profilePath = profile ? `/u/${profile.handle}` : "/me";
  const quiz = pathname === "/welcome";

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-5 py-3 md:py-4">
          <NavLink to="/home" className="flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
            <BobaMark />
            TeaLink
          </NavLink>
          <nav className="hidden items-center gap-5 text-sm font-semibold md:flex">
            {DESKTOP_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => itemClass(isActive)}>
                {link.label}
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
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-foam/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden ${quiz ? "hidden" : ""}`}
      >
        <div className="mx-auto grid max-w-md grid-cols-3 text-xs font-semibold">
          <NavLink to="/home" className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 ${itemClass(isActive)}`}>
            <HomeIcon />
            Home
          </NavLink>
          <NavLink to="/" end className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 ${itemClass(isActive)}`}>
            <DiscoverIcon />
            Discover
          </NavLink>
          <NavLink
            to={profilePath}
            className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 ${itemClass(isActive)}`}
          >
            <Avatar avatar={profile?.avatar} size="sm" />
            Profile
          </NavLink>
        </div>
      </nav>
    </>
  );
}
