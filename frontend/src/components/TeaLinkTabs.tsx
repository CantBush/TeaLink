import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Today's picks", end: true },
  { to: "/counterfactual", label: "What changed" },
  { to: "/why", label: "Why this order" },
  { to: "/evidence", label: "Evidence" },
];

/** Sub-navigation inside the TeaLink tab. Scrolls sideways on narrow phones. */
export function TeaLinkTabs() {
  return (
    <nav aria-label="TeaLink" className="-mx-5 overflow-x-auto px-5 lg:col-span-full">
      <ul className="flex w-max gap-2 rounded-full border border-line bg-foam p-1">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap ${
                  isActive ? "bg-ink text-foam" : "text-ink/70 hover:text-ink"
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
