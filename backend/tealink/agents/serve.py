"""Serve one agent over A2A on NATS.

Local mode does not use this module. The API calls agent classes in-process.
If agntcy-app-sdk is missing or its startup API does not match, this process
prints the reason and exits 1.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from tealink.agents.base import BaseAgent
from tealink.agents.roster import make_agent
from tealink.config import get_settings
from tealink.data.loader import Catalog, load_catalog
from tealink.schemas import DeliberationRequest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Serve one TeaLink agent over A2A/NATS")
    parser.add_argument("--agent", required=True, choices=["taste", "social", "explorer", "shop"])
    parser.add_argument("--shop-id", default=None)
    args = parser.parse_args(argv)
    if args.agent == "shop" and not args.shop_id:
        print("--shop-id is required for the shop agent", file=sys.stderr)
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
        start_agntcy(agent, catalog)
    except SystemExit as exc:
        code = exc.code
        return int(code) if isinstance(code, int) else 1
    return 0


def start_agntcy(agent: BaseAgent, catalog: Catalog) -> None:
    try:
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

    class _Executor(AgentExecutor):
        async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
            text = context.get_user_input()
            try:
                request = DeliberationRequest.model_validate_json(text)
                reply = agent.handle(request, catalog)
                body = reply.model_dump_json()
            except Exception as exc:
                body = f"TeaLink agent {agent.agent_id} could not handle the message: {exc}"
            await event_queue.enqueue_event(new_agent_text_message(body))

        async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
            return None

    factory = AgntcyFactory("tealink")
    session = factory.create_app_session()
    handler = DefaultRequestHandler(
        agent_executor=_Executor(),
        task_store=InMemoryTaskStore(),
    )
    try:
        asyncio.run(
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


if __name__ == "__main__":
    raise SystemExit(main())
