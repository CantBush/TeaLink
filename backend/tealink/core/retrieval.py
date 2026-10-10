"""Review retrieval by drink-attribute distance. No LLM."""

from __future__ import annotations

from tealink.core.taste import mean_absolute_difference
from tealink.schemas import ATTRIBUTES, Drink, Evidence, Review

_FRIENDLY = {
    "sweetness": "sweetness",
    "milkiness": "milkiness",
    "tea_intensity": "tea intensity",
    "fruitiness": "fruitiness",
    "toppings": "toppings",
}


def retrieve_evidence(
    reviews: list[Review],
    drinks_by_id: dict[str, Drink],
    candidate: Drink,
    k: int = 3,
) -> list[Evidence]:
    """Return the k reviews whose drinks are closest to ``candidate``.

    Distance is mean absolute difference over the five attributes. Ties break
    by higher rating, then review id. The relevance line is a fixed template.
    """
    if k <= 0:
        return []
    ranked: list[tuple[float, int, str, Review, Drink]] = []
    for review in reviews:
        drink = drinks_by_id.get(review.drink_id)
        if drink is None:
            continue
        distance = mean_absolute_difference(drink.attributes, candidate.attributes)
        ranked.append((distance, -review.rating, review.id, review, drink))
    ranked.sort()
    evidence: list[Evidence] = []
    for _distance, _rating_key, _review_id, review, drink in ranked[:k]:
        evidence.append(
            Evidence(
                review_id=review.id,
                drink_name=drink.name,
                rating=review.rating,
                text=review.text,
                relevance=_relevance(review, drink, candidate),
            )
        )
    return evidence


def _relevance(review: Review, drink: Drink, candidate: Drink) -> str:
    if drink.id == candidate.id:
        return f"You rated this {review.rating}/5; same drink."
    closest = min(
        ATTRIBUTES,
        key=lambda attr: (
            abs(float(drink.attributes[attr]) - float(candidate.attributes[attr])),
            ATTRIBUTES.index(attr),
        ),
    )
    gap = abs(float(drink.attributes[closest]) - float(candidate.attributes[closest]))
    relation = "similar" if gap <= 0.25 else "closest on"
    return f"You rated this {review.rating}/5; {relation} {_FRIENDLY[closest]}."
