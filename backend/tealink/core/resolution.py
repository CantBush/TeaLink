"""Pick a winner from proposals and objections.

TODO: blend agent scores with learned weights and compare the result to the
popularity baseline. The rule below is the demo resolver: drop vetoed drinks,
keep the highest score, and ask a human when the top two are within 0.05.
"""

from __future__ import annotations

from tealink.schemas import Decision, Objection, ObjectionKind, Proposal, RankedDrink

ASK_HUMAN_GAP = 0.05


def resolve(proposals: list[Proposal], objections: list[Objection]) -> Decision:
    """Deterministic winner among proposals that were not vetoed."""
    vetoed = {
        objection.target_drink_id
        for objection in objections
        if objection.kind == ObjectionKind.veto
    }
    best_by_drink: dict[str, Proposal] = {}
    for proposal in proposals:
        if proposal.drink_id in vetoed:
            continue
        current = best_by_drink.get(proposal.drink_id)
        if current is None or _better(proposal, current):
            best_by_drink[proposal.drink_id] = proposal

    ranked = sorted(
        best_by_drink.values(), key=lambda item: (-item.score, item.drink_id)
    )
    if not ranked:
        veto_list = ", ".join(sorted(vetoed)) if vetoed else "none"
        return Decision(
            drink_id="",
            drink_name="",
            shop_id="",
            score=0.0,
            ask_human=True,
            question="Every suggested drink was vetoed. What would you like instead?",
            alternatives=[],
            explanation=f"No proposal survived the vetoes ({veto_list}).",
        )

    winner = ranked[0]
    ask_human = False
    question: str | None = None
    if len(ranked) >= 2 and abs(ranked[0].score - ranked[1].score) <= ASK_HUMAN_GAP:
        ask_human = True
        runner = ranked[1]
        question = (
            f"{winner.drink_name} ({winner.score:.2f}) and {runner.drink_name} "
            f"({runner.score:.2f}) are within 0.05. Which one should we order?"
        )

    alternatives = [
        RankedDrink(drink_id=item.drink_id, drink_name=item.drink_name, score=item.score)
        for item in ranked[1:]
    ]
    veto_note = ""
    if vetoed:
        veto_note = " Vetoed: " + ", ".join(sorted(vetoed)) + "."
    explanation = (
        f"Chose {winner.drink_name} with score {winner.score:.2f} from {winner.agent_id}."
        + veto_note
    )
    return Decision(
        drink_id=winner.drink_id,
        drink_name=winner.drink_name,
        shop_id=winner.shop_id,
        score=winner.score,
        ask_human=ask_human,
        question=question,
        alternatives=alternatives,
        explanation=explanation,
    )


def _better(candidate: Proposal, current: Proposal) -> bool:
    if candidate.score != current.score:
        return candidate.score > current.score
    return _agent_rank(candidate.agent_id) < _agent_rank(current.agent_id)


def _agent_rank(agent_id: str) -> tuple[int, str]:
    if agent_id == "taste":
        return (0, agent_id)
    if agent_id == "social":
        return (1, agent_id)
    if agent_id == "explorer":
        return (2, agent_id)
    return (3, agent_id)
