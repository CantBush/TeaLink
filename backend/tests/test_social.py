"""Social layer: quiz mapping, boba stats, profiles, follows, and the feed."""

import json
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from tealink.api.main import app
from tealink.core import quiz
from tealink.core.stats import streak_weeks
from tealink.data.loader import load_catalog
from tealink.data.seed import SEED_NOW, write_dataset

PRICE_HUNTER = {
    "sweetness": "50",
    "base": "milk",
    "toppings": ["pearls"],
    "budget": "under_5",
    "adventure": "same",
    "shop": "sharetea",
}
EXPLORER = {
    "sweetness": "30",
    "base": "fruit",
    "toppings": ["jelly", "foam"],
    "budget": "splurge",
    "adventure": "always_new",
    "shop": "friends",
}
BROWN_SUGAR = {
    "sweetness": "100",
    "base": "milk",
    "toppings": ["brown_sugar"],
    "budget": "splurge",
    "adventure": "same",
    "shop": "tigersugar",
}


@pytest.fixture
def client() -> TestClient:
    write_dataset()
    app.state.runtime = None
    test_client = TestClient(app)
    test_client.post("/events/reset")
    yield test_client
    test_client.post("/events/reset")


def _decision(client: TestClient, user_id: str) -> tuple[list[dict], dict]:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": user_id}) as response:
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return events, next(event["payload"] for event in events if event["type"] == "decision")


def _sign_up(client: TestClient, handle: str, answers: dict) -> dict:
    assert client.post("/users", json={"handle": handle, "display_name": handle.title()}).status_code == 200
    response = client.post("/quiz", json={"user_id": handle, "answers": answers})
    assert response.status_code == 200, response.text
    return response.json()


def test_quiz_answers_set_profile_and_priorities():
    shops = load_catalog().shops
    cheap = quiz.score(PRICE_HUNTER, shops)
    assert cheap.weights["cost"] > quiz.PRIOR["cost"]
    assert cheap.weights["novelty"] < quiz.PRIOR["novelty"]
    assert cheap.profile["milkiness"] > 0.8 and cheap.fav_shop_id == "sharetea"

    explorer = quiz.score(EXPLORER, shops)
    assert max(explorer.weights, key=explorer.weights.get) == "novelty"
    assert explorer.weights["social"] > quiz.PRIOR["social"]
    assert explorer.profile["fruitiness"] > 0.8 and explorer.fav_shop_id is None
    assert explorer.toppings == ["fruit jelly", "cream foam"]

    for outcome in (cheap, explorer):
        assert abs(sum(outcome.weights.values()) - 1.0) < 1e-9
        assert min(outcome.weights.values()) >= 0.05


def test_quiz_rejects_bad_answers():
    shops = load_catalog().shops
    with pytest.raises(ValueError, match="missing"):
        quiz.score({key: value for key, value in PRICE_HUNTER.items() if key != "budget"}, shops)
    with pytest.raises(ValueError, match="exactly one"):
        quiz.score(PRICE_HUNTER | {"base": ["milk", "fruit"]}, shops)
    with pytest.raises(ValueError, match="no option"):
        quiz.score(PRICE_HUNTER | {"sweetness": "200"}, shops)


def test_streak_counts_consecutive_weeks_and_survives_an_empty_current_week():
    weeks = [SEED_NOW - timedelta(weeks=back) for back in (0, 1, 2, 4)]
    assert streak_weeks(weeks, SEED_NOW) == 3
    assert streak_weeks(weeks[1:], SEED_NOW) == 2
    assert streak_weeks(weeks[2:], SEED_NOW) == 0


def test_seeded_profile_hides_private_stats_from_other_viewers(client: TestClient):
    sarah = client.get("/users/sarah", params={"viewer": "andrew"}).json()
    assert sarah["handle"] == "sarah" and sarah["followed_by_me"] is True
    assert sarah["taste_match"] > 0.9
    assert "priorities" not in sarah["stats"] and sarah["stats"]["personality"]
    assert sarah["stats"]["streak_weeks"] >= 0

    mine = client.get("/users/andrew", params={"viewer": "andrew"}).json()
    assert mine["taste_match"] is None
    assert set(mine["stats"]["priorities"]) == {"taste", "social", "novelty", "cost"}

    edited = client.patch("/users/andrew", json={"visible_stats": ["streak", "fav_shop"], "bio": "New bio"}).json()
    assert edited["visible_stats"] == ["streak", "fav_shop"] and edited["bio"] == "New bio"
    assert "fav_drink_id" in edited["stats"]
    seen = client.get("/users/@andrew", params={"viewer": "sarah"}).json()
    assert set(seen["stats"]) == {"streak_weeks", "fav_shop_id", "personality"}

    assert client.patch("/users/andrew", json={"handle": "sarah"}).status_code == 409
    assert client.patch("/users/andrew", json={"visible_stats": ["nope"]}).status_code == 422


