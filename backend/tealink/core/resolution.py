"""Rank candidates by the user's learned priorities and return the top 3.

Every objective teagent scores every candidate on its own dimension. A drink's
overall score is the weighted sum of those dimension scores, using the weights
the Preference teagent learned for this user. Vetoed drinks, and drinks whose
shop has no online teagent to confirm stock, are dropped first. No teagent gets a
casting vote; the weights decide.
"""

from __future__ import annotations

from tealink.core.preferences import LABELS, PRIOR, combined_score, normalize
from tealink.schemas import (
    DIMENSIONS,
    Decision,
    DroppedDrink,
    Objection,
    ObjectionKind,
    Proposal,
    RankedDrink,
)

TIE_GAP = 0.02
TOP_K = 3


def resolve(
    proposals: list[Proposal],
    objections: list[Objection],
    weights: dict[str, float] | None = None,
    confirmed_shop_ids: set[str] | None = None,
    top_k: int = TOP_K,
) -> Decision:
    weights = normalize(weights or PRIOR)
    first: dict[str, Proposal] = {}
    for proposal in proposals:
        first.setdefault(proposal.drink_id, proposal)

    scores: dict[str, dict[str, float]] = {drink_id: {} for drink_id in first}
    for proposal in proposals:
        if proposal.dimension:
            scores[proposal.drink_id].setdefault(proposal.dimension, proposal.score)
    for objection in objections:
        if objection.target_drink_id in scores and objection.dimension and objection.score is not None:
            scores[objection.target_drink_id][objection.dimension] = objection.score

    dropped: list[DroppedDrink] = []
    removed: set[str] = set()
    for objection in objections:
        drink_id = objection.target_drink_id
        if objection.kind == ObjectionKind.veto and drink_id in first and drink_id not in removed:
            removed.add(drink_id)
            dropped.append(
                DroppedDrink(
                    drink_id=drink_id,
                    drink_name=first[drink_id].drink_name,
                    reason=objection.reason,
                    by=objection.agent_id,
                )
            )
    if confirmed_shop_ids is not None:
        for drink_id, proposal in first.items():
            if drink_id in removed or proposal.shop_id in confirmed_shop_ids:
                continue
            removed.add(drink_id)
            dropped.append(
                DroppedDrink(
                    drink_id=drink_id,
                    drink_name=proposal.drink_name,
                    reason=f"No shop teagent is online for {proposal.shop_id}, so nobody can confirm it is in stock.",
                    by="registry",
                )
            )

    ranked = sorted(
        (
            RankedDrink(
                drink_id=drink_id,
                drink_name=proposal.drink_name,
                score=combined_score(weights, scores[drink_id]),
                shop_id=proposal.shop_id,
                price=proposal.price,
                dimension_scores={dim: scores[drink_id].get(dim, 0.0) for dim in DIMENSIONS},
            )
            for drink_id, proposal in first.items()
            if drink_id not in removed
        ),
        key=lambda item: (-item.score, item.drink_id),
    )

    if not ranked:
        return Decision(
            drink_id="",
            drink_name="",
            shop_id="",
            score=0.0,
            ask_human=True,
            question="Every suggested drink was ruled out. What would you like instead?",
            alternatives=[],
            explanation="No candidate survived the vetoes and stock checks.",
            options=[],
            weights=weights,
            dropped=dropped,
        )

    options = ranked[:top_k]
    winner = options[0]
    ask_human = False
    question: str | None = None
    if len(options) >= 2 and winner.score - options[1].score <= TIE_GAP:
        ask_human = True
        question = (
            f"{winner.drink_name} and {options[1].drink_name} are nearly tied "
            f"({winner.score:.2f} vs {options[1].score:.2f}). Your pick will teach us which matters more."
        )

    return Decision(
        drink_id=winner.drink_id,
        drink_name=winner.drink_name,
        shop_id=winner.shop_id,
        score=winner.score,
        ask_human=ask_human,
        question=question,
        alternatives=options[1:],
        explanation=_explain(winner, options[1] if len(options) > 1 else None, weights, dropped),
        options=options,
        weights=weights,
        dropped=dropped,
    )


def _explain(
    winner: RankedDrink,
    runner: RankedDrink | None,
    weights: dict[str, float],
    dropped: list[DroppedDrink],
) -> str:
    lead = max(DIMENSIONS, key=lambda dim: (weights[dim] * winner.dimension_scores[dim], dim))
    text = (
        f"{winner.drink_name} ranks first ({winner.score:.2f}). "
        f"Its biggest boost is {LABELS[lead]}, which counts for {round(weights[lead] * 100)}% for you."
    )
    if runner is not None:
        edge = max(
            DIMENSIONS,
            key=lambda dim: (weights[dim] * (winner.dimension_scores[dim] - runner.dimension_scores[dim]), dim),
        )
        text += f" It beats {runner.drink_name} mainly on {LABELS[edge]}."
    if dropped:
        text += " Ruled out: " + ", ".join(item.drink_name for item in dropped) + "."
    return text
