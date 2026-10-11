import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { social } from "../api/social.ts";
import type { AppNotification, Notifications } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { shopLabel, timeAgo } from "../lib/format.ts";
import { useMe } from "../state/me.ts";
import { onProfilesChanged, profilesChanged } from "../state/social.ts";
import { Avatar } from "./Avatar.tsx";
import { Sheet } from "./Sheet.tsx";

const POLL_MS = 10000;

function message(note: AppNotification): string {
  const name = note.from.display_name;
  switch (note.kind) {
    case "bestea_request":
      return `${name} wants to be besteas. Besteas see each other's orders.`;
    case "bestea_accepted":
      return `${name} accepted. You're besteas now.`;
    case "bestea_order": {
      const drink = drinkInfo(note.drink_id)?.name ?? "a drink";
      return `${name} ordered ${drink}${note.shop_id ? ` at ${shopLabel(note.shop_id)}` : ""}.`;
    }
    case "rec": {
      const drink = drinkInfo(note.drink_id)?.name ?? "a drink";
      return `${name} recommended ${drink}${note.text ? `: “${note.text}”` : "."}`;
    }
  }
}

/** Bestea requests, accepts, and besteas' orders. Opening the list marks everything read. */
export function NotificationBell() {
  const me = useMe();
  const [data, setData] = useState<Notifications>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!me) return;
    social.notifications(me).then(setData).catch(() => {});
  }, [me]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("storage", refresh);
    const unsubscribe = onProfilesChanged(refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
      unsubscribe();
    };
  }, [refresh]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      void social.readNotifications(me).then(refresh);
    }
  };

  const answer = (note: AppNotification, action: "accept" | "decline") => {
    void social
      .bestea(me, note.from.handle, action)
      .then(() => {
        profilesChanged();
        refresh();
      })
      .catch(() => {});
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full text-ink/70 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" strokeLinejoin="round" />
          <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {data.unread ? (
          <span className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#d24b4b] px-1 text-[10px] font-semibold text-foam">
            {data.unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <Sheet label="Notifications" onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-2xl">notifications</p>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-2 text-sm font-semibold text-mute">
              Close
            </button>
          </div>
          {data.items.length === 0 ? (
            <p className="mt-3 text-sm text-mute">Nothing yet. Request a bestea from someone's profile to see their orders here.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {data.items.map((note) => (
                <li key={note.id} className={`flex gap-3 rounded-2xl p-2 ${note.read ? "" : "bg-mist"}`}>
                  <Link to={`/u/${note.from.handle}`} onClick={() => setOpen(false)} className="shrink-0">
                    <Avatar avatar={note.from.avatar} size="sm" />
                  </Link>
                  <div className="min-w-0 flex-1 text-sm">
                    <p>{message(note)}</p>
                    <p className="text-xs text-mute">{timeAgo(note.created_at)}</p>
                    {note.kind === "bestea_request" ? (
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => answer(note, "accept")} className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-foam">
                          Accept
                        </button>
                        <button type="button" onClick={() => answer(note, "decline")} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                          Decline
                        </button>
                      </div>
                    ) : note.kind === "rec" && note.drink_id ? (
                      <Link
                        to={`/discover?drink=${note.drink_id}`}
                        onClick={() => setOpen(false)}
                        className="mt-2 inline-flex rounded-full bg-sage px-3 py-1 text-xs font-semibold"
                      >
                        {drinkInfo(note.drink_id)?.name ?? "See the drink"}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      ) : null}
    </div>
  );
}
