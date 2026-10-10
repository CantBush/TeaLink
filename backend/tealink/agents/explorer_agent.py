"""Explorer stub: prefer a drink this user has never reviewed."""

from __future__ import annotations

from tealink.agents.base import BaseAgent, orderable
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.agents.scoring import score_drink, user_profile
from tealink.core.taste import mean_absolute_difference
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest, Drink, Objection, ObjectionKind, Proposal


class ExplorerAgent(BaseAgent):
    agent_id = "explorer"

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name="Explorer",
            description="Suggests a drink this user has not reviewed.",
            capabilities=CAPABILITIES["explorer"],
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        picked = self._pick(request, catalog)
        if request.round == "object":
            return AgentReply(agent_id=self.agent_id, objections=self._objections(request, catalog, picked))
        if picked is None:
            return AgentReply(agent_id=self.agent_id)
        profile = user_profile(catalog, request.user_id)
        score, factors = score_drink(profile, picked, request.preference_overrides)
        return AgentReply(
            agent_id=self.agent_id,
            proposals=[
                Proposal(
                    agent_id=self.agent_id,
                    drink_id=picked.id,
                    drink_name=picked.name,
                    shop_id=picked.shop_id,
                    score=score,
                    factors=factors,
                    evidence=[],
                    rationale=f"{picked.name} is new for this user, so it is the novelty pick.",
                )
            ],
        )

    def _pick(self, request: DeliberationRequest, catalog: Catalog) -> Drink | None:
        tried = {review.drink_id for review in catalog.reviews_for(request.user_id)}
        profile = user_profile(catalog, request.user_id)
        fresh = [
            drink
            for drink in catalog.drinks
            if drink.id not in tried and orderable(drink, request.sold_out_drink_ids)
        ]
        pool = fresh or [
            drink
            for drink in catalog.drinks
            if orderable(drink, request.sold_out_drink_ids)
        ]
        if not pool:
            return None
        pool.sort(
            key=lambda drink: (
                -mean_absolute_difference(profile, drink.attributes),
                drink.id,
            )
        )
        return pool[0]

    def _objections(
        self,
        request: DeliberationRequest,
        catalog: Catalog,
        picked: Drink | None,
    ) -> list[Objection]:
        if not request.candidate_drink_ids:
            return []
        tried = {review.drink_id for review in catalog.reviews_for(request.user_id)}
        target = picked.id if picked is not None and picked.id in request.candidate_drink_ids else request.candidate_drink_ids[0]
        if target in tried:
            return [
                Objection(
                    agent_id=self.agent_id,
                    target_drink_id=target,
                    kind=ObjectionKind.concern,
                    reason="This user has already reviewed this drink.",
                )
            ]
        return [
            Objection(
                agent_id=self.agent_id,
                target_drink_id=target,
                kind=ObjectionKind.support,
                reason="This drink is new for this user.",
            )
        ]
