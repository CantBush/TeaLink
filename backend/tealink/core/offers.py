"""Apply a shop's close-call discount and rank again.

The new price changes only the cost score. Every other dimension stays as
the teagents scored it. A price below the cheapest drink on the menu scores 1.
"""

from __future__ import annotations

from tealink.core.preferences import combined_score
from tealink.core.resolution import TIE_GAP, _explain
from tealink.schemas import Decision, Offer, RankedDrink


def cost_at(price: float, low: float, high: float) -> float:
    if high == low:
        return 1.0
    raw = 1.0 - (price - low) / (high - low)
    return max(0.0, min(1.0, raw))


def apply_offer(decision: Decision, drink_id: str, offer: Offer, low: float, high: float) -> Decision:
    """Re-rank the top 3 after one drink's price changes. The rest of the field is unchanged."""
    before = decision.drink_id
    options: list[RankedDrink] = []
    for item in decision.options:
        if item.drink_id != drink_id:
            options.append(item)
            continue
        scores = dict(item.dimension_scores)
        scores["cost"] = cost_at(offer.price_after, low, high)
        options.append(
            item.model_copy(
                update={
                    "price": offer.price_after,
                    "dimension_scores": scores,
                    "score": combined_score(decision.weights, scores),
                    "offer": offer,
                }
            )
        )
    options.sort(key=lambda item: (-item.score, item.drink_id))
    winner = options[0]
    runner = options[1] if len(options) > 1 else None
    ask_human = runner is not None and winner.score - runner.score <= TIE_GAP
    question = None
    if ask_human and runner is not None:
        question = (
            f"{winner.drink_name} and {runner.drink_name} are nearly tied "
            f"({winner.score:.2f} vs {runner.score:.2f}). Your pick will teach us which matters more."
        )
    explanation = _explain(winner, runner, decision.weights, decision.dropped)
    if winner.drink_id == drink_id and winner.drink_id != before:
        explanation += f" {offer.reason} The discount moves it to #1."
    elif any(item.offer is not None for item in options):
        explanation += f" {offer.reason}"
    return decision.model_copy(
        update={
            "drink_id": winner.drink_id,
            "drink_name": winner.drink_name,
            "shop_id": winner.shop_id,
            "score": winner.score,
            "ask_human": ask_human,
            "question": question,
            "alternatives": options[1:],
            "explanation": explanation,
            "options": options,
        }
    )
