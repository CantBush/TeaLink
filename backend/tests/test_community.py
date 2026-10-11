"""Ordering teaches on placement, posts, past orders, and besteas."""

import base64
import json

from fastapi.testclient import TestClient

from tealink.api.main import app, get_runtime


def _client() -> TestClient:
    app.state.runtime = None
    client = TestClient(app)
    assert client.post("/events/reset").status_code == 200
    return client


def _login(client: TestClient, email: str, password: str = "boba") -> dict:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def _recommend(client: TestClient, user_id: str = "andrew") -> dict:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": user_id}) as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return next(event["payload"] for event in events if event["type"] == "decision")


def _jpeg(width: int, height: int) -> str:
    raw = bytes(
        [
            0xFF,
            0xD8,
            0xFF,
            0xC0,
            0x00,
            0x0B,
            0x08,
            (height >> 8) & 0xFF,
            height & 0xFF,
            (width >> 8) & 0xFF,
            width & 0xFF,
            0x01,
            0x01,
            0x11,
            0x00,
            0xFF,
            0xD9,
        ]
    )
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def test_ordering_pearl_learns_once_and_skips_the_feed():
    client = _client()
    _login(client, "andrew@tealink.demo")
    before = [item["id"] for item in client.get("/feed", params={"user_id": "andrew"}).json()]
    opening = _recommend(client)
    assert [round(item["score"] * 100) for item in opening["options"]] == [78, 77, 71]
    pearl = opening["options"][2]
    receipt = client.post(
        "/orders",
        json={"shop_id": pearl["shop_id"], "items": [{"drink_id": pearl["drink_id"]}], "pay": "pickup"},
    ).json()
    learned = receipt["learned"]
    assert round(learned["weights"]["taste"] * 100) == 45
    assert round(learned["weights"]["cost"] * 100) == 36
    after = _recommend(client)
    again = next(item for item in after["options"] if item["drink_id"] == pearl["drink_id"])
    assert round(again["score"] * 100) == 73
    feed = client.get("/feed", params={"user_id": "andrew"}).json()
    assert [item["id"] for item in feed] == before
    assert all(item["kind"] != "pick" for item in feed)

    weights = client.get("/preferences/andrew").json()["weights"]
    client.post("/auth/logout")
    shop = client.post(
        "/auth/signup",
        json={"email": "pearl-shop@tealink.demo", "password": "boba12", "role": "store", "shop_id": pearl["shop_id"]},
    )
    if shop.status_code == 409:
        shop = client.post("/auth/login", json={"email": "pearl-shop@tealink.demo", "password": "boba12"})
    assert shop.status_code == 200
    for status in ("accepted", "ready", "picked_up"):
        assert client.patch(f"/orders/{receipt['order_id']}", json={"status": status}).status_code == 200
    client.post("/auth/logout")
    _login(client, "andrew@tealink.demo")
    assert client.get("/preferences/andrew").json()["weights"] == weights


def test_order_outside_the_top_3_nudges_taste_only():
    client = _client()
    _login(client, "andrew@tealink.demo")
    opening = _recommend(client)
    offered = {item["drink_id"] for item in opening["options"]}
    runtime = get_runtime()
    tried = {review.drink_id for review in runtime.catalog.reviews_for("andrew")}
    tried.update(runtime.social.picks("andrew"))
    drink = next(item for item in runtime.catalog.drinks if item.id not in offered and item.id not in tried)
    before = client.get("/preferences/andrew").json()["weights"]
    tried_before = client.get("/users/andrew", params={"viewer": "andrew"}).json()["stats"]["tried_count"]
    receipt = client.post(
        "/orders",
        json={"shop_id": drink.shop_id, "items": [{"drink_id": drink.id}], "pay": "pickup"},
    ).json()
    assert "learned" not in receipt
    assert client.get("/preferences/andrew").json()["weights"] == before
    stats = client.get("/users/andrew", params={"viewer": "andrew"}).json()["stats"]
    assert stats["tried_count"] == tried_before + 1
    assert client.patch(f"/orders/{receipt['order_id']}", json={"status": "cancelled"}).status_code == 200
    assert client.get("/preferences/andrew").json()["weights"] == before
    assert client.get("/users/andrew", params={"viewer": "andrew"}).json()["stats"]["tried_count"] == tried_before + 1


