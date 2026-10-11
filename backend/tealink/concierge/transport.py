"""In-process transport, and A2A over NATS.

``AgentCardInfo`` is the card the registry stores. It stands in for an a2a
``AgentCard`` so local mode does not import the SDK.

``TRANSPORT=local`` (the default) never touches NATS. ``TRANSPORT=agntcy``
sends each deliberation message to that agent's process. Agents that are not
heartbeating are answered by the in-process fallback, so the HTTP API Emily's
frontend calls stays the same either way.
"""

from __future__ import annotations

import asyncio
import sys
import time
import uuid
from typing import Protocol

from tealink.agents.base import BaseAgent
from tealink.agents.cards import AgentCardInfo, try_a2a_card
from tealink.bus import CONTROL_SUBJECT, HEARTBEAT_SUBJECT, control_body, parse_body
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest


class ReviseTimeout(Exception):
    """A revise send took the NATS failure path. That rebuttal is discarded."""

    def __init__(self, agent_id: str) -> None:
        self.agent_id = agent_id
        super().__init__(agent_id)


class AgentTransport(Protocol):
    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply: ...

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]: ...


class LocalTransport:
    def __init__(self, agents: dict[str, BaseAgent], catalog: Catalog) -> None:
        self.agents = agents
        self.catalog = catalog

    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        agent = self.agents.get(card.id)
        if agent is None:
            return AgentReply(agent_id=card.id)
        return agent.handle(msg, self.catalog)

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]:
        return [await self.send(card, msg) for card in cards]


