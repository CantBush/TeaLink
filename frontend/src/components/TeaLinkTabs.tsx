import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Today's picks", end: true },
  { to: "/counter", label: "At the counter" },
  { to: "/why", label: "Why this order" },
  { to: "/evidence", label: "Evidence" },
];

/** Sub-navigation inside the TeaLink tab. Scrolls sideways on narrow phones. */
export function TeaLinkTabs() {
  return (
    <nav aria-label="TeaLink" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] lg:col-span-full">
      <ul className="flex w-max gap-2">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block rounded-full px-4 py-2 text-sm tracking-[0.06em] whitespace-nowrap lowercase transition-colors ${
                  isActive ? "bg-ink text-foam" : "bg-sage text-ink/80 hover:bg-ink/10 hover:text-ink"
                }`
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