def test_posts_show_for_a_follower_and_reset_clears_them():
    andrew = _client()
    _login(andrew, "andrew@tealink.demo")
    caption = andrew.post("/posts", json={"text": "Saving this for Friday."}).json()
    assert caption["kind"] == "post" and caption["photo_url"] is None
    photo = andrew.post(
        "/posts",
        json={"text": "First sip.", "photo_url": _jpeg(32, 32), "drink_id": "sr_hojicha_cream", "shop_id": "sunright"},
    ).json()
    assert photo["photo_url"] and photo["drink_id"] == "sr_hojicha_cream" and photo["shop_id"] == "sunright"
    assert andrew.post("/posts", json={"text": ""}).status_code == 422
    assert andrew.post("/posts", json={"text": "too big", "photo_url": _jpeg(1081, 10)}).status_code == 422

    ids = {item["id"] for item in andrew.get("/feed", params={"user_id": "sarah"}).json()}
    assert caption["id"] in ids and photo["id"] in ids
    liked = andrew.post(f"/feed/{caption['id']}/like", json={"viewer": "sarah"}).json()
    assert liked["likes"] == 1
    assert andrew.delete(f"/posts/{caption['id']}").status_code == 204
    assert caption["id"] not in {item["id"] for item in andrew.get("/feed", params={"user_id": "sarah"}).json()}

    andrew.post("/events/reset")
    assert photo["id"] not in {item["id"] for item in andrew.get("/feed", params={"user_id": "sarah"}).json()}
    assert andrew.get("/auth/me").json()["user_id"] == "andrew"


def test_past_orders_follow_visible_stats():
    client = _client()
    _login(client, "andrew@tealink.demo")
    mine = client.get("/users/andrew", params={"viewer": "andrew"}).json()
    assert mine["stats"]["past_orders"]
    assert all("price" not in row and set(row) == {"drink_id", "shop_id", "ordered_at"} for row in mine["stats"]["past_orders"])
    private = [key for key in mine["visible_stats"] if key != "past_orders"]
    client.patch("/users/andrew", json={"visible_stats": private})
    assert "past_orders" not in client.get("/users/andrew", params={"viewer": "sarah"}).json()["stats"]

    client.patch("/users/andrew", json={"visible_stats": [*private, "past_orders"]})
    seen = client.get("/users/andrew", params={"viewer": "sarah"}).json()
    assert seen["stats"]["past_orders"] == mine["stats"]["past_orders"]
    assert "price" not in str(seen["stats"]["past_orders"])


def test_besteas_notify_on_an_order_and_reset_clears_them():
    andrew = _client()
    sarah = TestClient(app)
    _login(andrew, "andrew@tealink.demo")
    signed = sarah.post(
        "/auth/signup",
        json={"email": "sarah-bestea@tealink.demo", "password": "boba12", "role": "customer", "user_id": "sarah"},
    )
    if signed.status_code == 409:
        signed = sarah.post("/auth/login", json={"email": "sarah-bestea@tealink.demo", "password": "boba12"})
    assert signed.status_code == 200

    assert andrew.post("/bestea/sarah/request").json()["bestea"] == "requested"
    incoming = sarah.get("/users/andrew", params={"viewer": "sarah"}).json()
    assert incoming["bestea"] == "incoming" and incoming["besteas"] == 0
    note = sarah.get("/notifications").json()
    assert note["unread"] == 1 and note["items"][0]["kind"] == "bestea_request"
    assert note["items"][0]["from"]["handle"] == "andrew"

    assert sarah.post("/bestea/andrew/accept").json()["bestea"] == "bestea"
    assert andrew.get("/users/sarah", params={"viewer": "andrew"}).json()["besteas"] == 1
    andrew.post("/notifications/read", json={})
    sarah.post("/notifications/read", json={})

    order = sarah.post(
        "/orders",
        json={"shop_id": "sunright", "items": [{"drink_id": "sr_hojicha_cream"}], "pay": "pickup"},
    ).json()
    assert order["status"] == "placed"
    notes = andrew.get("/notifications").json()
    assert notes["unread"] == 1
    assert notes["items"][0]["kind"] == "bestea_order"
    assert notes["items"][0]["drink_id"] == "sr_hojicha_cream"
    assert notes["items"][0]["shop_id"] == "sunright"
    assert notes["items"][0]["from"]["display_name"] == "Sarah"

    andrew.post("/events/reset")
    assert andrew.get("/notifications").json() == {"items": [], "unread": 0}
    assert andrew.get("/users/sarah", params={"viewer": "andrew"}).json()["bestea"] == "none"
    assert andrew.get("/auth/me").json()["user_id"] == "andrew"