class AgntcyTransport:
    """Gateway side of A2A over NATS.

    One shared NATS connection carries A2A. A second connection watches
    ``tealink.heartbeat`` and publishes ``tealink.control``. ``local_only``
    is the set of agent ids served by ``fallback`` because they never
    heartbeated, or a remote call failed.
    """

    def __init__(
        self,
        nats_url: str,
        fallback: LocalTransport,
        timeout: float = 4.0,
        reconcile_wait: float = 1.5,
    ) -> None:
        self.nats_url = nats_url
        self.fallback = fallback
        self.timeout = timeout
        self.reconcile_wait = reconcile_wait
        self.connected = False
        self.failure: str | None = None
        self.remote_replies: dict[str, int] = {}
        self.local_replies: dict[str, int] = {}
        self._local_only: set[str] = set()
        self._beats: dict[str, float] = {}
        self._nc = None
        self._factory = None
        self._config = None
        self._listening = False
        self._connect_lock = asyncio.Lock()
        # One shared NATS client. Overlapping request/reply calls leave it
        # unable to deliver the next reply, so deliberation sends take turns.
        self._send_lock = asyncio.Lock()

    @property
    def local_only(self) -> set[str]:
        return set(self._local_only)

    def note(self, agent_id: str) -> None:
        self._beats[agent_id] = time.monotonic()

    def recent(self, agent_id: str, window: float = 2.5) -> bool:
        seen = self._beats.get(agent_id)
        return seen is not None and (time.monotonic() - seen) <= window

    def reset_routes(self) -> None:
        """Forget which agents answered remotely. Used by the demo reset."""
        self._local_only.clear()
        self._beats.clear()

    async def connect(self) -> bool:
        async with self._connect_lock:
            if self.connected:
                return True
            try:
                import nats
                from agntcy_app_sdk.factory import AgntcyFactory
                from agntcy_app_sdk.semantic.a2a.client.config import (
                    ClientConfig,
                    NatsTransportConfig,
                )
                from agntcy_app_sdk.transport.nats.transport import NatsTransport
            except ImportError:
                self.failure = (
                    "agntcy-app-sdk is not installed, so A2A over NATS cannot start. "
                    "Using in-process agents."
                )
                return False
            try:
                self._nc = await nats.connect(self.nats_url, connect_timeout=2)
                shared = NatsTransport.from_config(self.nats_url, connect_timeout=2)
                await shared.setup()
                self._a2a = shared
            except Exception as exc:
                self.failure = (
                    "NATS is not available "
                    f"({type(exc).__name__}: {exc}). Using in-process agents."
                )
                await self._close_quiet()
                return False
            self._factory = AgntcyFactory("tealink-gateway", log_level="WARNING")
            # One JSON reply per deliberation message. Streaming keeps a NATS
            # subscription open and the next call to that agent then hangs.
            self._config = ClientConfig(
                streaming=False,
                nats_config=NatsTransportConfig(endpoint=self.nats_url),
                nats_transport=shared,
            )
            self.connected = True
            self.failure = None
            return True

    async def listen(self, on_heartbeat) -> None:
        """Subscribe to heartbeats. ``on_heartbeat`` is called with an agent id."""
        if self._listening or self._nc is None:
            return

        async def _on_message(msg) -> None:
            payload = parse_body(msg.data)
            if payload is None:
                return
            agent_id = payload.get("agent_id")
            if isinstance(agent_id, str) and agent_id:
                self.note(agent_id)
                on_heartbeat(agent_id)

        await self._nc.subscribe(HEARTBEAT_SUBJECT, cb=_on_message)
        self._listening = True

    async def publish_control(self, action: str, agent_id: str) -> None:
        if self._nc is None:
            return
        await self._nc.publish(CONTROL_SUBJECT, control_body(action, agent_id))
        await self._nc.flush()

    async def reconcile(self, registry, offline: set[str]) -> None:
        """After a short listen, remote-route agents that heartbeated.

        Everyone else stays selected, but ``send`` uses the in-process agent.
        ``offline`` agents are marked offline and are not routed at all.
        """
        self._beats.clear()
        await asyncio.sleep(self.reconcile_wait)
        now = time.monotonic()
        window = self.reconcile_wait + 0.5
        for card in registry.list():
            if card.id in offline:
                registry.mark_offline(card.id)
                continue
            seen = self._beats.get(card.id)
            if seen is not None and (now - seen) <= window:
                self._local_only.discard(card.id)
            else:
                self._local_only.add(card.id)
            registry.heartbeat(card.id)

    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        if not self.connected or card.id in self._local_only:
            return await self._local(card, msg)
        if msg.user_id in self.fallback.catalog.runtime_users:
            return await self._local(card, msg)
        attempts = 2 if self.remote_replies.get(card.id, 0) == 0 else 1
        last_error: Exception | None = None
        for _ in range(attempts):
            try:
                reply = await asyncio.wait_for(self._remote(card, msg), self.timeout)
            except Exception as exc:
                last_error = exc
                continue
            self._local_only.discard(card.id)
            self.remote_replies[card.id] = self.remote_replies.get(card.id, 0) + 1
            return reply
        self._local_only.add(card.id)
        if msg.round == "revise":
            print(
                f"{card.id} did not answer over NATS ({type(last_error).__name__}). Discarding this rebuttal.",
                file=sys.stderr,
            )
            raise ReviseTimeout(card.id)
        print(
            f"{card.id} did not answer over NATS ({type(last_error).__name__}). Using the in-process agent.",
            file=sys.stderr,
        )
        return await self._local(card, msg)

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]:
        return list(await asyncio.gather(*(self.send(card, msg) for card in cards)))

    async def _local(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        self.local_replies[card.id] = self.local_replies.get(card.id, 0) + 1
        return await self.fallback.send(card, msg)

    async def _remote(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        async with self._send_lock:
            return await self._remote_locked(card, msg)

    async def _remote_locked(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        # A cached client stops answering after the HTTP request that created
        # it returns. Open one per send; they share the NATS connection.
        client = await self._open_client(card)
        from a2a.types import Message, Part, Role, TextPart

        request = Message(
            role=Role.user,
            message_id=str(uuid.uuid4()),
            parts=[Part(root=TextPart(text=msg.model_dump_json()))],
        )
        texts: list[str] = []
        stream = client.send_message(request=request)
        try:
            while True:
                event = await stream.__anext__()
                texts.extend(_event_texts(event))
                for text in reversed(texts):
                    stripped = text.strip()
                    if stripped.startswith("{"):
                        return AgentReply.model_validate_json(stripped)
        except StopAsyncIteration:
            pass
        finally:
            closer = getattr(stream, "aclose", None)
            if closer is not None:
                try:
                    await asyncio.wait_for(closer(), timeout=0.2)
                except Exception:
                    pass
        preview = texts[-1][:180] if texts else "no text"
        raise RuntimeError(f"{card.id} reply was not an AgentReply ({preview})")

    async def _open_client(self, card: AgentCardInfo):
        a2a_card = try_a2a_card(card, nats_url=self.nats_url)
        if a2a_card is None or self._factory is None:
            raise RuntimeError("a2a AgentCard could not be built")
        return await self._factory.a2a(self._config).create(a2a_card)

    async def close(self) -> None:
        self.connected = False
        self._listening = False
        await self._close_quiet()
        a2a = getattr(self, "_a2a", None)
        self._a2a = None
        if a2a is not None:
            try:
                await a2a.close()
            except Exception:
                return

    async def _close_quiet(self) -> None:
        nc = self._nc
        self._nc = None
        if nc is None:
            return
        try:
            await nc.close()
        except Exception:
            return


def _event_texts(event) -> list[str]:
    """Pull text parts out of whatever ``send_message`` yields."""
    if event is None:
        return []
    if isinstance(event, tuple):
        found: list[str] = []
        for item in event:
            found.extend(_event_texts(item))
        return found
    parts = getattr(event, "parts", None)
    if parts:
        return [text for text in (_part_text(part) for part in parts) if text]
    found = []
    status = getattr(event, "status", None)
    message = getattr(status, "message", None) if status is not None else None
    if message is not None:
        found.extend(_event_texts(message))
    for item in getattr(event, "history", None) or []:
        found.extend(_event_texts(item))
    for artifact in getattr(event, "artifacts", None) or []:
        for part in getattr(artifact, "parts", None) or []:
            text = _part_text(part)
            if text:
                found.append(text)
    return found


def _part_text(part) -> str:
    root = getattr(part, "root", part)
    text = getattr(root, "text", None)
    if isinstance(text, str):
        return text
    if isinstance(part, dict):
        raw = part.get("text") or (part.get("root") or {}).get("text")
        return raw if isinstance(raw, str) else ""
    return ""
