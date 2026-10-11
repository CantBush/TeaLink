"""Full quiz, favorites, order recency, ratings, and shop popularity."""

import json

from fastapi.testclient import TestClient

from tealink.api.main import app, get_runtime
from tealink.core import quiz
from tealink.core.taste import mean_absolute_difference, taste_profile
from tealink.data.loader import load_catalog
from tealink.schemas import ATTRIBUTES, Review

FULL = {
    "sweetness": "50",
    "base": "milk",
    "toppings": "some",
    "flavors": ["hojicha"],
    "budget": "mid",
    "adventure": "same",
    "ice": "regular",
    "temperature": "either",
    "tea_base": "oolong",
    "milk_type": "dairy",
    "specific_toppings": ["pearls"],
    "texture": "smooth",
    "avoid": ["fruit"],
}


def _client() -> TestClient:
    app.state.runtime = None
    client = TestClient(app)
    assert client.post("/events/reset").status_code == 200
    return client


def _login(client: TestClient, email: str, password: str = "boba") -> None:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


def _recommend(client: TestClient, user_id: str = "andrew") -> dict:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": user_id}) as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return next(event["payload"] for event in events if event["type"] == "decision")


def _signup_customer(client: TestClient, handle: str) -> None:
    created = client.post("/users", json={"handle": handle, "display_name": handle.title()})
    assert created.status_code in (200, 409), created.text
    signed = client.post(
        "/auth/signup",
        json={"email": f"{handle}@tealink.demo", "password": "boba12", "role": "customer", "user_id": handle},
    )
    if signed.status_code == 409:
        signed = client.post("/auth/login", json={"email": f"{handle}@tealink.demo", "password": "boba12"})
    assert signed.status_code == 200, signed.text


def test_full_quiz_is_more_detailed_than_basic_for_the_same_answers():
    basic_answers = {key: FULL[key] for key in ("sweetness", "base", "toppings", "flavors", "budget", "adventure")}
    basic = quiz.score(basic_answers)
    detailed = quiz.score(FULL, kind="full")
    assert detailed.profile != basic.profile
    assert detailed.profile["milkiness"] > basic.profile["milkiness"]
    assert "fruit" in detailed.avoids
    assert detailed.kind == "full" and basic.kind == "basic"
    assert abs(sum(detailed.weights.values()) - 1) < 1e-9


def test_quiz_routes_record_kind_and_favorites_land_in_the_top_3():
    client = _client()
    assert len(client.get("/quiz").json()) == 6
    assert client.get("/quiz", params={"kind": "nope"}).status_code == 422
    full = client.get("/quiz", params={"kind": "full"}).json()
    assert full[-1]["kind"] == "favorites" and full[-1]["options"] == []
    assert {question["id"] for question in full} >= {"ice", "temperature", "tea_base", "avoid", "favorites"}

    _signup_customer(client, "fan")
    taken = client.post("/quiz", json={"user_id": "fan", "kind": "full", "answers": FULL, "favorites": [
        {"shop_id": "sunright", "drink_ids": ["sr_hojicha_cream"]},
    ]})
    assert taken.status_code == 200, taken.text
    profile = client.get("/users/fan", params={"viewer": "fan"}).json()
    assert profile["quiz_kind"] == "full"
    assert client.get("/users/fan").json()["quiz_kind"] == "full"

    rejected = client.post(
        "/quiz",
        json={
            "user_id": "fan",
            "kind": "full",
            "answers": FULL,
            "favorites": [{"shop_id": "kungfu", "drink_ids": ["sr_hojicha_cream"]}],
        },
    )
    assert rejected.status_code == 422

    decision = _recommend(client, "fan")
    catalog = get_runtime().catalog
    target = catalog.drink("sr_hojicha_cream")
    assert target is not None

    def like_favorite(drink_id: str) -> bool:
        drink = catalog.drink(drink_id)
        if drink is None:
            return False
        if drink.id == target.id or "hojicha" in drink.flavor_tags:
            return True
        return mean_absolute_difference(drink.attributes, target.attributes) <= 0.25

    assert any(like_favorite(item["drink_id"]) for item in decision["options"])


