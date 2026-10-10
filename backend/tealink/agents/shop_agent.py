"""Shop agent: the only agent that knows its own inventory.

It does not propose drinks. In the objection round it confirms its own
candidates are in stock, or vetoes the ones that are sold out.
"""

from __future__ import annotations

from tealink.agents.base import BaseAgent
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest, Objection, ObjectionKind, Offer

# A close-call discount never exceeds this share of the drink's price.
MAX_DISCOUNT = 0.10


class ShopAgent(BaseAgent):
    def __init__(self, shop_id: str, shop_name: str | None = None, promo_budget: float = 1.0) -> None:
        self.shop_id = shop_id
        self.shop_name = shop_name or shop_id
        self.promo_budget = promo_budget
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
        if request.round == "offer":
            return AgentReply(agent_id=self.agent_id, offer=self._offer(request, catalog))
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

    def _offer(self, request: DeliberationRequest, catalog: Catalog) -> Offer | None:
        """Up to 10% off, and never more than this shop's promo budget."""
        if len(request.candidate_drink_ids) != 1:
            return None
        drink = catalog.drink(request.candidate_drink_ids[0])
        if drink is None or drink.shop_id != self.shop_id or drink.price <= 0 or self.promo_budget <= 0:
            return None
        fraction = min(MAX_DISCOUNT, self.promo_budget / drink.price)
        price_after = round(drink.price * (1 - fraction), 2)
        if price_after >= drink.price:
            return None
        percent = round((drink.price - price_after) / drink.price * 100)
        shop = self.shop_name.rstrip(".")
        return Offer(
            shop_id=self.shop_id,
            percent=percent,
            price_after=price_after,
            reason=f"{shop} takes {percent}% off {drink.name} (${drink.price:.2f} to ${price_after:.2f}).",
        )
