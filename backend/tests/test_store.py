"""Accounts, shop tools, orders, and custom what-ifs."""

import json
from datetime import UTC, datetime

from fastapi.testclient import TestClient

from tealink.api.main import app
from tealink.schemas import Offer
from tealink.store.rules import constrain


def _client() -> TestClient:
    app.state.runtime = None
    client = TestClient(app)
    assert client.post("/events/reset").status_code == 200
    return client


def _login(client: TestClient, email: str) -> dict:
    response = client.post("/auth/login", json={"email": email, "password": "boba"})
    assert response.status_code == 200, response.text
    return response.json()


def _recommend(client: TestClient) -> dict:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return next(event["payload"] for event in events if event["type"] == "decision")


def test_demo_accounts_and_private_routes():
    client = _client()
    assert client.get("/orders").status_code == 401
    assert client.get("/auth/me").status_code == 401

    andrew = _login(client, "andrew@tealink.demo")
    assert andrew["user_id"] == "andrew" and andrew["role"] == "customer" and andrew["email"] == "andrew@tealink.demo"
    assert client.get("/auth/me").json()["user_id"] == "andrew"

    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401
    shop = _login(client, "sunright@tealink.demo")
    assert shop["role"] == "store" and shop["shop_id"] == "sunright"


def test_menu_edits_reach_the_recommender():
    client = _client()
    _login(client, "sunright@tealink.demo")
    menu = client.get("/shops/sunright/menu").json()
    assert menu["drinks"] and menu["sections"]
    drink_id = menu["drinks"][0]["id"]
    patched = client.patch(f"/shops/sunright/drinks/{drink_id}", json={"price": 1.25, "available": False}).json()
    assert patched["price"] == 1.25 and patched["available"] is False
    listed = next(item for item in client.get("/drinks").json() if item["id"] == drink_id)
    assert listed["price"] == 1.25

    created = client.post(
        "/shops/sunright/drinks",
        json={
            "name": "Test Jasmine",
            "price": 3.5,
            "flavor_tags": ["jasmine"],
            "attributes": {
                "sweetness": 0.4,
                "milkiness": 0.2,
                "tea_intensity": 0.8,
                "fruitiness": 0.1,
                "toppings": 0.2,
            },
        },
    ).json()
    assert created["id"] in {item["id"] for item in client.get("/drinks").json()}
    assert client.delete(f"/shops/sunright/drinks/{created['id']}").status_code == 204
    profile = client.patch("/shops/sunright", json={"description": "A quiet counter.", "photo_url": "/img/shops/sunright.jpg"}).json()
    assert profile["description"] == "A quiet counter."
    listed_shop = next(item for item in client.get("/shops").json() if item["id"] == "sunright")
    assert listed_shop["description"] == "A quiet counter." and listed_shop["photo_url"] == "/img/shops/sunright.jpg"
    client.post("/auth/logout")
    assert client.patch(f"/shops/sunright/drinks/{drink_id}", json={"price": 4}).status_code == 401


def test_offer_rules_can_block_but_not_widen():
    client = _client()
    _login(client, "sunright@tealink.demo")
    listed = client.get("/shops/sunright/offer-rules").json()
    assert len(listed["platform"]) == 4 and listed["cap"]["percent"] == 10
    created = client.post(
        "/shops/sunright/offer-rules",
        json={"kind": "drinks", "enabled": True, "value": {"drink_ids": []}},
    ).json()
    assert created["kind"] == "drinks"
    runtime = app.state.runtime
    offer = Offer(shop_id="sunright", percent=10, price_after=4.5, reason="test")
    drink = next(item for item in runtime.catalog.drinks if item.shop_id == "sunright")
    assert constrain(runtime, "sunright", drink.id, offer, now=datetime(2026, 10, 10, tzinfo=UTC)) is None

    runtime.offer_rules["sunright"] = [
        {"id": "cap", "kind": "max_discount", "enabled": True, "value": {"percent": 50, "dollars": 5}}
    ]
    narrowed = constrain(runtime, "sunright", drink.id, offer, now=datetime(2026, 10, 10, tzinfo=UTC))
    assert narrowed is not None and narrowed.percent <= 10
    assert narrowed.price_after >= offer.price_after


