"""Onboarding quiz: six questions mapped to a starting taste profile and priorities.

The mapping is fixed code, like every other number in TeaLink. The taste
profile seeds the Taste, Social, and Explorer teagents for a user with no
reviews. The weights are the Preference teagent's prior, and picks are learned
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
    avoids: list[str] = field(default_factory=list)
    kind: str = "basic"


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


def full_questions(shops: list[Shop] | None = None) -> list[QuizQuestion]:
    """Basic questions, then the longer taste questions, then favorites.

    Favorites are not an answer id. ``POST /quiz`` sends them beside ``answers``.
    """
    del shops
    return [
        *questions(),
        QuizQuestion(
            id="ice",
            prompt="How much ice?",
            options=[
                QuizOption(id="none", label="No ice", emoji="🔥"),
                QuizOption(id="regular", label="Regular ice", emoji="🧊"),
                QuizOption(id="extra", label="Extra ice", emoji="❄️"),
            ],
        ),
        QuizQuestion(
            id="temperature",
            prompt="Hot or iced?",
            options=[
                QuizOption(id="hot", label="Hot", emoji="☕"),
                QuizOption(id="either", label="Either", emoji="🌗"),
                QuizOption(id="iced", label="Iced", emoji="🧊"),
            ],
        ),
        QuizQuestion(
            id="tea_base",
            prompt="Which tea do you reach for?",
            options=[
                QuizOption(id="black", label="Black tea", emoji="🍵"),
                QuizOption(id="green", label="Green tea", emoji="🍃"),
                QuizOption(id="oolong", label="Oolong", emoji="🫖"),
                QuizOption(id="herbal", label="Herbal or fruit", emoji="🌿"),
            ],
        ),
        QuizQuestion(
            id="milk_type",
            prompt="What kind of milk?",
            options=[
                QuizOption(id="dairy", label="Dairy", emoji="🥛"),
                QuizOption(id="oat", label="Oat or other", emoji="🌾"),
                QuizOption(id="none", label="No milk", emoji="💧"),
            ],
        ),
        QuizQuestion(
            id="specific_toppings",
            prompt="Which toppings? Pick any",
            multi=True,
            options=[
                QuizOption(id="pearls", label="Pearls", emoji="⚫"),
                QuizOption(id="jelly", label="Jelly", emoji="🟩"),
                QuizOption(id="foam", label="Cheese foam", emoji="☁️"),
                QuizOption(id="pudding", label="Pudding", emoji="🍮"),
                QuizOption(id="none", label="None of these", emoji="🚫"),
            ],
        ),
        QuizQuestion(
            id="texture",
            prompt="What texture do you want?",
            options=[
                QuizOption(id="smooth", label="Smooth", emoji="🥛"),
                QuizOption(id="chewy", label="Chewy", emoji="⚫"),
                QuizOption(id="light", label="Light", emoji="🍃"),
            ],
        ),
        QuizQuestion(
            id="avoid",
            prompt="Anything you skip? Pick any",
            multi=True,
            options=[
                QuizOption(id="none", label="I'll drink most things", emoji="✨"),
                QuizOption(id="brown_sugar", label="Brown sugar", emoji="🍯"),
                QuizOption(id="taro", label="Taro", emoji="💜"),
                QuizOption(id="matcha", label="Matcha", emoji="🍵"),
                QuizOption(id="fruit", label="Fruity", emoji="🥭"),
                QuizOption(id="jasmine", label="Floral", emoji="🌸"),
                QuizOption(id="hojicha", label="Roasted hojicha", emoji="🔥"),
                QuizOption(id="thai_tea", label="Thai tea", emoji="🧡"),
                QuizOption(id="oolong", label="Oolong", emoji="🫖"),
            ],
        ),
        QuizQuestion(
            id="favorites",
            prompt="Your favorite drinks, from the shops you love",
            kind="favorites",
            options=[],
        ),
    ]


def score(
    answers: dict[str, str | list[str]],
    shops: list[Shop] | None = None,
    kind: str = "basic",
) -> QuizOutcome:
    """Map answers to a taste profile and priorities. Raises ValueError on a bad answer."""
    del shops
    if kind not in ("basic", "full"):
        raise ValueError("quiz kind must be basic or full")
    asked = questions() if kind == "basic" else full_questions()
    picked = _validate(answers, [question for question in asked if question.kind != "favorites"])
    profile = {attr: 0.5 for attr in ATTRIBUTES}
    profile["sweetness"] = SWEETNESS[picked["sweetness"][0]]
    profile.update(BASES[picked["base"][0]])
    profile["toppings"] = TOPPING_LEVEL[picked["toppings"][0]]

    raw = dict(PRIOR)
    for nudge in (BUDGET_NUDGE[picked["budget"][0]], ADVENTURE_NUDGE[picked["adventure"][0]]):
        for dim, amount in nudge.items():
            raw[dim] = raw[dim] + amount
    flavors = list(picked["flavors"])
    avoids: list[str] = []
    if kind == "full":
        _apply_full(profile, picked)
        avoids = [tag for tag in picked["avoid"] if tag != "none"]
        for tag in avoids:
            _push_away(profile, tag)
        flavors = [tag for tag in flavors if tag not in avoids]
        tea = picked["tea_base"][0]
        if tea in {"oolong"} and tea not in flavors and tea not in avoids:
            flavors.append(tea)
    return QuizOutcome(
        profile=profile,
        weights=normalize(raw),
        toppings=profile["toppings"],
        flavors=flavors,
        avoids=avoids,
        kind=kind,
    )


# How far a "skip this flavor" answer moves the profile off that flavor's center.
AVOID_STEP = 0.35
FLAVOR_CENTERS: dict[str, dict[str, float]] = {
    "brown_sugar": {"sweetness": 0.9, "milkiness": 0.75, "toppings": 0.7},
    "fruit": {"fruitiness": 0.9, "sweetness": 0.65},
    "matcha": {"tea_intensity": 0.7, "milkiness": 0.45},
    "taro": {"sweetness": 0.75, "milkiness": 0.7},
    "jasmine": {"tea_intensity": 0.55, "fruitiness": 0.15},
    "hojicha": {"tea_intensity": 0.6, "milkiness": 0.7, "sweetness": 0.55},
    "thai_tea": {"sweetness": 0.8, "milkiness": 0.8},
    "oolong": {"tea_intensity": 0.8, "milkiness": 0.3},
}
TOPPING_BUMP: dict[str, float] = {"pearls": 0.08, "jelly": 0.06, "foam": 0.05, "pudding": 0.07}


def _apply_full(profile: dict[str, float], picked: dict[str, list[str]]) -> None:
    """Extra full-quiz answers, applied after the six basic ones. Clamped to 0–1."""
    ice = picked["ice"][0]
    if ice == "none":
        _nudge(profile, {"tea_intensity": 0.10, "fruitiness": -0.05})
    elif ice == "extra":
        _nudge(profile, {"fruitiness": 0.10, "tea_intensity": -0.05})
    temperature = picked["temperature"][0]
    if temperature == "hot":
        _nudge(profile, {"tea_intensity": 0.08, "fruitiness": -0.06})
    elif temperature == "iced":
        _nudge(profile, {"fruitiness": 0.08, "sweetness": 0.04})
    tea = picked["tea_base"][0]
    if tea == "black":
        _nudge(profile, {"tea_intensity": 0.12, "milkiness": 0.04})
    elif tea == "green":
        _nudge(profile, {"tea_intensity": 0.04, "fruitiness": 0.04})
    elif tea == "oolong":
        _nudge(profile, {"tea_intensity": 0.10})
    else:
        _nudge(profile, {"tea_intensity": -0.10, "fruitiness": 0.12})
    milk = picked["milk_type"][0]
    if milk == "dairy":
        _nudge(profile, {"milkiness": 0.12})
    elif milk == "oat":
        _nudge(profile, {"milkiness": 0.05, "sweetness": -0.04})
    else:
        profile["milkiness"] = min(profile["milkiness"], 0.15)
    toppings = [item for item in picked["specific_toppings"] if item != "none"]
    if not toppings:
        profile["toppings"] = 0.10
    else:
        for item in toppings:
            _nudge(profile, {"toppings": TOPPING_BUMP[item]})
    texture = picked["texture"][0]
    if texture == "smooth":
        _nudge(profile, {"toppings": -0.06, "milkiness": 0.05})
    elif texture == "chewy":
        _nudge(profile, {"toppings": 0.12})
    else:
        _nudge(profile, {"milkiness": -0.10, "toppings": -0.06})


def _push_away(profile: dict[str, float], tag: str) -> None:
    center = FLAVOR_CENTERS.get(tag)
    if center is None:
        return
    for attr, value in center.items():
        profile[attr] = _clamp(profile[attr] - AVOID_STEP * (value - 0.5))


def _nudge(profile: dict[str, float], deltas: dict[str, float]) -> None:
    for attr, amount in deltas.items():
        profile[attr] = _clamp(profile.get(attr, 0.5) + amount)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


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
