"""Shop agent: the only agent that knows its own inventory.

It does not propose drinks. In the objection round it confirms its own
candidates are in stock, or vetoes the ones that are sold out.
"""

from __future__ import annotations

from tealink.agents.base import BaseAgent
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest, Objection, ObjectionKind


class ShopAgent(BaseAgent):
    def __init__(self, shop_id: str, shop_name: str | None = None) -> None:
        self.shop_id = shop_id
        self.shop_name = shop_name or shop_id
        self.agent_id = f"shop_{shop_id}"

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name=f"{self.shop_name} agent",
            description=f"Confirms what is in stock at {self.shop_name}.",
            capabilities=CAPABILITIES["shop"],
            shop_id=self.shop_id,
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        if request.round != "object":
            return AgentReply(agent_id=self.agent_id)
        shop = self.shop_name.rstrip(".")
        objections: list[Objection] = []
        for drink_id in request.candidate_drink_ids:
            drink = catalog.drink(drink_id)
            if drink is None or drink.shop_id != self.shop_id:
                continue
            if drink_id in request.sold_out_drink_ids or not drink.available:
                kind = ObjectionKind.veto
                reason = f"{drink.name} is sold out at {shop}."
            else:
                kind = ObjectionKind.support
                reason = f"{drink.name} is in stock at {shop} (${drink.price:.2f})."
            objections.append(
                Objection(agent_id=self.agent_id, target_drink_id=drink_id, kind=kind, reason=reason)
            )
        return AgentReply(agent_id=self.agent_id, objections=objections)
