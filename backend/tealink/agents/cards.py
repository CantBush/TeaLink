"""Agent cards for the registry, plus an optional a2a AgentCard."""

from __future__ import annotations

from pydantic import BaseModel

CAPABILITIES: dict[str, list[str]] = {
    "taste": ["taste_profile", "personal_history"],
    "social": ["similar_users"],
    "explorer": ["novelty"],
    "shop": ["availability", "menu"],
}


class AgentCardInfo(BaseModel):
    id: str
    name: str
    description: str
    capabilities: list[str]
    shop_id: str | None = None


def try_a2a_card(info: AgentCardInfo, nats_url: str = "nats://localhost:4222"):
    """Build an a2a AgentCard when the library imports. Otherwise return None.

    The card advertises a NATS interface so ``add_a2a_card`` can serve it.
    ``nats_url`` is ``scheme://host:port``; the topic is ``tealink.<agent id>``.
    """
    try:
        from urllib.parse import urlparse

        from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill
    except ImportError:
        return None
    try:
        parsed = urlparse(nats_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 4222
        topic = f"tealink.{info.id}"
        skills = [
            AgentSkill(
                id=capability,
                name=capability,
                description=capability,
                tags=[capability],
            )
            for capability in info.capabilities
        ]
        return AgentCard(
            name=info.name,
            description=info.description,
            url=f"nats://{host}:{port}/{topic}",
            version="0.1.0",
            preferred_transport="natspatterns",
            default_input_modes=["text"],
            default_output_modes=["text"],
            capabilities=AgentCapabilities(streaming=True),
            skills=skills,
            additional_interfaces=[
                AgentInterface(
                    transport="natspatterns",
                    url=f"nats://{host}:{port}/{topic}",
                )
            ],
        )
    except Exception:
        return None
