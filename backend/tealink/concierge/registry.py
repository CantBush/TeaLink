"""In-memory agent cards, capability selection, and heartbeats."""

from __future__ import annotations

from datetime import datetime, timezone

from tealink.agents.cards import AgentCardInfo
from tealink.schemas import AgentSelection

HEARTBEAT_TTL_SECONDS = 30.0

_CORE_REASONS = {
    "taste": "Selected taste for taste_profile and personal_history{query}.",
    "social": "Selected social for similar_users{query}.",
    "explorer": "Selected explorer for novelty{query}.",
}


class Registry:
    def __init__(self) -> None:
        self._cards: dict[str, AgentCardInfo] = {}
        self._heartbeats: dict[str, datetime] = {}

    def register(self, card: AgentCardInfo) -> None:
        self._cards[card.id] = card
        self.heartbeat(card.id)

    def heartbeat(self, agent_id: str, now: datetime | None = None) -> None:
        self._heartbeats[agent_id] = now or datetime.now(timezone.utc)

    def get(self, agent_id: str) -> AgentCardInfo | None:
        return self._cards.get(agent_id)

    def list(self) -> list[AgentCardInfo]:
        return [self._cards[key] for key in sorted(self._cards)]

    def is_online(self, agent_id: str, now: datetime | None = None) -> bool:
        last = self._heartbeats.get(agent_id)
        if last is None:
            return False
        current = now or datetime.now(timezone.utc)
        return (current - last).total_seconds() <= HEARTBEAT_TTL_SECONDS

    def select_for_query(self, query: str, now: datetime | None = None) -> list[AgentSelection]:
        """Always include taste, social, and explorer, plus online shop agents."""
        suffix = f" to answer '{query}'" if query else ""
        selected: list[AgentSelection] = []
        for agent_id in ("taste", "social", "explorer"):
            card = self._cards.get(agent_id)
            if card is None:
                continue
            selected.append(
                AgentSelection(
                    agent_id=card.id,
                    capabilities=list(card.capabilities),
                    reason=_CORE_REASONS[agent_id].format(query=suffix),
                )
            )
        shops = [
            card
            for card in self._cards.values()
            if card.shop_id and self.is_online(card.id, now=now)
        ]
        shops.sort(key=lambda card: card.id)
        for card in shops:
            selected.append(
                AgentSelection(
                    agent_id=card.id,
                    capabilities=list(card.capabilities),
                    reason=(
                        f"Selected {card.name} for availability and menu"
                        f"{suffix}, and the shop is online."
                    ),
                )
            )
        return selected
