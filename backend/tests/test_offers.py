"""Close-call discounts, and the menu endpoints Discover will search."""

import asyncio
import json

from fastapi.testclient import TestClient

from tealink.agents.cards import AgentCardInfo
from tealink.agents.shop_agent import ShopAgent
from tealink.api.main import app
from tealink.concierge.deliberation import _ask_for_offer
from tealink.concierge.registry import Registry
from tealink.core.offers import apply_offer
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import AgentReply, Decision, DeliberationRequest, Offer, RankedDrink


def _drink(drink_id: str, shop_id: str, score: float, cost: float, price: float) -> RankedDrink:
    return RankedDrink(
        drink_id=drink_id,
        drink_name=drink_id,
        score=score,
        shop_id=shop_id,
        price=price,
        dimension_scores={"taste": 0.5, "social": 0.5, "novelty": 0.5, "cost": cost},
    )


def test_shop_offers_ten_percent_and_never_past_its_budget():
    write_dataset()
    catalog = load_catalog()
    drink = catalog.drink("sr_wintermelon")
    assert drink is not None
    full = ShopAgent("sunright", "Sunright Tea Studio", promo_budget=1.0)
    offer = full.handle(
        DeliberationRequest(round="offer", user_id="andrew", query="", candidate_drink_ids=[drink.id]),
        catalog,
    ).offer
    assert offer is not None
    assert offer.percent == 10
    assert offer.price_after == round(drink.price * 0.9, 2)
    assert offer.shop_id == "sunright"

    tight = ShopAgent("sunright", "Sunright Tea Studio", promo_budget=0.20)
    small = tight.handle(
        DeliberationRequest(round="offer", user_id="andrew", query="", candidate_drink_ids=[drink.id]),
        catalog,
    ).offer
    assert small is not None and small.percent < 10
    assert drink.price - small.price_after <= 0.20 + 0.001

    broke = ShopAgent("sunright", "Sunright Tea Studio", promo_budget=0.0)
    assert (
        broke.handle(
            DeliberationRequest(round="offer", user_id="andrew", query="", candidate_drink_ids=[drink.id]),
            catalog,
        ).offer
        is None
    )


def test_a_discount_can_flip_first_place():
    leader = _drink("leader", "kungfu", 0.80, 0.40, 6.50)
    trailer = _drink("trailer", "sunright", 0.79, 0.70, 5.00)
    decision = Decision(
        drink_id="leader",
        drink_name="leader",
        shop_id="kungfu",
        score=0.80,
        ask_human=True,
        question="close",
        alternatives=[trailer],
        explanation="",
        options=[leader, trailer],
        weights={"taste": 0.05, "social": 0.05, "novelty": 0.05, "cost": 0.85},
    )
    offer = Offer(shop_id="sunright", percent=10, price_after=4.50, reason="Sunright takes 10% off trailer.")
    updated = apply_offer(decision, "trailer", offer, low=4.50, high=7.00)
    assert updated.drink_id == "trailer"
    assert updated.options[0].offer is not None
    assert updated.options[0].dimension_scores["cost"] > trailer.dimension_scores["cost"]
    assert "moves it to #1" in updated.explanation


def test_menu_endpoints_and_reserved_photo_fields():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")

    drinks = client.get("/drinks").json()
    assert len(drinks) == 43
    assert len({item["id"] for item in drinks}) == 43
    assert all(item["photo_url"] is None and item["flavor_tags"] for item in drinks)
    assert {item["shop_id"] for item in drinks} >= {"kungfu", "lantern_leaf"}

    shops = client.get("/shops").json()
    assert len(shops) == 6
    assert all(item["photo_url"] is None for item in shops)
    lantern = next(item for item in shops if item["id"] == "lantern_leaf")
    assert lantern["name"] == "Lantern Leaf" and lantern["neighborhood"]

    profile = client.get("/users/sarah", params={"viewer": "andrew"}).json()
    assert profile["cover_url"] is None
    feed = client.get("/feed", params={"user_id": "andrew"}).json()
    assert feed and all(item["photo_url"] is None for item in feed[:5])


def test_the_scripted_opening_stays_a_close_call():
    """Wintermelon is already cheaper, so Sunright does not buy the #1 spot."""
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")
    events = []
    with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    decision = next(event["payload"] for event in events if event["type"] == "decision")
    assert decision["drink_id"] == "kf_thai"
    assert decision["ask_human"] is True
    assert [round(item["score"] * 100) for item in decision["options"]] == [78, 77, 71]
    assert not any(event["type"] == "offer" for event in events)


def test_only_a_pricier_runner_up_is_asked_to_discount():
    async def run():
        registry = Registry()
        registry.register(AgentCardInfo(id="shop_sunright", name="Sunright", description="", capabilities=["menu"]))
        sent: list[str] = []

        class Transport:
            async def send(self, card, msg):
                sent.append(card.id)
                return AgentReply(
                    agent_id=card.id,
                    offer=Offer(shop_id="sunright", percent=10, price_after=4.50, reason="deal"),
                )

        pricey = Decision(
            drink_id="cheap",
            drink_name="cheap",
            shop_id="kungfu",
            score=0.80,
            ask_human=True,
            question="close",
            alternatives=[],
            explanation="",
            options=[_drink("cheap", "kungfu", 0.80, 0.90, 4.75), _drink("pricey", "sunright", 0.79, 0.40, 6.50)],
        )
        assert await _ask_for_offer(pricey, registry, Transport(), "andrew", "") is not None
        assert sent == ["shop_sunright"]

        already_cheap = pricey.model_copy(
            update={"options": [_drink("a", "kungfu", 0.80, 0.40, 6.50), _drink("b", "sunright", 0.79, 0.90, 4.75)]}
        )
        assert await _ask_for_offer(already_cheap, registry, Transport(), "andrew", "") is None

    asyncio.run(run())
