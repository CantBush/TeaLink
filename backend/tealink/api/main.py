"""TeaLink gateway. SSE deliberation uses LocalTransport unless TRANSPORT says otherwise."""

from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from tealink.agents.roster import default_agents
from tealink.agents.shop_agent import ShopAgent
from tealink.concierge.deliberation import deliberate
from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgntcyTransport, LocalTransport
from tealink.config import get_settings
from tealink.core import objectives
from tealink.core.taste import taste_profile
from tealink.data.loader import Catalog, load_catalog
from tealink.lens.recorder import LensRecorder
from tealink.schemas import ChoiceRecord, Decision, DeliberationRequest, LensEventType

app = FastAPI(title="TeaLink")
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
    if settings.transport == "local":
        transport: LocalTransport | AgntcyTransport = LocalTransport(by_id, catalog)
    else:
        transport = AgntcyTransport()
    return Runtime(catalog=catalog, registry=registry, transport=transport)


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


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "transport": get_settings().transport}


@app.get("/profile/{user_id}")
def profile(user_id: str) -> dict:
    runtime = get_runtime()
    _require_user(runtime, user_id)
    return taste_profile(runtime.catalog.reviews_for(user_id), runtime.catalog.drinks_by_id)


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
    _refresh_heartbeats(runtime)
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
        ):
            if event.type == LensEventType.decision:
                runtime.last_decision[body.user_id] = Decision.model_validate(event.payload)
            yield {"event": event.type.value, "data": event.model_dump_json()}

    return EventSourceResponse(events())


@app.get("/preferences/{user_id}")
async def preferences(user_id: str) -> dict:
    runtime = get_runtime()
    _require_user(runtime, user_id)
    card = runtime.registry.get("preference")
    if card is None:
        raise HTTPException(status_code=503, detail="preference agent is not registered")
    request = DeliberationRequest(round="propose", user_id=user_id, query="")
    reply = await runtime.transport.send(card, request)
    if reply.preference is None:
        raise HTTPException(status_code=503, detail="preference agent did not answer")
    return reply.preference.model_dump(mode="json")


@app.post("/choices")
async def choose(body: ChoiceRequest) -> dict:
    """The user picked one of the top 3. The Preference agent learns from it."""
    runtime = get_runtime()
    _require_user(runtime, body.user_id)
    decision = runtime.last_decision.get(body.user_id)
    if decision is None or not any(option.drink_id == body.drink_id for option in decision.options):
        raise HTTPException(status_code=409, detail="pick one of the options from the latest recommendation")
    card = runtime.registry.get("preference")
    if card is None:
        raise HTTPException(status_code=503, detail="preference agent is not registered")
    choice = ChoiceRecord(user_id=body.user_id, chosen_drink_id=body.drink_id, options=decision.options)
    request = DeliberationRequest(round="learn", user_id=body.user_id, query="", choice=choice)
    reply = await runtime.transport.send(card, request)
    if reply.preference is None:
        raise HTTPException(status_code=503, detail="preference agent did not answer")
    return reply.preference.model_dump(mode="json")


@app.post("/events/sold-out")
def sold_out(body: SoldOutEvent) -> dict:
    runtime = get_runtime()
    runtime.sold_out.add(body.drink_id)
    return {"ok": True, "sold_out": sorted(runtime.sold_out)}


@app.post("/events/shop-offline")
def shop_offline(body: ShopEvent) -> dict:
    runtime = get_runtime()
    agent_id = f"shop_{body.shop_id}"
    if runtime.registry.get(agent_id) is None:
        raise HTTPException(status_code=404, detail="shop agent not registered")
    runtime.offline.add(agent_id)
    runtime.registry.mark_offline(agent_id)
    return {"ok": True, "agent_id": agent_id, "online": False}


@app.post("/events/shop-join")
def shop_join(body: ShopEvent) -> dict:
    runtime = get_runtime()
    agent_id = f"shop_{body.shop_id}"
    runtime.offline.discard(agent_id)
    if isinstance(runtime.transport, LocalTransport) and agent_id not in runtime.transport.agents:
        shop = runtime.catalog.shop(body.shop_id)
        if shop is None:
            raise HTTPException(status_code=404, detail="shop not found")
        agent = ShopAgent(body.shop_id, shop.name)
        runtime.transport.agents[agent_id] = agent
        runtime.registry.register(agent.card())
    elif runtime.registry.get(agent_id) is None:
        runtime.registry.register(ShopAgent(body.shop_id, body.shop_id).card())
    else:
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
def reset() -> dict:
    """Back to the seeded state, so the demo can be replayed."""
    app.state.runtime = _build_runtime()
    return {"ok": True}
