"""Base for agents that each optimize one objective (taste, social, novelty, cost).

These agents know nothing about inventory. They propose drinks they like by
their own objective, then score every candidate the same way. Shop agents are
the only ones who can say a drink is sold out.
"""

from __future__ import annotations

import statistics
from typing import Any, Literal, cast

from tealink.agents.base import BaseAgent
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.agents.scoring import score_drink, user_profile
from tealink.core.retrieval import retrieve_evidence
from tealink.data.loader import Catalog
from tealink.schemas import (
    AgentReply,
    DeliberationRequest,
    Drink,
    Evidence,
    Objection,
    ObjectionKind,
    Proposal,
    RevisedFrom,
)

SUPPORT_AT = 0.55
CONCERN_BELOW = 0.45

# Concern is harder than neutral, which is harder than support. Veto is off this scale.
_SOFTNESS = {
    ObjectionKind.concern: 0,
    ObjectionKind.neutral: 1,
    ObjectionKind.support: 2,
}


def stance(score: float) -> ObjectionKind:
    if score >= SUPPORT_AT:
        return ObjectionKind.support
    if score < CONCERN_BELOW:
        return ObjectionKind.concern
    return ObjectionKind.neutral


def soften_objection(current: Objection, peer_scores: list[float]) -> Objection:
    """Move halfway toward the other objective agents, and only in the soft direction.

    Concern and neutral may rise. Support may fall, but not below ``SUPPORT_AT``,
    so it cannot become a concern. A harder kind is rejected. An unchanged
    stance omits ``revised_from``. A veto is copied with no ``revised_from``.
    """
    unchanged = current.model_copy(update={"revised_from": None})
    if current.kind == ObjectionKind.veto or current.score is None or current.kind not in _SOFTNESS:
        return unchanged
    if not peer_scores:
        return unchanged
    halfway = (current.score + statistics.median(peer_scores)) / 2.0
    if current.kind in (ObjectionKind.concern, ObjectionKind.neutral):
        new_score = max(current.score, halfway)
    else:
        new_score = max(SUPPORT_AT, min(current.score, halfway))
    new_kind = stance(new_score)
    if _SOFTNESS[new_kind] < _SOFTNESS[current.kind]:
        return unchanged
    if new_kind == current.kind and abs(new_score - current.score) <= 1e-9:
        return unchanged
    previous = cast(Literal["support", "concern", "neutral"], current.kind.value)
    return current.model_copy(
        update={
            "kind": new_kind,
            "score": new_score,
            "revised_from": RevisedFrom(kind=previous, score=current.score),
        }
    )


class ObjectiveAgent(BaseAgent):
    agent_id: str
    dimension: str
    name: str
    description: str
    proposals_per_round = 3

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name=self.name,
            description=self.description,
            capabilities=CAPABILITIES[self.agent_id],
        )

    def context(self, request: DeliberationRequest, catalog: Catalog) -> Any:
        return None

    def objective(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> tuple[float, str]:
        raise NotImplementedError

    def eligible(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> bool:
        return drink.available

    def evidence(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink
    ) -> list[Evidence]:
        return retrieve_evidence(catalog.reviews_for(request.user_id), catalog.drinks_by_id, drink, k=3)

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        ctx = self.context(request, catalog)
        if request.round == "object":
            return AgentReply(agent_id=self.agent_id, objections=self._evaluate(request, catalog, ctx))
        if request.round == "revise":
            return AgentReply(agent_id=self.agent_id, objections=self._revise(request, catalog, ctx))
        if request.round != "propose":
            return AgentReply(agent_id=self.agent_id)
        return AgentReply(agent_id=self.agent_id, proposals=self._propose(request, catalog, ctx))

    def _propose(self, request: DeliberationRequest, catalog: Catalog, ctx: Any) -> list[Proposal]:
        scored = []
        for drink in catalog.drinks:
            if not self.eligible(request, catalog, drink, ctx):
                continue
            score, detail = self.objective(request, catalog, drink, ctx)
            scored.append((score, drink, detail))
        scored.sort(key=lambda item: (-item[0], item[1].id))
        profile = user_profile(catalog, request.user_id)
        proposals: list[Proposal] = []
        for score, drink, detail in scored[: self.proposals_per_round]:
            _taste, factors = score_drink(profile, drink, request.preference_overrides)
            proposals.append(
                Proposal(
                    agent_id=self.agent_id,
                    drink_id=drink.id,
                    drink_name=drink.name,
                    shop_id=drink.shop_id,
                    score=score,
                    factors=factors,
                    evidence=self.evidence(request, catalog, drink),
                    rationale=detail,
                    price=drink.price,
                    dimension=self.dimension,
                )
            )
        return proposals

    def _evaluate(self, request: DeliberationRequest, catalog: Catalog, ctx: Any) -> list[Objection]:
        objections: list[Objection] = []
        for drink_id in request.candidate_drink_ids:
            drink = catalog.drink(drink_id)
            if drink is None:
                continue
            score, detail = self.objective(request, catalog, drink, ctx)
            objections.append(
                Objection(
                    agent_id=self.agent_id,
                    target_drink_id=drink_id,
                    kind=stance(score),
                    reason=f"{drink.name}: {detail}",
                    score=score,
                    dimension=self.dimension,
                )
            )
        return objections

    def _revise(self, request: DeliberationRequest, catalog: Catalog, ctx: Any) -> list[Objection]:
        """Soften each of this agent's scores toward the other objective agents."""
        own = {
            item.target_drink_id: item
            for item in request.peer_objections
            if item.agent_id == self.agent_id
        }
        peers: dict[str, dict[str, float]] = {}
        for item in request.peer_objections:
            if item.agent_id == self.agent_id or item.score is None or item.dimension is None:
                continue
            if item.kind == ObjectionKind.veto:
                continue
            peers.setdefault(item.target_drink_id, {})[item.agent_id] = float(item.score)
        drink_ids = list(request.candidate_drink_ids) or list(own)
        objections: list[Objection] = []
        for drink_id in drink_ids:
            old = own.get(drink_id)
            if old is None:
                drink = catalog.drink(drink_id)
                if drink is None:
                    continue
                score, detail = self.objective(request, catalog, drink, ctx)
                objections.append(
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=drink_id,
                        kind=stance(score),
                        reason=f"{drink.name}: {detail}",
                        score=score,
                        dimension=self.dimension,
                    )
                )
                continue
            objections.append(soften_objection(old, list(peers.get(drink_id, {}).values())))
        return objections
