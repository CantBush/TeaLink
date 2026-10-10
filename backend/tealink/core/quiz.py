"""Onboarding quiz: six questions mapped to a starting taste profile and priorities.

The mapping is fixed code, like every other number in TeaLink. The taste
profile seeds the Taste, Social, and Explorer agents for a user with no
reviews. The weights are the Preference agent's prior, and picks are learned
on top of them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tealink.core.preferences import PRIOR, normalize
from tealink.schemas import ATTRIBUTES, QuizOption, QuizQuestion, Shop

SWEETNESS: dict[str, float] = {"0": 0.10, "30": 0.35, "50": 0.55, "75": 0.75, "100": 0.92}

BASES: dict[str, dict[str, float]] = {
    "milk": {"milkiness": 0.85, "fruitiness": 0.05, "tea_intensity": 0.45},
    "fruit": {"milkiness": 0.10, "fruitiness": 0.85, "tea_intensity": 0.40},
    "tea": {"milkiness": 0.20, "fruitiness": 0.08, "tea_intensity": 0.85},
}

# option id -> (label shown in boba stats, toppings level on the drink scale)
TOPPINGS: dict[str, tuple[str, float]] = {
    "pearls": ("boba pearls", 0.80),
    "brown_sugar": ("brown sugar pearls", 0.90),
    "foam": ("cream foam", 0.35),
    "jelly": ("fruit jelly", 0.45),
    "pudding": ("pudding", 0.50),
}
NO_TOPPINGS = 0.05
EXTRA_TOPPING = 0.05

# Each answer nudges the default priorities before they are normalized.
BUDGET_NUDGE: dict[str, dict[str, float]] = {
    "under_5": {"cost": 0.30},
    "five_to_six": {"cost": 0.10},
    "splurge": {"cost": -0.10},
}
ADVENTURE_NUDGE: dict[str, dict[str, float]] = {
    "same": {"taste": 0.15, "novelty": -0.10},
    "sometimes": {"novelty": 0.10},
    "always_new": {"novelty": 0.35, "taste": -0.15},
}
FRIENDS_SHOP = "friends"
FRIENDS_NUDGE: dict[str, float] = {"social": 0.20}


@dataclass
class QuizOutcome:
    profile: dict[str, float]
    weights: dict[str, float]
    toppings: list[str] = field(default_factory=list)
    fav_shop_id: str | None = None


def questions(shops: list[Shop]) -> list[QuizQuestion]:
    """The six questions. The shop question lists the shops on the network at startup."""
    shop_options = [QuizOption(id=shop.id, label=shop.name, emoji="🏪") for shop in shops if shop.online]
    shop_options.append(QuizOption(id=FRIENDS_SHOP, label="Wherever my friends go", emoji="👯"))
    return [
        QuizQuestion(
            id="sweetness",
            prompt="How sweet do you like it?",
            options=[
                QuizOption(id="0", label="No sugar", emoji="🫖"),
                QuizOption(id="30", label="A little (30%)", emoji="🌱"),
                QuizOption(id="50", label="Half sweet (50%)", emoji="⚖️"),
                QuizOption(id="75", label="Pretty sweet (75%)", emoji="🍯"),
                QuizOption(id="100", label="Full sugar", emoji="🍬"),
            ],
        ),
        QuizQuestion(
            id="base",
            prompt="Pick your base.",
            options=[
                QuizOption(id="milk", label="Creamy milk tea", emoji="🥛"),
                QuizOption(id="fruit", label="Fresh fruit tea", emoji="🍓"),
                QuizOption(id="tea", label="Tea-forward, floral or roasted", emoji="🍵"),
            ],
        ),
        QuizQuestion(
            id="toppings",
            prompt="Favorite toppings? Pick any.",
            multi=True,
            options=[
                QuizOption(id="pearls", label="Boba pearls", emoji="⚫"),
                QuizOption(id="brown_sugar", label="Brown sugar pearls", emoji="🟤"),
                QuizOption(id="foam", label="Cream foam", emoji="☁️"),
                QuizOption(id="jelly", label="Fruit jelly", emoji="🟩"),
                QuizOption(id="pudding", label="Pudding", emoji="🍮"),
                QuizOption(id="none", label="No toppings", emoji="🚫"),
            ],
        ),
        QuizQuestion(
            id="budget",
            prompt="What do you usually spend on a drink?",
            options=[
                QuizOption(id="under_5", label="Under $5", emoji="🪙"),
                QuizOption(id="five_to_six", label="$5 to $6.50", emoji="💵"),
                QuizOption(id="splurge", label="Whatever it costs", emoji="💎"),
            ],
        ),
        QuizQuestion(
            id="adventure",
            prompt="How adventurous are you?",
            options=[
                QuizOption(id="same", label="Same order every time", emoji="🔁"),
                QuizOption(id="sometimes", label="I mix it up sometimes", emoji="🎲"),
                QuizOption(id="always_new", label="Always something new", emoji="🧭"),
            ],
        ),
        QuizQuestion(id="shop", prompt="One shop you already like?", options=shop_options),
    ]


def score(answers: dict[str, str | list[str]], shops: list[Shop]) -> QuizOutcome:
    """Map answers to a taste profile and priorities. Raises ValueError on a bad answer."""
    picked = _validate(answers, questions(shops))
    profile = {attr: 0.5 for attr in ATTRIBUTES}
    profile["sweetness"] = SWEETNESS[picked["sweetness"][0]]
    profile.update(BASES[picked["base"][0]])

    chosen = [option for option in picked["toppings"] if option != "none"]
    if chosen:
        levels = [TOPPINGS[option][1] for option in chosen]
        profile["toppings"] = min(0.95, max(levels) + EXTRA_TOPPING * (len(levels) - 1))
    else:
        profile["toppings"] = NO_TOPPINGS
    labels = [TOPPINGS[option][0] for option in chosen]

    raw = dict(PRIOR)
    nudges = [BUDGET_NUDGE[picked["budget"][0]], ADVENTURE_NUDGE[picked["adventure"][0]]]
    shop = picked["shop"][0]
    if shop == FRIENDS_SHOP:
        nudges.append(FRIENDS_NUDGE)
    for nudge in nudges:
        for dim, amount in nudge.items():
            raw[dim] = raw[dim] + amount
    return QuizOutcome(
        profile=profile,
        weights=normalize(raw),
        toppings=labels,
        fav_shop_id=None if shop == FRIENDS_SHOP else shop,
    )


def _validate(answers: dict[str, str | list[str]], asked: list[QuizQuestion]) -> dict[str, list[str]]:
    picked: dict[str, list[str]] = {}
    for question in asked:
        raw = answers.get(question.id)
        if raw is None:
            raise ValueError(f"missing an answer for '{question.id}'")
        chosen = [raw] if isinstance(raw, str) else list(raw)
        if not chosen:
            raise ValueError(f"'{question.id}' needs at least one answer")
        if not question.multi and len(chosen) != 1:
            raise ValueError(f"'{question.id}' takes exactly one answer")
        valid = {option.id for option in question.options}
        unknown = [option for option in chosen if option not in valid]
        if unknown:
            raise ValueError(f"'{question.id}' has no option {unknown[0]!r}")
        picked[question.id] = list(dict.fromkeys(chosen))
    extra = sorted(set(answers) - {question.id for question in asked})
    if extra:
        raise ValueError(f"unknown question '{extra[0]}'")
    return picked
