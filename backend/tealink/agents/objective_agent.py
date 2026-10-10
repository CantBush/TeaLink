"""Base for agents that each optimize one objective (taste, social, novelty, cost).

These agents know nothing about inventory. They propose drinks they like by
their own objective, then score every candidate the same way. Shop agents are
the only ones who can say a drink is sold out.
"""

from __future__ import annotations

from typing import Any

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
)

SUPPORT_AT = 0.55
CONCERN_BELOW = 0.45


def stance(score: float) -> ObjectionKind:
    if score >= SUPPORT_AT:
        return ObjectionKind.support
    if score < CONCERN_BELOW:
        return ObjectionKind.concern
    return ObjectionKind.neutral


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
