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

SWEETNESS: dict[str, float] = {"0": 0.10, "25": 0.35, "50": 0.55, "100": 0.92}
TOPPING_LEVEL: dict[str, float] = {"none": 0.10, "some": 0.55, "loaded": 0.90}

BASES: dict[str, dict[str, float]] = {
    "milk": {"milkiness": 0.85, "fruitiness": 0.05, "tea_intensity": 0.45},
    "fruit": {"milkiness": 0.10, "fruitiness": 0.85, "tea_intensity": 0.40},
    "tea": {"milkiness": 0.20, "fruitiness": 0.08, "tea_intensity": 0.85},
}

# Each answer nudges the default priorities before they are normalized.
BUDGET_NUDGE: dict[str, dict[str, float]] = {
    "low": {"cost": 0.30},
    "mid": {"cost": 0.10},
    "high": {"cost": -0.10},
}
ADVENTURE_NUDGE: dict[str, dict[str, float]] = {
    "same": {"taste": 0.15, "novelty": -0.10},
    "sometimes": {"novelty": 0.10},
    "always": {"novelty": 0.35, "taste": -0.15},
}


@dataclass
class QuizOutcome:
    profile: dict[str, float]
    weights: dict[str, float]
    toppings: float = 0.5
    flavors: list[str] = field(default_factory=list)


def questions(shops: list[Shop] | None = None) -> list[QuizQuestion]:
    """The six questions. ``shops`` is unused; the flavor question replaced the shop question."""
    del shops
    return [
        QuizQuestion(
            id="sweetness",
            prompt="How sweet do you like it?",
            options=[
                QuizOption(id="0", label="Not sweet", emoji="🍃"),
                QuizOption(id="25", label="A little", emoji="🌱"),
                QuizOption(id="50", label="Half sweet", emoji="🧋"),
                QuizOption(id="100", label="Full sugar", emoji="🍯"),
            ],
        ),
        QuizQuestion(
            id="base",
            prompt="Pick your base",
            options=[
                QuizOption(id="milk", label="Creamy milk tea", emoji="🥛"),
                QuizOption(id="fruit", label="Fresh fruit tea", emoji="🍓"),
                QuizOption(id="tea", label="Strong, pure tea", emoji="🍵"),
            ],
        ),
        QuizQuestion(
            id="toppings",
            prompt="Toppings?",
            options=[
                QuizOption(id="none", label="None, just the drink", emoji="🚫"),
                QuizOption(id="some", label="Boba, always", emoji="⚫"),
                QuizOption(id="loaded", label="Load it up", emoji="🍮"),
            ],
        ),
        QuizQuestion(
            id="flavors",
            prompt="Which flavors sound good? Pick any",
            multi=True,
            options=[
                QuizOption(id="brown_sugar", label="Brown sugar", emoji="🍯"),
                QuizOption(id="oolong", label="Oolong", emoji="🫖"),
                QuizOption(id="matcha", label="Matcha", emoji="🍵"),
                QuizOption(id="taro", label="Taro", emoji="💜"),
                QuizOption(id="thai_tea", label="Thai tea", emoji="🧡"),
                QuizOption(id="hojicha", label="Roasted hojicha", emoji="🔥"),
                QuizOption(id="jasmine", label="Floral", emoji="🌸"),
                QuizOption(id="fruit", label="Fruity", emoji="🥭"),
            ],
        ),
        QuizQuestion(
            id="budget",
            prompt="What's your usual budget?",
            options=[
                QuizOption(id="low", label="Under $5", emoji="🪙"),
                QuizOption(id="mid", label="$5 to $6.50", emoji="💵"),
                QuizOption(id="high", label="Whatever it takes", emoji="💎"),
            ],
        ),
        QuizQuestion(
            id="adventure",
            prompt="When you order, you…",
            options=[
                QuizOption(id="same", label="Get my usual", emoji="🔁"),
                QuizOption(id="sometimes", label="Mix it up sometimes", emoji="🎲"),
                QuizOption(id="always", label="Always try something new", emoji="🧭"),
            ],
        ),
    ]


def score(answers: dict[str, str | list[str]], shops: list[Shop] | None = None) -> QuizOutcome:
    """Map answers to a taste profile and priorities. Raises ValueError on a bad answer."""
    del shops
    picked = _validate(answers, questions())
    profile = {attr: 0.5 for attr in ATTRIBUTES}
    profile["sweetness"] = SWEETNESS[picked["sweetness"][0]]
    profile.update(BASES[picked["base"][0]])
    profile["toppings"] = TOPPING_LEVEL[picked["toppings"][0]]

    raw = dict(PRIOR)
    for nudge in (BUDGET_NUDGE[picked["budget"][0]], ADVENTURE_NUDGE[picked["adventure"][0]]):
        for dim, amount in nudge.items():
            raw[dim] = raw[dim] + amount
    return QuizOutcome(
        profile=profile,
        weights=normalize(raw),
        toppings=profile["toppings"],
        flavors=picked["flavors"],
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
