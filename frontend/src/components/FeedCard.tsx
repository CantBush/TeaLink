import { useState } from "react";
import { Link } from "react-router-dom";
import { social } from "../api/social.ts";
import type { FeedItem } from "../api/types.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { price, shopLabel, timeAgo } from "../lib/format.ts";
import { drinkPhoto } from "../lib/images.ts";
import { useMe } from "../state/me.ts";
import { Avatar } from "./Avatar.tsx";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-line">{"★".repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20s-7-4.4-9-9.1C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.2 6.4C19 15.6 12 20 12 20z" strokeLinejoin="round" />
    </svg>
  );
}

function headline(item: FeedItem): string {
  switch (item.kind) {
    case "review":
      return "reviewed";
    case "pick":
      return "picked";
    case "rec":
      return `recommended to ${item.to_author?.display_name ?? "a friend"}`;
    case "joined":
      return "joined TeaLink";
  }
}

export function FeedCard({ item: initial }: { item: FeedItem }) {
  const me = useMe();
  const [item, setItem] = useState(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const drink = drinkInfo(item.drink_id);
  const photo = drinkPhoto(item.drink_id, item.photo_url);

  const toggleLike = () => {
    const on = !item.liked_by_me;
    setItem({ ...item, liked_by_me: on, likes: item.likes + (on ? 1 : -1) });
    social.like(item.id, me, on).then(setItem).catch(() => setItem(item));
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    social.comment(item.id, me, text).then(setItem).catch(() => setDraft(text));
  };

  return (
    <article className="rounded-[28px] border border-line bg-foam p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <Link to={`/u/${item.author.handle}`}>
          <Avatar avatar={item.author.avatar} />
        </Link>
        <p className="min-w-0 flex-1 text-[15px] leading-snug">
          <Link to={`/u/${item.author.handle}`} className="font-semibold hover:underline">
            {item.author.display_name}
          </Link>{" "}
          <span className="text-mute">{headline(item)}</span>
          <span className="block text-xs text-mute">
            @{item.author.handle} · {timeAgo(item.created_at)}
          </span>
        </p>
      </header>

      {drink ? (
        <div className="mt-3 overflow-hidden rounded-2xl bg-cream">
          {photo ? (
            <img src={photo} alt={drink.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          ) : null}
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-xl leading-tight">{drink.name}</p>
              {item.rating ? <Stars rating={item.rating} /> : null}
            </div>
            <p className="text-sm text-mute">
              {shopLabel(drink.shop_id)} · {price(drink.price)}
            </p>
          </div>
        </div>
      ) : null}
      {item.text ? <p className="mt-3 text-[15px]">{item.text}</p> : null}
      {item.kind === "rec" && item.to_user_id === me && drink ? (
        <Link
          to={`/discover?drink=${drink.id}`}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-foam"
        >
          Try this
        </Link>
      ) : null}

      {item.kind !== "joined" ? (
        <footer className="mt-3 flex items-center gap-5 text-sm font-semibold text-mute">
          <button
            type="button"
            onClick={toggleLike}
            className={`flex items-center gap-1.5 ${item.liked_by_me ? "text-[#d24b4b]" : "hover:text-ink"}`}
            aria-pressed={item.liked_by_me}
          >
            <Heart filled={item.liked_by_me} />
            {item.likes}
          </button>
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 5h16v11H8l-4 4z" strokeLinejoin="round" />
            </svg>
            {item.comments.length}
          </button>
        </footer>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {item.comments.map((comment) => (
            <p key={comment.id} className="flex gap-2 text-sm">
              <Avatar avatar={comment.author.avatar} size="sm" />
              <span>
                <Link to={`/u/${comment.author.handle}`} className="font-semibold hover:underline">
                  {comment.author.display_name}
                </Link>{" "}
                {comment.text}
              </span>
            </p>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={200}
              placeholder="Add a comment…"
              className="min-w-0 flex-1 rounded-full border border-line bg-cream px-4 py-2 text-sm outline-none focus:border-amber"
            />
            <button type="submit" disabled={!draft.trim()} className="rounded-full bg-ink px-4 text-sm font-semibold text-foam disabled:opacity-40">
              Post
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}
