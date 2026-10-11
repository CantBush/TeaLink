import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import type { FavoritePick, QuizKind, QuizQuestion } from "../api/types.ts";
import { allDrinks } from "../lib/catalog.ts";
import { price, shopLabel } from "../lib/format.ts";
import { Shell } from "./OnboardingShell.tsx";
import { ShopSearch } from "./ShopSearch.tsx";

const KINDS: { kind: QuizKind; emoji: string; title: string; detail: string }[] = [
  { kind: "basic", emoji: "🧋", title: "Basic", detail: "Six quick questions, about a minute." },
  {
    kind: "full",
    emoji: "🍵",
    title: "Full",
    detail: "More about ice, tea, milk, toppings, and what you skip, plus your favorite drinks. The agents start much closer to what you like.",
  },
];

/** Basic or full: shown before the first question, and again on Retake quiz. */
export function ChooseQuizStep({ retake, onChoose }: { retake: boolean; onChoose: (kind: QuizKind) => void }) {
  return (
    <Shell>
      <p className="text-sm font-semibold text-moss">{retake ? "Retake the quiz" : "Your taste quiz"}</p>
      <h1 className="mt-2 font-display text-4xl leading-tight">Which quiz?</h1>
      <p className="mt-2 text-mute">Either one sets where your agents start. Every order teaches them more.</p>
      <ul className="mt-8 grid gap-3">
        {KINDS.map((item) => (
          <li key={item.kind}>
            <button
              type="button"
              onClick={() => onChoose(item.kind)}
              className="flex w-full items-start gap-4 rounded-3xl border-2 border-line bg-foam px-5 py-4 text-left transition hover:border-ink/30"
            >
              <span className="text-3xl" aria-hidden>
                {item.emoji}
              </span>
              <span>
                <span className="block text-lg font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-mute">{item.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {retake ? (
        <div className="mt-auto pt-10">
          <Link to="/me" className="rounded-full px-4 py-3 font-semibold text-mute hover:text-ink">
            Back to your profile
          </Link>
        </div>
      ) : null}
    </Shell>
  );
}

/** The full quiz's favorites question: pick a shop by name, then the drinks you love there. Repeat. */
export function FavoritesStep({
  question,
  index,
  total,
  favorites,
  onChange,
  onBack,
  onNext,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  favorites: FavoritePick[];
  onChange: Dispatch<SetStateAction<FavoritePick[]>>;
  onBack: () => void;
  onNext: () => void;
}) {
  const picked = favorites.some((group) => group.drink_ids.length > 0);
  const toggle = (shopId: string, drinkId: string) =>
    onChange((current) =>
      current.map((group) =>
        group.shop_id !== shopId
          ? group
          : {
              ...group,
              drink_ids: group.drink_ids.includes(drinkId)
                ? group.drink_ids.filter((id) => id !== drinkId)
                : [...group.drink_ids, drinkId],
            },
      ),
    );

  return (
    <Shell progress={index / total}>
      <p className="text-sm font-semibold text-moss">
        Question {index + 1} of {total}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">{question.prompt}</h1>
      <p className="mt-2 text-mute">Pick a shop, then the drinks you love there. Favorites count more than any other answer.</p>

      <ul className="mt-6 space-y-4">
        {favorites.map((group) => {
          const menu = allDrinks()
            .filter((drink) => drink.shop_id === group.shop_id)
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <li key={group.shop_id} className="rounded-3xl border border-line bg-foam p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-2xl leading-tight">{shopLabel(group.shop_id)}</p>
                <button
                  type="button"
                  onClick={() => onChange((current) => current.filter((item) => item.shop_id !== group.shop_id))}
                  className="min-h-11 px-2 text-sm font-semibold text-mute hover:text-ink"
                  aria-label={`Remove ${shopLabel(group.shop_id)}`}
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {menu.map((drink) => {
                  const on = group.drink_ids.includes(drink.id);
                  return (
                    <button
                      key={drink.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(group.shop_id, drink.id)}
                      className={`min-h-11 rounded-full border-2 px-4 text-sm font-semibold transition ${
                        on ? "border-moss bg-mist" : "border-line bg-foam hover:border-ink/30"
                      }`}
                    >
                      {drink.name}
                      <span className="ml-1.5 font-normal text-mute">{price(drink.price)}</span>
                    </button>
                  );
                })}
              </div>
              {group.drink_ids.length === 0 ? <p className="mt-2 text-sm text-mute">Pick at least one, or remove the shop.</p> : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold">{favorites.length ? "Add another shop" : "Add a shop you love"}</p>
        <ShopSearch
          label={favorites.length ? "Add another shop" : "Add a shop you love"}
          exclude={favorites.map((group) => group.shop_id)}
          onPick={(shopId) => onChange((current) => [...current, { shop_id: shopId, drink_ids: [] }])}
        />
      </div>

      <div className="mt-auto flex items-center justify-between pt-10">
        <button type="button" onClick={onBack} className="rounded-full px-4 py-3 font-semibold text-mute hover:text-ink">
          Back
        </button>
        <button type="button" onClick={onNext} className="rounded-full bg-ink px-6 py-3 font-semibold text-foam">
          {index + 1 === total ? (picked ? "See my results" : "Skip and see my results") : picked ? "Next" : "Skip"}
        </button>
      </div>
    </Shell>
  );
}
