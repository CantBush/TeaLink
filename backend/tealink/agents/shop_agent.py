"""Shop agent stub: menu proposal, and a veto when its drink is sold out."""

from __future__ import annotations

from tealink.agents.base import BaseAgent, orderable
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.agents.scoring import score_drink, user_profile
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest, Objection, ObjectionKind, Proposal


class ShopAgent(BaseAgent):
    def __init__(self, shop_id: str, shop_name: str | None = None) -> None:
        self.shop_id = shop_id
        self.shop_name = shop_name or shop_id
        self.agent_id = f"shop_{shop_id}"

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name=f"{self.shop_name} agent",
            description=f"Reports the menu and availability for {self.shop_name}.",
            capabilities=CAPABILITIES["shop"],
            shop_id=self.shop_id,
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        if request.round == "object":
            return AgentReply(agent_id=self.agent_id, objections=self._objections(request, catalog))
        proposal = self._proposal(request, catalog)
        if proposal is None:
            return AgentReply(
                agent_id=self.agent_id,
                objections=[
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=request.sold_out_drink_ids[0] if request.sold_out_drink_ids else self.shop_id,
                        kind=ObjectionKind.veto,
                        reason=f"Nothing on the {self.shop_name} menu is available.",
                    )
                ],
            )
        return AgentReply(agent_id=self.agent_id, proposals=[proposal])

    def _proposal(self, request: DeliberationRequest, catalog: Catalog) -> Proposal | None:
        menu = [
            drink
            for drink in catalog.drinks
            if drink.shop_id == self.shop_id and orderable(drink, request.sold_out_drink_ids)
        ]
        if not menu:
            return None
        profile = user_profile(catalog, request.user_id)
        scored = [
            (drink, *score_drink(profile, drink, request.preference_overrides))
            for drink in menu
        ]
        scored.sort(key=lambda item: (-item[1], item[0].id))
        drink, score, factors = scored[0]
        return Proposal(
            agent_id=self.agent_id,
            drink_id=drink.id,
            drink_name=drink.name,
            shop_id=drink.shop_id,
            score=score,
            factors=factors,
            evidence=[],
            rationale=f"{drink.name} is available on the {self.shop_name} menu.",
        )

    def _objections(self, request: DeliberationRequest, catalog: Catalog) -> list[Objection]:
        objections: list[Objection] = []
        for drink_id in request.candidate_drink_ids:
            drink = catalog.drink(drink_id)
            owns = drink is not None and drink.shop_id == self.shop_id
            sold_out = drink_id in request.sold_out_drink_ids
            if sold_out and (owns or drink is None):
                name = drink.name if drink is not None else drink_id
                objections.append(
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=drink_id,
                        kind=ObjectionKind.veto,
                        reason=f"{name} is sold out.",
                    )
                )
            elif owns and drink is not None and not drink.available:
                objections.append(
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=drink_id,
                        kind=ObjectionKind.veto,
                        reason=f"{drink.name} is not available.",
                    )
                )
            elif owns and drink is not None:
                objections.append(
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=drink_id,
                        kind=ObjectionKind.support,
                        reason=f"{drink.name} is on the menu at {self.shop_name.rstrip('.')}.",
                    )
                )
        if objections:
            return objections
        if not request.candidate_drink_ids:
            return []
        return [
            Objection(
                agent_id=self.agent_id,
                target_drink_id=request.candidate_drink_ids[0],
                kind=ObjectionKind.concern,
                reason=f"Not on the {self.shop_name} menu.",
            )
        ]
