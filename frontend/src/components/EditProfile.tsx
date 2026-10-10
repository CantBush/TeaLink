import { type ReactNode, useState } from "react";
import { social } from "../api/social.ts";
import type { StatKey, UserProfile } from "../api/types.ts";
import { allDrinks } from "../lib/catalog.ts";
import { SHOP_IDS, shopLabel } from "../lib/format.ts";
import { COVERS, type CoverId, coverId, coverPhoto, setCover } from "../lib/images.ts";
import { ALL_STATS, STAT_LABELS } from "../lib/stats.ts";
import { profilesChanged } from "../state/social.ts";
import { Avatar } from "./Avatar.tsx";

const EMOJIS = ["🧋", "🍵", "🐯", "🌸", "🍓", "🥭", "🍑", "🫖", "🍯", "🐼", "🦊", "🐻", "🍡", "🌙", "⭐", "🐸", "🦄", "🍉", "🌈", "🔥"];
const COLORS = ["#f3d9b1", "#d8e8c8", "#f6c9c0", "#e3d4f0", "#cfe3ef", "#f9e3a6", "#e8cfc0", "#d5ebe0", "#2c1810"];
const ACCENTS = ["#c4742a", "#7a9a5b", "#c0605a", "#8b6bb0", "#4d86a8", "#b8892a", "#2c1810"];

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: string; onPick: (color: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onPick(color)}
          className={`h-8 w-8 rounded-full border-2 ${value === color ? "border-ink" : "border-foam"}`}
          style={{ background: color, boxShadow: "0 0 0 1px #ece3e1" }}
        />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-mute uppercase">{label}</p>
      {children}
    </div>
  );
}

const input = "w-full rounded-2xl border border-line bg-cream px-4 py-2.5 outline-none focus:border-amber";

export function EditProfile({ profile, onClose }: { profile: UserProfile; onClose: () => void }) {
  const [name, setName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [emoji, setEmoji] = useState(profile.avatar.emoji);
  const [color, setColor] = useState(profile.avatar.color);
  const [accent, setAccent] = useState(profile.accent);
  const [drink, setDrink] = useState(profile.pinned_drink_id ?? "");
  const [shop, setShop] = useState(profile.pinned_shop_id ?? "");
  const [shown, setShown] = useState<StatKey[]>(profile.visible_stats);
  const [cover, setCoverChoice] = useState<CoverId>(coverId(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hidden = ALL_STATS.filter((key) => !shown.includes(key));

  const move = (index: number, step: number) => {
    const next = [...shown];
    const [item] = next.splice(index, 1);
    next.splice(index + step, 0, item);
    setShown(next);
  };

  const save = () => {
    setCover(profile.user_id, cover);
    setSaving(true);
    setError(null);
    social
      .patchUser(profile.user_id, {
        display_name: name.trim() || profile.display_name,
        bio: bio.trim(),
        avatar: { emoji, color },
        accent,
        pinned_drink_id: drink || null,
        pinned_shop_id: shop || null,
        visible_stats: shown,
      })
      .then(() => {
        profilesChanged();
        onClose();
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Couldn't save.");
        setSaving(false);
      });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal
        aria-label="Edit profile"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-[32px] bg-foam sm:rounded-[32px]"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-mute hover:text-ink">
            Cancel
          </button>
          <h2 className="font-display text-xl">Edit profile</h2>
          <button type="button" onClick={save} disabled={saving} className="text-sm font-semibold text-amber disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </header>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <div className="relative">
            <img src={coverPhoto(profile, cover)} alt="" className="h-24 w-full rounded-2xl object-cover" />
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
              <Avatar avatar={{ emoji, color }} size="lg" ring={accent} />
            </div>
          </div>

          <Field label="Cover">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cover">
              {COVERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={cover === item}
                  aria-label={`${item} cover`}
                  onClick={() => setCoverChoice(item)}
                  className={`overflow-hidden rounded-xl border-2 ${cover === item ? "border-ink" : "border-transparent"}`}
                >
                  <img src={`/img/covers/${item}.jpg`} alt="" className="aspect-[16/9] w-full object-cover" />
                </button>
              ))}
            </div>
          </Field>

          <Field label="Avatar">
            <div className="grid grid-cols-10 gap-1">
              {EMOJIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setEmoji(item)}
                  aria-pressed={emoji === item}
                  className={`rounded-xl py-1 text-2xl ${emoji === item ? "bg-blush" : "hover:bg-cream"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Swatches colors={COLORS} value={color} onPick={setColor} label="Avatar background" />
            </div>
          </Field>

          <Field label="Profile color">
            <Swatches colors={ACCENTS} value={accent} onPick={setAccent} label="Profile color" />
          </Field>

          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} className={input} />
          </Field>

          <Field label={`Bio · ${bio.length}/150`}>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={150}
              rows={3}
              placeholder="Half sweet, less ice, always boba."
              className={`${input} resize-none`}
            />
          </Field>

          <Field label="Go-to order">
            <div className="grid gap-2 sm:grid-cols-2">
              <select value={drink} onChange={(event) => setDrink(event.target.value)} className={input} aria-label="Pinned drink">
                <option value="">No pinned drink</option>
                {allDrinks().map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {shopLabel(item.shop_id)}
                  </option>
                ))}
              </select>
              <select value={shop} onChange={(event) => setShop(event.target.value)} className={input} aria-label="Pinned shop">
                <option value="">No pinned shop</option>
                {SHOP_IDS.map((id) => (
                  <option key={id} value={id}>
                    {shopLabel(id)}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Boba stats on your profile">
            <p className="-mt-1 mb-3 text-sm text-mute">Only the stats you show are visible to other people. Use the arrows to reorder.</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {shown.map((key, index) => (
                <li key={key} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="flex-1 text-sm font-semibold">{STAT_LABELS[key]}</span>
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="px-1.5 text-mute disabled:opacity-25" aria-label={`Move ${STAT_LABELS[key]} up`}>
                    ↑
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === shown.length - 1} className="px-1.5 text-mute disabled:opacity-25" aria-label={`Move ${STAT_LABELS[key]} down`}>
                    ↓
                  </button>
                  <button type="button" onClick={() => setShown(shown.filter((item) => item !== key))} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-foam">
                    Shown
                  </button>
                </li>
              ))}
              {hidden.map((key) => (
                <li key={key} className="flex items-center gap-2 bg-cream/60 px-3 py-2.5">
                  <span className="flex-1 text-sm text-mute">{STAT_LABELS[key]}</span>
                  <button type="button" onClick={() => setShown([...shown, key])} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-mute">
                    Hidden
                  </button>
                </li>
              ))}
            </ul>
          </Field>

          {error ? <p className="text-sm font-semibold text-[#b33]">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
