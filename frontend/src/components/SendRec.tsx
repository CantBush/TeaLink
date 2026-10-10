import { useEffect, useState } from "react";
import { social } from "../api/social.ts";
import type { UserProfile } from "../api/types.ts";
import { allDrinks, drinkInfo } from "../lib/catalog.ts";
import { shopLabel } from "../lib/format.ts";
import { drinkPhoto } from "../lib/images.ts";
import { useMe } from "../state/me.ts";
import { Avatar } from "./Avatar.tsx";

const input = "w-full rounded-2xl border border-line bg-cream px-4 py-3 text-[15px] outline-none focus:border-moss";

/** Recommend one drink to one person. Either side can be fixed by the caller. */
export function SendRec({ drinkId, to, onClose }: { drinkId?: string; to?: UserProfile; onClose: () => void }) {
  const me = useMe();
  const [people, setPeople] = useState<UserProfile[]>(to ? [to] : []);
  const [friend, setFriend] = useState(to?.user_id ?? "");
  const [drink, setDrink] = useState(drinkId ?? "");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (to) return;
    social
      .listUsers(me)
      .then((users) => {
        const others = users.filter((user) => user.user_id !== me);
        others.sort((a, b) => Number(b.followed_by_me) - Number(a.followed_by_me));
        setPeople(others);
      })
      .catch(() => {});
  }, [me, to]);

  const target = people.find((person) => person.user_id === friend);
  const chosen = drinkInfo(drink);

  const send = () => {
    if (!friend || !drink) return;
    setState("sending");
    setError(null);
    social
      .sendRec(me, friend, drink, note.trim())
      .then(() => setState("sent"))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't send it.");
        setState("idle");
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal
        aria-label="Send a rec"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-foam p-6 sm:rounded-[32px]"
      >
        {state === "sent" ? (
          <div className="py-6 text-center">
            <p className="text-4xl" aria-hidden>
              🧋
            </p>
            <h2 className="mt-3 font-display text-2xl">Sent to {target?.display_name ?? "your friend"}</h2>
            <p className="mt-1 text-mute">It shows up at the top of their Home feed.</p>
            <button type="button" onClick={onClose} className="mt-6 min-h-11 rounded-full bg-ink px-6 font-semibold text-foam">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Send a rec</h2>
              <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold text-mute">
                Cancel
              </button>
            </div>

            {drinkId && chosen ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cream p-3">
                <img src={drinkPhoto(chosen.id) ?? ""} alt="" className="h-14 w-14 rounded-xl object-cover" />
                <p>
                  <span className="block font-semibold">{chosen.name}</span>
                  <span className="text-sm text-mute">{shopLabel(chosen.shop_id)}</span>
                </p>
              </div>
            ) : (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-semibold">Drink</span>
                <select value={drink} onChange={(event) => setDrink(event.target.value)} className={input}>
                  <option value="">Choose a drink</option>
                  {allDrinks().map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {shopLabel(item.shop_id)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {to ? (
              <div className="mt-4 flex items-center gap-3">
                <Avatar avatar={to.avatar} size="sm" />
                <p className="font-semibold">To {to.display_name}</p>
              </div>
            ) : (
              <fieldset className="mt-5">
                <legend className="mb-2 text-sm font-semibold">To</legend>
                <ul className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1">
                  {people.map((person) => (
                    <li key={person.user_id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setFriend(person.user_id)}
                        aria-pressed={friend === person.user_id}
                        className={`flex w-20 flex-col items-center gap-1 rounded-2xl p-2 text-sm font-semibold ${
                          friend === person.user_id ? "bg-ink text-foam" : "text-ink"
                        }`}
                      >
                        <Avatar avatar={person.avatar} />
                        <span className="w-full truncate text-center">{person.display_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold">Note (optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={200}
                rows={2}
                placeholder="You'd love this one."
                className={`${input} resize-none`}
              />
            </label>

            {error ? <p className="mt-3 text-sm font-semibold text-[#b33]">{error}</p> : null}

            <button
              type="button"
              onClick={send}
              disabled={!friend || !drink || state === "sending"}
              className="mt-5 min-h-12 w-full rounded-full bg-ink font-semibold text-foam disabled:opacity-40"
            >
              {state === "sending" ? "Sending…" : target ? `Send to ${target.display_name}` : "Send"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
