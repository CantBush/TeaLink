"""TeaLink gateway. SSE deliberation uses LocalTransport unless TRANSPORT says otherwise.

``TRANSPORT=agntcy`` talks to agent processes over NATS. If the broker is
down, or an agent is not heartbeating, that call is answered in-process.
The HTTP routes and JSON shapes stay the same, so the frontend does not
branch on transport.
"""

from __future__ import annotations

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from tealink.agents.roster import default_agents
from tealink.agents.scoring import user_profile
from tealink.agents.shop_agent import ShopAgent
from tealink.api import social
from tealink.concierge.deliberation import deliberate
from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgntcyTransport, LocalTransport
from tealink.config import get_settings
from tealink.core import objectives
from tealink.data.loader import Catalog, load_catalog
from tealink.lens.recorder import LensRecorder
from tealink.schemas import ChoiceRecord, Decision, DeliberationRequest, LensEventType
from tealink.social.store import SocialStore, load_social

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Open NATS outside a request so its reader task outlives each call.

    A connection opened inside a request is cancelled when that request
    ends, and later replies never arrive.
    """
    if get_settings().transport == "agntcy":
        await _prepare(get_runtime())
    yield
    runtime = getattr(app.state, "runtime", None)
    transport = getattr(runtime, "transport", None)
    if isinstance(transport, AgntcyTransport):
        await transport.close()


app = FastAPI(title="TeaLink", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RecommendRequest(BaseModel):
    user_id: str
    query: str = "What should I get next?"
    preference_overrides: dict[str, float] = Field(default_factory=dict)


class SoldOutEvent(BaseModel):
    drink_id: str


class ShopEvent(BaseModel):
    shop_id: str


class PreferenceEvent(BaseModel):
    user_id: str
    preference_overrides: dict[str, float] = Field(default_factory=dict)


class ChoiceRequest(BaseModel):
    user_id: str
    drink_id: str


@dataclass
class Runtime:
    catalog: Catalog
    registry: Registry
    transport: LocalTransport | AgntcyTransport
    social: SocialStore = field(default_factory=lambda: SocialStore([], [], []))
    sold_out: set[str] = field(default_factory=set)
    preferences: dict[str, dict[str, float]] = field(default_factory=dict)
    offline: set[str] = field(default_factory=set)
    last_decision: dict[str, Decision] = field(default_factory=dict)


def get_runtime() -> Runtime:
    runtime = getattr(app.state, "runtime", None)
    if runtime is None:
        runtime = _build_runtime()
        app.state.runtime = runtime
    return runtime


def _build_runtime() -> Runtime:
    catalog = load_catalog()
    agents = default_agents(catalog)
    registry = Registry()
    by_id = {}
    for agent in agents:
        card = agent.card()
        registry.register(card)
        by_id[card.id] = agent
    settings = get_settings()
    local = LocalTransport(by_id, catalog)
    if settings.transport == "agntcy":
        transport: LocalTransport | AgntcyTransport = AgntcyTransport(settings.nats_url, fallback=local)
    else:
        transport = local
    return Runtime(catalog=catalog, registry=registry, transport=transport, social=load_social())


def _refresh_heartbeats(runtime: Runtime) -> None:
    """In-process agents are alive unless a demo event took them offline."""
    if not isinstance(runtime.transport, LocalTransport):
        return
    for agent_id in runtime.transport.agents:
        if agent_id not in runtime.offline:
            runtime.registry.heartbeat(agent_id)


def _require_user(runtime: Runtime, user_id: str) -> None:
    if user_id not in runtime.catalog.users_by_id:
        raise HTTPException(status_code=404, detail="user not found")


@app.get("/drinks")
def drinks() -> list[dict]:
    """The menu Discover searches. photo_url stays null until real photos exist."""
    runtime = get_runtime()
    return [
        {
            "id": drink.id,
            "name": drink.name,
            "shop_id": drink.shop_id,
            "price": drink.price,
            "flavor_tags": drink.flavor_tags,
            "photo_url": None,
        }
        for drink in runtime.catalog.drinks
    ]


@app.get("/shops")
def shops() -> list[dict]:
    """Shops for Discover. Includes shops that have not joined yet. photo_url stays null."""
    runtime = get_runtime()
    return [
        {
            "id": shop.id,
            "name": shop.name,
            "neighborhood": shop.neighborhood,
            "photo_url": None,
        }
        for shop in runtime.catalog.shops
    ]


@app.get("/eval")
def eval_results() -> dict:
    """Precomputed popularity vs fixed weights vs learning. See eval/run_eval.py."""
    path = get_settings().data_dir / "eval_results.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="eval results not found")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="eval results must be a JSON object")
    return payload


@app.get("/health")
def health() -> dict:
    settings = get_settings()
    runtime = getattr(app.state, "runtime", None)
    transport = getattr(runtime, "transport", None)
    if isinstance(transport, AgntcyTransport) and transport.connected:
        effective = "agntcy"
        remote_replies = dict(transport.remote_replies)
    elif isinstance(transport, AgntcyTransport):
        effective = "pending"
        remote_replies = {}
    else:
        effective = "local"
        remote_replies = {}
    return {
        "status": "ok",
        "transport": settings.transport,
        "effective": effective,
        "remote_replies": remote_replies,
    }


@app.get("/profile/{user_id}")
def profile(user_id: str) -> dict:
    runtime = get_runtime()
    _require_user(runtime, user_id)
    return user_profile(runtime.catalog, user_id)


@app.get("/users/similar")
def similar_users(user_id: str) -> dict:
    runtime = get_runtime()
    _require_user(runtime, user_id)
    users = []
    for other_id, similarity in objectives.neighbors(runtime.catalog, user_id):
        user = runtime.catalog.users_by_id[other_id]
        users.append({"id": other_id, "name": user.name, "similarity": similarity})
    return {"users": users}


@app.post("/recommend")
async def recommend(body: RecommendRequest) -> EventSourceResponse:
    runtime = get_runtime()
    _require_user(runtime, body.user_id)
    await _prepare(runtime)
    overrides = dict(runtime.preferences.get(body.user_id, {}))
    overrides.update(body.preference_overrides)

    async def events():
        async for event in deliberate(
            registry=runtime.registry,
            transport=runtime.transport,
            user_id=body.user_id,
            query=body.query,
            preference_overrides=overrides,
            sold_out_drink_ids=sorted(runtime.sold_out),
            recorder=LensRecorder(),
            prior_weights=social.prior_weights(runtime, body.user_id),
            price_low=min(drink.price for drink in runtime.catalog.drinks),
            price_high=max(drink.price for drink in runtime.catalog.drinks),
        ):
            if event.type == LensEventType.decision:
                runtime.last_decision[body.user_id] = Decision.model_validate(event.payload)
            yield {"event": event.type.value, "data": event.model_dump_json()}

    return EventSourceResponse(events())


@app.get("/preferences/{user_id}")
async def preferences(user_id: str) -> dict:
    runtime = get_runtime()
    await _prepare(runtime)
    _require_user(runtime, user_id)
    card = runtime.registry.get("preference")
    if card is None:
        raise HTTPException(status_code=503, detail="preference agent is not registered")
    request = DeliberationRequest(
        round="propose", user_id=user_id, query="", prior_weights=social.prior_weights(runtime, user_id)
    )
    reply = await runtime.transport.send(card, request)
    if reply.preference is None:
        raise HTTPException(status_code=503, detail="preference agent did not answer")
    return reply.preference.model_dump(mode="json")


@app.post("/choices")
async def choose(body: ChoiceRequest) -> dict:
    """The user picked one of the top 3. The Preference agent learns from it."""
    runtime = get_runtime()
    await _prepare(runtime)
    _require_user(runtime, body.user_id)
    decision = runtime.last_decision.get(body.user_id)
    if decision is None or not any(option.drink_id == body.drink_id for option in decision.options):
        raise HTTPException(status_code=409, detail="pick one of the options from the latest recommendation")
    card = runtime.registry.get("preference")
    if card is None:
        raise HTTPException(status_code=503, detail="preference agent is not registered")
    choice = ChoiceRecord(user_id=body.user_id, chosen_drink_id=body.drink_id, options=decision.options)
    request = DeliberationRequest(
        round="learn",
        user_id=body.user_id,
        query="",
        choice=choice,
        prior_weights=social.prior_weights(runtime, body.user_id),
    )
    reply = await runtime.transport.send(card, request)
    if reply.preference is None:
        raise HTTPException(status_code=503, detail="preference agent did not answer")
    runtime.social.add(body.user_id, "pick", drink_id=body.drink_id)
    return reply.preference.model_dump(mode="json")


@app.post("/events/sold-out")
def sold_out(body: SoldOutEvent) -> dict:
    runtime = get_runtime()
    runtime.sold_out.add(body.drink_id)
    return {"ok": True, "sold_out": sorted(runtime.sold_out)}


@app.post("/events/shop-offline")
async def shop_offline(body: ShopEvent) -> dict:
    runtime = get_runtime()
    await _prepare(runtime)
    agent_id = f"shop_{body.shop_id}"
    if runtime.registry.get(agent_id) is None:
        raise HTTPException(status_code=404, detail="shop agent not registered")
    runtime.offline.add(agent_id)
    runtime.registry.mark_offline(agent_id)
    if isinstance(runtime.transport, AgntcyTransport):
        await runtime.transport.publish_control("offline", agent_id)
    return {"ok": True, "agent_id": agent_id, "online": False}


@app.post("/events/shop-join")
async def shop_join(body: ShopEvent) -> dict:
    runtime = get_runtime()
    await _prepare(runtime)
    agent_id = f"shop_{body.shop_id}"
    shop = runtime.catalog.shop(body.shop_id)
    if shop is None:
        raise HTTPException(status_code=404, detail="shop not found")
    runtime.offline.discard(agent_id)
    agent = ShopAgent(body.shop_id, shop.name)
    _local_agent_map(runtime)[agent_id] = agent
    if runtime.registry.get(agent_id) is None:
        runtime.registry.register(agent.card())
    else:
        runtime.registry.heartbeat(agent_id)
    if isinstance(runtime.transport, AgntcyTransport):
        await runtime.transport.publish_control("join", agent_id)
        heard = False
        for _ in range(20):
            if runtime.transport.recent(agent_id):
                heard = True
                break
            await asyncio.sleep(0.1)
        if heard:
            runtime.transport._local_only.discard(agent_id)
        else:
            runtime.transport._local_only.add(agent_id)
        runtime.registry.heartbeat(agent_id)
    return {"ok": True, "agent_id": agent_id, "online": runtime.registry.is_online(agent_id)}


@app.post("/events/preference")
def preference(body: PreferenceEvent) -> dict:
    runtime = get_runtime()
    stored = dict(runtime.preferences.get(body.user_id, {}))
    stored.update(body.preference_overrides)
    runtime.preferences[body.user_id] = stored
    return {"ok": True, "user_id": body.user_id, "overrides": stored}


@app.post("/events/reset")
async def reset() -> dict:
    """Back to the seeded state, so the demo can be replayed."""
    old = getattr(app.state, "runtime", None)
    fresh = _build_runtime()
    remote = getattr(old, "transport", None)
    if isinstance(remote, AgntcyTransport) and remote.connected and isinstance(fresh.transport, AgntcyTransport):
        remote.fallback = fresh.transport.fallback
        remote.reset_routes()
        fresh.transport = remote
        app.state.runtime = fresh
        await remote.publish_control("reset", "*")
        await asyncio.sleep(0.2)
        await remote.reconcile(fresh.registry, offline=fresh.offline)
        return {"ok": True}
    app.state.runtime = fresh
    return {"ok": True}


async def _prepare(runtime: Runtime) -> None:
    """Connect the bus once. If that fails, stay on the in-process agents."""
    transport = runtime.transport
    if isinstance(transport, LocalTransport):
        _refresh_heartbeats(runtime)
        return
    if not isinstance(transport, AgntcyTransport):
        return
    if not transport.connected:
        ok = await transport.connect()
        if not ok:
            print(transport.failure or "AGNTCY transport unavailable. Using in-process agents.", file=sys.stderr)
            runtime.transport = transport.fallback
            _refresh_heartbeats(runtime)
            return
        await transport.listen(_remote_heartbeat)
        await transport.reconcile(runtime.registry, offline=runtime.offline)
    for agent_id in transport.local_only:
        if agent_id not in runtime.offline and runtime.registry.get(agent_id) is not None:
            runtime.registry.heartbeat(agent_id)


def _remote_heartbeat(agent_id: str) -> None:
    """Apply a bus heartbeat to whichever runtime is serving requests.

    Reset swaps in a new runtime but keeps this transport and its NATS
    subscription. Closing over the runtime from connect time would refresh
    the discarded registry and let the new one time out.
    """
    _on_remote_heartbeat(get_runtime(), agent_id)


def _on_remote_heartbeat(runtime: Runtime, agent_id: str) -> None:
    transport = runtime.transport
    if not isinstance(transport, AgntcyTransport):
        return
    transport.note(agent_id)
    if agent_id in runtime.offline or runtime.registry.get(agent_id) is None:
        return
    runtime.registry.heartbeat(agent_id)


app.include_router(social.router)


def _local_agent_map(runtime: Runtime) -> dict:
    transport = runtime.transport
    if isinstance(transport, AgntcyTransport):
        return transport.fallback.agents
    if isinstance(transport, LocalTransport):
        return transport.agents
    return {}
