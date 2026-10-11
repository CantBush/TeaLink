"""Serve one teagent over A2A on NATS.

Local mode does not use this module. The API calls teagent classes in-process.
If agntcy-app-sdk is missing, NATS is down, or the SDK startup API does not
match, this process prints the reason and exits 1.

``--standby`` subscribes but does not heartbeat until a join control message.
That is how Lantern Leaf stays offline until ``POST /events/shop-join``.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from tealink.agents.base import BaseAgent
from tealink.agents.roster import AGENT_KINDS, make_agent
from tealink.bus import (
    CONTROL_SUBJECT,
    HEARTBEAT_INTERVAL_SECONDS,
    HEARTBEAT_SUBJECT,
    heartbeat_body,
    parse_body,
)
from tealink.config import get_settings
from tealink.data.loader import Catalog, load_catalog
from tealink.schemas import DeliberationRequest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve one TeaLink teagent over A2A/NATS")
    parser.add_argument("--agent", required=True, choices=list(AGENT_KINDS))
    parser.add_argument("--shop-id", default=None)
    parser.add_argument(
        "--standby",
        action="store_true",
        help="Do not heartbeat until a join control message arrives",
    )
    args = parser.parse_args(argv)
    if args.agent == "shop" and not args.shop_id:
        print("--shop-id is required for the shop teagent", file=sys.stderr)
        return 1
    try:
        catalog = load_catalog()
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    shop_name = None
    if args.shop_id:
        shop = catalog.shop(args.shop_id)
        shop_name = shop.name if shop else args.shop_id
    agent = make_agent(args.agent, shop_id=args.shop_id, shop_name=shop_name)
    try:
        asyncio.run(_serve(agent, catalog, standby=args.standby))
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 1
    return 0


async def _serve(agent: BaseAgent, catalog: Catalog, standby: bool) -> None:
    try:
        import nats
        from agntcy_app_sdk.factory import AgntcyFactory
    except ImportError:
        print(
            "agntcy-app-sdk is not installed, so A2A over NATS cannot start. "
            "Run the API with TRANSPORT=local.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    from tealink.agents.cards import try_a2a_card

    settings = get_settings()
    a2a_card = try_a2a_card(agent.card(), nats_url=settings.nats_url)
    if a2a_card is None:
        print(
            "a2a AgentCard could not be built. Install a2a-sdk or set TRANSPORT=local.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    try:
        from a2a.server.agent_execution import AgentExecutor
        from a2a.server.agent_execution.context import RequestContext
        from a2a.server.events.event_queue import EventQueue
        from a2a.server.request_handlers import DefaultRequestHandler
        from a2a.server.tasks import InMemoryTaskStore
        from a2a.utils.message import new_agent_text_message
    except ImportError as exc:
        print(
            f"a2a-sdk is not installed ({exc}). Set TRANSPORT=local.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    try:
        nc = await nats.connect(settings.nats_url, connect_timeout=2)
    except Exception as exc:
        print(
            f"Could not connect to NATS at {settings.nats_url} ({type(exc).__name__}: {exc}). "
            "Start it with `make bus`, or run the API with TRANSPORT=local.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    presence = _Presence(standby)

    async def publish_beat() -> None:
        if presence.publishing:
            await nc.publish(HEARTBEAT_SUBJECT, heartbeat_body(agent.agent_id))

    async def on_control(msg) -> None:
        payload = parse_body(msg.data)
        if payload is None:
            return
        target = payload.get("agent_id")
        if target not in (agent.agent_id, "*"):
            return
        action = payload.get("action")
        if action == "join" and target == agent.agent_id:
            presence.publishing = True
            await publish_beat()
        elif action == "offline" and target == agent.agent_id:
            presence.publishing = False
        elif action == "reset":
            reset = getattr(agent, "reset", None)
            if reset is not None:
                reset()
            presence.publishing = not presence.standby
            await publish_beat()

    await nc.subscribe(CONTROL_SUBJECT, cb=on_control)

    class _Executor(AgentExecutor):
        async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
            text = context.get_user_input()
            try:
                request = DeliberationRequest.model_validate_json(text)
                reply = agent.handle(request, catalog)
                body = reply.model_dump_json()
            except Exception as exc:
                body = f"TeaLink teagent {agent.agent_id} could not handle the message: {exc}"
            await event_queue.enqueue_event(new_agent_text_message(body))

        async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
            return None

    async def beats() -> None:
        while True:
            try:
                await publish_beat()
            except Exception:
                return
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)

    beat_task = asyncio.create_task(beats())
    factory = AgntcyFactory("tealink", log_level="WARNING")
    session = factory.create_app_session()
    handler = DefaultRequestHandler(
        agent_executor=_Executor(),
        task_store=InMemoryTaskStore(),
    )
    try:
        await (
            session.add_a2a_card(a2a_card, handler)
            .with_factory(factory)
            .start(keep_alive=True)
        )
    except Exception as exc:
        print(
            "agntcy-app-sdk imported, but A2A over NATS did not start "
            f"({type(exc).__name__}: {exc}). Set TRANSPORT=local.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    finally:
        beat_task.cancel()
        try:
            await nc.drain()
        except Exception:
            pass


class _Presence:
    def __init__(self, standby: bool) -> None:
        self.standby = standby
        self.publishing = not standby


if __name__ == "__main__":
    raise SystemExit(main())
