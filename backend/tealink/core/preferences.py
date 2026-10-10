"""Learn how much a user weighs taste, friends, novelty, and cost from their picks.

Every pick from a set of options is treated as "chosen beat each rejected
option". The update moves weight toward the dimensions where the chosen drink
scored higher than the ones passed over (a pairwise perceptron step), then
renormalizes. A floor keeps every dimension in play so one pick can't erase it.
"""

from __future__ import annotations

from tealink.schemas import DIMENSIONS, ChoiceRecord, RankedDrink

PRIOR: dict[str, float] = {"taste": 0.55, "social": 0.15, "novelty": 0.15, "cost": 0.15}
FLOOR = 0.05
LEARNING_RATE = 0.25

AGENT_DIMENSION: dict[str, str] = {
    "taste": "taste",
    "social": "social",
    "explorer": "novelty",
    "budget": "cost",
}

LABELS: dict[str, str] = {
    "taste": "taste match",
    "social": "what similar people liked",
    "novelty": "trying something new",
    "cost": "price",
}


def normalize(weights: dict[str, float]) -> dict[str, float]:
    """Sum to 1 with every dimension at least FLOOR. Normalizing twice changes nothing."""
    raw = {dim: max(0.0, float(weights.get(dim, 0.0))) for dim in DIMENSIONS}
    total = sum(raw.values())
    if total == 0.0:
        return {dim: 1.0 / len(DIMENSIONS) for dim in DIMENSIONS}
    pinned: set[str] = set()
    while True:
        free = [dim for dim in DIMENSIONS if dim not in pinned]
        free_total = sum(raw[dim] for dim in free)
        room = 1.0 - FLOOR * len(pinned)
        scaled = {dim: (raw[dim] / free_total * room if free_total else room / len(free)) for dim in free}
        low = {dim for dim, value in scaled.items() if value < FLOOR}
        if not low:
            return {dim: FLOOR if dim in pinned else scaled[dim] for dim in DIMENSIONS}
        pinned |= low


def combined_score(weights: dict[str, float], scores: dict[str, float]) -> float:
    return sum(weights.get(dim, 0.0) * scores.get(dim, 0.0) for dim in DIMENSIONS)


def update(weights: dict[str, float], choice: ChoiceRecord, rate: float = LEARNING_RATE) -> dict[str, float]:
    chosen = _find(choice.options, choice.chosen_drink_id)
    rejected = [option for option in choice.options if option.drink_id != choice.chosen_drink_id]
    if chosen is None or not rejected:
        return normalize(weights)
    moved = dict(weights)
    for other in rejected:
        for dim in DIMENSIONS:
            gap = chosen.dimension_scores.get(dim, 0.0) - other.dimension_scores.get(dim, 0.0)
            moved[dim] = moved.get(dim, 0.0) + rate * gap / len(rejected)
    return normalize(moved)


def fit(history: list[ChoiceRecord], prior: dict[str, float] | None = None) -> dict[str, float]:
    weights = normalize(prior or PRIOR)
    for choice in history:
        weights = update(weights, choice)
    return weights


def describe_choice(before: dict[str, float], after: dict[str, float], choice: ChoiceRecord) -> str:
    """One sentence on what the pick taught us, naming the biggest shift."""
    chosen = _find(choice.options, choice.chosen_drink_id)
    if chosen is None:
        return "That pick was not one of the offered options, so nothing changed."
    rejected = [option for option in choice.options if option.drink_id != chosen.drink_id]
    delta = {dim: after[dim] - before[dim] for dim in DIMENSIONS}
    up = max(DIMENSIONS, key=lambda dim: (delta[dim], dim))
    if delta[up] < 0.005 or not rejected:
        return f"You picked {chosen.drink_name}, which already matched your priorities."
    passed = max(rejected, key=lambda option: option.score)
    return (
        f"You picked {chosen.drink_name} over {passed.drink_name}, so "
        f"{LABELS[up]} now counts for {round(after[up] * 100)}% "
        f"(was {round(before[up] * 100)}%)."
    )


def describe_weights(weights: dict[str, float], choices_seen: int, from_quiz: bool = False) -> str:
    ranked = sorted(DIMENSIONS, key=lambda dim: (-weights[dim], dim))
    top, second = ranked[0], ranked[1]
    picks = f"{choices_seen} past pick{'s' if choices_seen != 1 else ''}"
    if from_quiz:
        basis = f"your quiz and {picks}" if choices_seen else "your quiz answers"
    else:
        basis = picks if choices_seen else "default weights"
    return (
        f"From {basis}: {LABELS[top]} matters most ({round(weights[top] * 100)}%), "
        f"then {LABELS[second]} ({round(weights[second] * 100)}%)."
    )


def _find(options: list[RankedDrink], drink_id: str) -> RankedDrink | None:
    for option in options:
        if option.drink_id == drink_id:
            return option
    return None
