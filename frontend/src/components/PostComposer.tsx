import { useMemo, useState } from "react";
import { social } from "../api/social.ts";
import type { FeedItem } from "../api/types.ts";
import { allDrinks } from "../lib/catalog.ts";
import { SHOP_IDS, shopLabel } from "../lib/format.ts";
import { resizePhoto } from "../lib/photo.ts";
import { useMe } from "../state/me.ts";
import { Sheet } from "./Sheet.tsx";

const MAX = 500;

/** A new post: a photo with a caption, or just a caption, with an optional drink or shop tag. */
export function PostComposer({ onClose, onPosted }: { onClose: () => void; onPosted: (item: FeedItem) => void }) {
  const me = useMe();
  const drinks = useMemo(() => [...allDrinks()].sort((a, b) => a.name.localeCompare(b.name)), []);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setBusy(true);
    setError(null);
    const [kind, value] = tag.split(":");
    social
      .createPost(me, {
        text: text.trim(),
        photo_url: photo,
        ...(kind === "drink" ? { drink_id: value } : kind === "shop" ? { shop_id: value } : {}),
      })
      .then((item) => {
        onPosted(item);
        onClose();
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Couldn't post."))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet label="New post" onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">new post</h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-sm font-semibold text-mute">
            Cancel
          </button>
        </div>

        {photo ? (
          <div className="relative mt-4">
            <img src={photo} alt="" className="aspect-square w-full rounded-2xl object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="absolute top-2 right-2 rounded-full bg-ink/75 px-3 py-1.5 text-sm font-semibold text-foam"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <label className="mt-4 flex min-h-24 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-ink/30 text-sm font-semibold text-mute hover:border-ink/60">
            Add a photo (optional)
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) resizePhoto(file, 1080).then(setPhoto, (reason: Error) => setError(reason.message));
              }}
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="sr-only">Caption</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, MAX))}
            rows={photo ? 3 : 5}
            autoFocus
            placeholder={photo ? "Write a caption…" : "What's on your mind?"}
            className="w-full rounded-2xl border border-line bg-foam px-4 py-3 text-[17px] outline-none focus:border-moss"
          />
          <span className="block text-right text-xs text-mute">
            {text.length}/{MAX}
          </span>
        </label>

        <label className="mt-2 block">
          <span className="mb-1 block text-sm font-semibold">Tag a drink or shop</span>
          <select value={tag} onChange={(event) => setTag(event.target.value)} className="min-h-11 w-full rounded-2xl border border-line bg-foam px-3 text-sm">
            <option value="">No tag</option>
            <optgroup label="Shops">
              {SHOP_IDS.map((id) => (
                <option key={id} value={`shop:${id}`}>
                  {shopLabel(id)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Drinks">
              {drinks.map((drink) => (
                <option key={drink.id} value={`drink:${drink.id}`}>
                  {drink.name} · {shopLabel(drink.shop_id)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {error ? <p className="mt-3 text-sm text-[#a33]">{error}</p> : null}
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="mt-5 min-h-12 w-full rounded-full bg-ink font-semibold text-foam disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post"}
        </button>
    </Sheet>
  );
}
