"""Social agent stub. For Andrew, prefer a drink Sarah rated that he has not tried."""

from __future__ import annotations

from tealink.agents.base import BaseAgent, orderable
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.agents.scoring import score_drink, user_profile
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest, Drink, Objection, ObjectionKind, Proposal, Review


class SocialAgent(BaseAgent):
    agent_id = "social"

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name="Social",
            description="Suggests a drink that a similar customer rated highly.",
            capabilities=CAPABILITIES["social"],
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        pick = self._pick(request, catalog)
        if request.round == "object":
            return AgentReply(
                agent_id=self.agent_id,
                objections=self._objections(request, pick[0] if pick else None),
            )
        if pick is None:
            return AgentReply(agent_id=self.agent_id)
        drink, review = pick
        profile = user_profile(catalog, request.user_id)
        score, factors = score_drink(profile, drink, request.preference_overrides)
        reviewer = catalog.users_by_id.get(review.user_id)
        reviewer_name = reviewer.name if reviewer else review.user_id
        return AgentReply(
            agent_id=self.agent_id,
            proposals=[
                Proposal(
                    agent_id=self.agent_id,
                    drink_id=drink.id,
                    drink_name=drink.name,
                    shop_id=drink.shop_id,
                    score=score,
                    factors=factors,
                    evidence=[],
                    rationale=(
                        f"{reviewer_name} rated {drink.name} {review.rating}/5 "
                        "and this user has not tried it."
                    ),
                )
            ],
        )

    def _pick(
        self, request: DeliberationRequest, catalog: Catalog
    ) -> tuple[Drink, Review] | None:
        tried = {review.drink_id for review in catalog.reviews_for(request.user_id)}
        pool = self._pool(request.user_id, catalog, tried, request.sold_out_drink_ids)
        if not pool:
            return None
        pool.sort(key=lambda item: self._sort_key(item[0], item[1]))
        return pool[0]

    def _pool(
        self,
        user_id: str,
        catalog: Catalog,
        tried: set[str],
        sold_out: list[str],
    ) -> list[tuple[Drink, Review]]:
        if user_id == "andrew":
            source = catalog.reviews_for("sarah")
        else:
            source = [review for review in catalog.reviews if review.user_id != user_id]
        pool: list[tuple[Drink, Review]] = []
        for review in source:
            if review.rating < 4 or review.drink_id in tried:
                continue
            drink = catalog.drink(review.drink_id)
            if drink is None or not orderable(drink, sold_out):
                continue
            pool.append((drink, review))
        return pool

    def _sort_key(self, drink: Drink, review: Review) -> tuple:
        hojicha_cream = 0 if drink.id == "sr_hojicha_cream" else 1
        return (-review.rating, hojicha_cream, drink.id, review.user_id)

    def _objections(self, request: DeliberationRequest, picked: Drink | None) -> list[Objection]:
        if not request.candidate_drink_ids:
            return []
        target = request.candidate_drink_ids[0]
        if picked is not None and picked.id in request.candidate_drink_ids:
            target = picked.id
            kind = ObjectionKind.support
            reason = f"{picked.name} is the drink a similar customer would order."
        else:
            kind = ObjectionKind.concern
            reason = "This is not the drink similar customers preferred."
        return [
            Objection(
                agent_id=self.agent_id,
                target_drink_id=target,
                kind=kind,
                reason=reason,
            )
        ]
