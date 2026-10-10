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
from tealink.core.taste import taste_profile
from tealink.data.loader import Catalog, load_catalog
from tealink.lens.recorder import LensRecorder

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


class ShopJoinEvent(BaseModel):
    shop_id: str


class PreferenceEvent(BaseModel):
    user_id: str
    overrides: dict[str, float] = Field(default_factory=dict)


@dataclass
class Runtime:
    catalog: Catalog
    registry: Registry
    transport: LocalTransport | AgntcyTransport
    sold_out: set[str] = field(default_factory=set)
    preferences: dict[str, dict[str, float]] = field(default_factory=dict)


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


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "transport": get_settings().transport}


@app.get("/profile/{user_id}")
def profile(user_id: str) -> dict:
    catalog = get_runtime().catalog
    if user_id not in catalog.users_by_id:
        raise HTTPException(status_code=404, detail="user not found")
    return taste_profile(catalog.reviews_for(user_id), catalog.drinks_by_id)


@app.get("/users/similar")
def similar_users(user_id: str) -> dict:
    catalog = get_runtime().catalog
    if user_id not in catalog.users_by_id:
        raise HTTPException(status_code=404, detail="user not found")
    if user_id == "andrew":
        return {"users": [{"id": "sarah", "name": "Sarah"}]}
    return {"users": []}


@app.post("/recommend")
async def recommend(body: RecommendRequest) -> EventSourceResponse:
    runtime = get_runtime()
    if body.user_id not in runtime.catalog.users_by_id:
        raise HTTPException(status_code=404, detail="user not found")
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
            yield {"event": event.type.value, "data": event.model_dump_json()}

    return EventSourceResponse(events())


@app.post("/events/sold-out")
def sold_out(body: SoldOutEvent) -> dict:
    runtime = get_runtime()
    runtime.sold_out.add(body.drink_id)
    return {"ok": True, "sold_out": sorted(runtime.sold_out)}


@app.post("/events/shop-join")
def shop_join(body: ShopJoinEvent) -> dict:
    runtime = get_runtime()
    agent_id = f"shop_{body.shop_id}"
    if isinstance(runtime.transport, LocalTransport) and agent_id not in runtime.transport.agents:
        shop = runtime.catalog.shop(body.shop_id)
        name = shop.name if shop else body.shop_id
        agent = ShopAgent(body.shop_id, name)
        runtime.transport.agents[agent_id] = agent
        runtime.registry.register(agent.card())
    else:
        card = runtime.registry.get(agent_id)
        if card is None:
            runtime.registry.register(
                ShopAgent(body.shop_id, body.shop_id).card()
            )
        else:
            runtime.registry.heartbeat(agent_id)
    return {"ok": True, "agent_id": agent_id, "online": runtime.registry.is_online(agent_id)}


@app.post("/events/preference")
def preference(body: PreferenceEvent) -> dict:
    runtime = get_runtime()
    stored = dict(runtime.preferences.get(body.user_id, {}))
    stored.update(body.overrides)
    runtime.preferences[body.user_id] = stored
    return {"ok": True, "user_id": body.user_id, "overrides": stored}