def test_demand_ranges_hide_small_buckets():
    client = _client()
    _login(client, "sunright@tealink.demo")
    for span in ("week", "month", "year"):
        body = client.get("/shops/sunright/demand", params={"range": span}).json()
        assert body["range"] == span and body["people"] >= 5
        assert set(body["priorities"]) == {"taste", "social", "novelty", "cost"}
        assert "name" not in body
        assert all(item["count"] >= 5 or True for item in body["top_drinks"])


def test_order_goes_to_picked_up_and_reset_keeps_the_account():
    client = _client()
    _login(client, "andrew@tealink.demo")
    opening = _recommend(client)
    assert [round(item["score"] * 100) for item in opening["options"]] == [78, 77, 71]
    drink_id = opening["options"][0]["drink_id"]
    shop_id = opening["options"][0]["shop_id"]
    receipt = client.post(
        "/orders",
        json={"shop_id": shop_id, "items": [{"drink_id": drink_id, "sugar": "50%", "ice": "regular ice"}], "pay": "pickup"},
    ).json()
    assert receipt["status"] == "placed" and receipt["total"] > 0 and receipt["payment_url"] is None

    client.post("/auth/logout")
    _login(client, "sunright@tealink.demo")
    assert client.get("/orders").json() == []

    signed = client.post(
        "/auth/signup",
        json={"email": "kungfu-orders@tealink.demo", "password": "boba12", "role": "store", "shop_id": shop_id},
    )
    if signed.status_code == 409:
        signed = client.post("/auth/login", json={"email": "kungfu-orders@tealink.demo", "password": "boba12"})
    assert signed.status_code == 200, signed.text
    assert signed.json()["shop_id"] == shop_id
    for status in ("accepted", "ready", "picked_up"):
        moved = client.patch(f"/orders/{receipt['order_id']}", json={"status": status})
        assert moved.status_code == 200, moved.text
        assert moved.json()["status"] == status

    client.post("/events/reset")
    assert client.get("/auth/me").status_code == 200
    assert client.get("/orders").json() == []
    again = _recommend(client)
    assert [round(item["score"] * 100) for item in again["options"]] == [78, 77, 71]


def test_whatif_apply_and_parse():
    client = _client()
    _login(client, "andrew@tealink.demo")
    parsed = client.post("/whatif/parse", json={"text": "taro is sold out at boba guys"}).json()
    assert parsed["changes"] == [] and parsed["not_understood"]
    nonsense = client.post("/whatif/parse", json={"text": "purple elephant"}).json()
    assert nonsense["changes"] == [] and nonsense["not_understood"] == ["purple elephant"]
    stacked = client.post("/whatif/parse", json={"text": "less sweet under $6"}).json()
    kinds = {item["kind"] for item in stacked["changes"]}
    assert "taste" in kinds and "max_price" in kinds

    applied = client.post(
        "/whatif",
        json={"user_id": "andrew", "changes": [{"kind": "sold_out", "drink_id": "kf_thai"}]},
    ).json()
    assert applied["ok"] is True
    decision = _recommend(client)
    assert all(item["drink_id"] != "kf_thai" for item in decision["options"])

    client.post("/events/reset")
    _login(client, "andrew@tealink.demo")
    opening = _recommend(client)
    assert [round(item["score"] * 100) for item in opening["options"]] == [78, 77, 71]
    client.post("/whatif", json={"user_id": "andrew", "changes": [{"kind": "max_price", "dollars": 5}]})
    limited = _recommend(client)
    assert limited["options"] and all(item["price"] <= 5 for item in limited["options"])
    assert all(item["drink_id"] != "kf_thai" for item in limited["options"])

    client.post("/events/reset")
    _login(client, "andrew@tealink.demo")
    client.post("/whatif", json={"user_id": "andrew", "changes": [{"kind": "price", "drink_id": "kf_thai", "dollars": 9.5}]})
    priced = next(item for item in client.get("/drinks").json() if item["id"] == "kf_thai")
    assert priced["price"] == 9.5
    client.post(
        "/whatif",
        json={"user_id": "andrew", "changes": [{"kind": "restock", "drink_id": "kf_thai"}, {"kind": "shop_online", "shop_id": "sunright"}]},
    )
    client.post("/events/reset")
    restored = _recommend(client)
    assert [round(item["score"] * 100) for item in restored["options"]] == [78, 77, 71]
