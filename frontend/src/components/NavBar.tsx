import { NavLink } from "react-router-dom";
import { BobaMark } from "./BobaMark.tsx";

function itemClass(active: boolean): string {
  return active
    ? "text-amber"
    : "text-ink/75 hover:text-ink";
}

export function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <NavLink to="/" className="flex items-center gap-2 font-display text-2xl tracking-tight text-ink">
          <BobaMark />
          TeaLink
        </NavLink>
        <nav className="flex items-center gap-5 text-sm font-semibold">
          <NavLink to="/" end className={({ isActive }) => itemClass(isActive)}>
            Discover
          </NavLink>
          <NavLink to="/friends" className={({ isActive }) => itemClass(isActive)}>
            Friends
          </NavLink>
          <a href="/#taste" className="text-ink/75 hover:text-ink">
            My Taste
          </a>
        </nav>
        <p className="ml-auto text-sm font-semibold text-ink">Andrew</p>
      </div>
    </header>
  );
}