def test_follow_counts_and_feed_order(client: TestClient):
    before = client.get("/users/sarah").json()["followers"]
    assert client.post("/users", json={"handle": "Newbie"}).json()["handle"] == "newbie"
    assert client.post("/users", json={"handle": "newbie"}).status_code == 409

    followed = client.post("/users/sarah/follow", json={"viewer": "newbie"}).json()
    assert followed["followers"] == before + 1 and followed["followed_by_me"] is True
    assert client.get("/users/newbie").json()["following"] == 1
    assert client.post("/users/newbie/follow", json={"viewer": "newbie"}).status_code == 422

    items = client.get("/feed", params={"user_id": "newbie"}).json()["items"]
    assert {item["user_id"] for item in items} <= {"sarah", "newbie"}
    stamps = [item["created_at"] for item in items]
    assert stamps == sorted(stamps, reverse=True)

    unfollowed = client.request("DELETE", "/users/sarah/follow", json={"viewer": "newbie"}).json()
    assert unfollowed["followers"] == before and unfollowed["followed_by_me"] is False


def test_picks_post_to_the_feed_and_friends_can_react(client: TestClient):
    _events, decision = _decision(client, "andrew")
    pick = decision["options"][2]["drink_id"]
    assert client.post("/choices", json={"user_id": "andrew", "drink_id": pick}).status_code == 200

    top = client.get("/feed", params={"user_id": "sarah"}).json()["items"][0]
    assert top["kind"] == "pick" and top["user_id"] == "andrew" and top["drink_id"] == pick

    liked = client.post(f"/feed/{top['id']}/like", json={"user_id": "sarah"}).json()
    assert liked["likes"] == 1 and liked["liked_by_me"] is True
    again = client.post(f"/feed/{top['id']}/like", json={"user_id": "sarah"}).json()
    assert again["likes"] == 1
    commented = client.post(f"/feed/{top['id']}/comments", json={"user_id": "sarah", "text": "Good call!"}).json()
    assert commented["comments"][-1]["text"] == "Good call!"
    assert client.post(f"/feed/{top['id']}/comments", json={"user_id": "sarah", "text": "  "}).status_code == 422

    rec = client.post("/recs", json={"from": "sarah", "to": "nora", "drink_id": "sr_hojicha_cream", "text": "Try it"})
    assert rec.status_code == 200 and rec.json()["to_user_id"] == "nora"
    assert client.get("/feed", params={"user_id": "nora"}).json()["items"][0]["id"] == rec.json()["id"]

    stats = client.get("/users/andrew", params={"viewer": "andrew"}).json()["stats"]
    assert stats["tried_count"] >= 11


def test_new_users_first_recommendation_uses_quiz_weights(client: TestClient):
    result = _sign_up(client, "pricey", PRICE_HUNTER)
    assert result["personality"] and result["stats"]["tried_count"] == 0
    assert result["stats"]["fav_shop_id"] == "sharetea"
    expected = quiz.score(PRICE_HUNTER, load_catalog().shops).weights

    events, decision = _decision(client, "pricey")
    report = next(event for event in events if event["type"] == "preference")["payload"]
    assert report["choices_seen"] == 0 and "quiz" in report["summary"]
    for dim, weight in expected.items():
        assert abs(report["weights"][dim] - weight) < 1e-9
        assert abs(decision["weights"][dim] - weight) < 1e-9
    assert len(decision["options"]) == 3

    learned = client.post("/choices", json={"user_id": "pricey", "drink_id": decision["options"][1]["drink_id"]}).json()
    assert learned["previous_weights"] == report["weights"]

    sweet = _sign_up(client, "sugar", BROWN_SUGAR)
    assert sweet["personality"] == "Brown Sugar Loyalist"
    assert "brown sugar pearls" in sweet["stats"]["toppings"]


def test_new_users_do_not_change_the_demo(client: TestClient):
    _events, before = _decision(client, "andrew")
    _sign_up(client, "copycat", BROWN_SUGAR)
    client.post("/users/andrew/follow", json={"viewer": "copycat"})
    _events, after = _decision(client, "andrew")
    assert [item["drink_id"] for item in after["options"]] == [item["drink_id"] for item in before["options"]]

    client.post("/events/reset")
    assert client.get("/users/copycat").status_code == 404
    assert "copycat" not in [user["user_id"] for user in client.get("/users/andrew/followers").json()["users"]]