def test_newer_order_pulls_the_profile_harder_than_the_older_one():
    drinks = {
        "milky": _drink("milky", sweetness=0.2, milkiness=1, tea_intensity=0.4, fruitiness=0, toppings=0.2),
        "fruity": _drink("fruity", sweetness=0.6, milkiness=0, tea_intensity=0.3, fruitiness=1, toppings=0.1),
    }
    older = Review(id="order_old", user_id="u", drink_id="fruity", rating=4, text="Ordered this.")
    newer = Review(id="order_new", user_id="u", drink_id="milky", rating=4, text="Ordered this.")
    profile = taste_profile([older, newer], drinks)
    swapped = taste_profile([newer, older], drinks)
    assert profile["milkiness"] > swapped["milkiness"]
    assert profile["fruitiness"] < swapped["fruitiness"]

    client = _client()
    _signup_customer(client, "recent")
    client.post("/orders", json={"shop_id": "kungfu", "items": [{"drink_id": "kf_mango_green"}], "pay": "pickup"})
    client.post("/orders", json={"shop_id": "sunright", "items": [{"drink_id": "sr_hojicha_cream"}], "pay": "pickup"})
    lived = client.get("/profile/recent").json()
    assert lived["fruitiness"] < 0.45
    assert lived["milkiness"] > lived["fruitiness"]


def test_rating_moves_the_drink_and_reset_clears_it():
    client = _client()
    _login(client, "andrew@tealink.demo")
    opening = _recommend(client)
    assert [round(item["score"] * 100) for item in opening["options"]] == [78, 77, 71]
    offered = {item["drink_id"] for item in opening["options"]}
    drink_id = "sr_hojicha_cream"
    assert drink_id not in offered

    receipt = client.post(
        "/orders",
        json={"shop_id": "sunright", "items": [{"drink_id": drink_id}], "pay": "pickup"},
    ).json()
    assert "learned" not in receipt
    past = client.get("/users/andrew", params={"viewer": "andrew"}).json()["stats"]["past_orders"]
    assert past[0]["drink_id"] == drink_id and past[0]["rating"] is None

    match_at_4 = _match(client, drink_id)
    assert client.patch(f"/orders/{receipt['order_id']}", json={"rating": 5}).status_code == 422

    client.post("/auth/logout")
    _login(client, "sunright@tealink.demo")
    for status in ("accepted", "ready", "picked_up"):
        assert client.patch(f"/orders/{receipt['order_id']}", json={"status": status}).status_code == 200
    client.post("/auth/logout")
    _login(client, "andrew@tealink.demo")

    rated = client.patch(f"/orders/{receipt['order_id']}", json={"rating": 0})
    assert rated.status_code == 200 and rated.json()["rating"] == 0
    _recommend(client)
    match_at_0 = _match(client, drink_id)
    assert match_at_0 < match_at_4

    assert client.patch(f"/orders/{receipt['order_id']}", json={"rating": 5}).status_code == 200
    _recommend(client)
    assert _match(client, drink_id) > match_at_0

    cleared = client.patch(f"/orders/{receipt['order_id']}", json={"rating": None})
    assert cleared.status_code == 200 and cleared.json()["rating"] is None
    client.post("/events/reset")
    _login(client, "andrew@tealink.demo")
    assert client.get("/orders").json() == []
    assert _match(client, drink_id) != match_at_0


def test_shop_popularity_is_between_zero_and_one():
    client = _client()
    shops = client.get("/shops").json()
    values = [shop["popularity"] for shop in shops]
    assert values and max(values) == 1
    assert all(0 <= value <= 1 for value in values)
    assert all(set(shop) >= {"id", "name", "neighborhood", "photo_url", "popularity"} for shop in shops)


def _match(client: TestClient, drink_id: str) -> float:
    drinks = client.get("/drinks", params={"user": "andrew"}).json()
    return next(item["match"] for item in drinks if item["id"] == drink_id)


def _drink(drink_id: str, **attrs: float):
    from tealink.schemas import Drink

    attributes = {name: 0.0 for name in ATTRIBUTES}
    attributes.update(attrs)
    return Drink(id=drink_id, name=drink_id, shop_id="shop", price=5, attributes=attributes, flavor_tags=[])
