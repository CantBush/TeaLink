"""Taste profile, match score, factors, and review retrieval."""

from tealink.agents.explorer_agent import ExplorerAgent
from tealink.agents.social_agent import SocialAgent
from tealink.agents.taste_agent import TasteAgent
from tealink.core.retrieval import retrieve_evidence
from tealink.core.taste import factor_contributions, match_score, taste_profile
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import ATTRIBUTES, DeliberationRequest, Drink, Review


def _drink(drink_id: str, **attrs: float) -> Drink:
    attributes = {name: 0.0 for name in ATTRIBUTES}
    attributes.update(attrs)
    return Drink(
        id=drink_id,
        name=drink_id,
        shop_id="shop",
        price=5.0,
        attributes=attributes,
        flavor_tags=["oolong"],
    )


def _review(review_id: str, drink_id: str, rating: int) -> Review:
    return Review(
        id=review_id,
        user_id="u",
        drink_id=drink_id,
        rating=rating,
        text="tasted it",
    )


def test_profile_is_rating_weighted_average():
    drinks = {
        "a": _drink("a", sweetness=1, milkiness=1, tea_intensity=1, fruitiness=1, toppings=1),
        "b": _drink("b"),
    }
    reviews = [_review("r1", "a", 5), _review("r2", "b", 1)]
    profile = taste_profile(reviews, drinks)
    assert profile["sweetness"] == pytest_approx(1 / 1.2)
    assert profile["fruitiness"] == pytest_approx(1 / 1.2)
    assert taste_profile([], drinks)["sweetness"] == 0.5


def test_match_score_and_overrides():
    profile = {name: 0.0 for name in ATTRIBUTES}
    drink = {name: 0.0 for name in ATTRIBUTES}
    drink["sweetness"] = 1.0
    assert match_score(profile, drink) == pytest_approx(0.8)
    assert match_score(profile, drink, {"sweetness": 1}) == pytest_approx(1.0)
    assert match_score(profile, drink, {"sweetness": 5}) == pytest_approx(1.0)
    assert match_score(profile, drink, {"sweetness": -1}) == pytest_approx(0.8)
    same = {name: 0.5 for name in ATTRIBUTES}
    assert match_score(same, same) == pytest_approx(1.0)
    opposite = {name: 1.0 for name in ATTRIBUTES}
    zeros = {name: 0.0 for name in ATTRIBUTES}
    assert match_score(zeros, opposite) == pytest_approx(0.0)


def test_factors_sum_to_match_score_and_can_be_negative():
    profile = {name: 0.8 for name in ATTRIBUTES}
    drink = {name: 0.8 for name in ATTRIBUTES}
    drink["sweetness"] = 0.0
    score = match_score(profile, drink)
    factors = factor_contributions(profile, drink)
    assert abs(sum(factor.weight for factor in factors) - score) < 1e-9
    weights = [abs(factor.weight) for factor in factors]
    assert weights == sorted(weights, reverse=True)
    by_name = {factor.factor: factor.weight for factor in factors}
    assert by_name["sweetness"] == pytest_approx((1 - 0.8) / 5)
    assert by_name["milkiness"] == pytest_approx(0.2)
    assert factors[-1].factor == "sweetness"


def test_retrieval_returns_closest_reviews():
    close = _drink("close", sweetness=0.1, milkiness=0.9, tea_intensity=0.1, fruitiness=0.1, toppings=0.1)
    far = _drink("far", sweetness=0.0, milkiness=0.0, tea_intensity=0.0, fruitiness=1, toppings=0.0)
    candidate = _drink("candidate", sweetness=0.5, milkiness=1.0, tea_intensity=0.5, fruitiness=0.5, toppings=0.5)
    drinks = {"close": close, "far": far, "candidate": candidate}
    reviews = [_review("far-review", "far", 5), _review("close-review", "close", 4)]
    evidence = retrieve_evidence(reviews, drinks, candidate, k=1)
    assert len(evidence) == 1
    assert evidence[0].review_id == "close-review"
    assert evidence[0].relevance == "You rated this 4/5; similar milkiness."
    assert len(retrieve_evidence(reviews, drinks, candidate, k=5)) == 2


def test_seed_personas_and_agents():
    write_dataset()
    catalog = load_catalog()
    assert {shop.id for shop in catalog.shops} >= {
        "kungfu",
        "sunright",
        "tigersugar",
        "boba_guys",
        "sharetea",
    }
    assert len(catalog.drinks) == 40
    assert len(catalog.users) == 15
    assert catalog.users_by_id["andrew"].name == "Andrew"
    assert catalog.users_by_id["sarah"].name == "Sarah"
    for user in catalog.users:
        count = len(catalog.reviews_for(user.id))
        assert 8 <= count <= 12

    andrew = catalog.reviews_for("andrew")
    profile = taste_profile(andrew, catalog.drinks_by_id)
    assert profile["milkiness"] > 0.75
    assert profile["sweetness"] > 0.75
    assert profile["fruitiness"] < 0.25
    assert 0.3 < profile["tea_intensity"] < 0.65
    assert "sr_hojicha_cream" not in {review.drink_id for review in andrew}
    hojicha = [
        review
        for review in catalog.reviews_for("sarah")
        if review.drink_id == "sr_hojicha_cream"
    ]
    assert hojicha and hojicha[0].rating == 5

    request = DeliberationRequest(round="propose", user_id="andrew", query="What should I get next?")
    taste = TasteAgent().handle(request, catalog)
    assert len(taste.proposals) == 1
    proposal = taste.proposals[0]
    assert proposal.score > 0.85
    assert "brown_sugar" in catalog.drink(proposal.drink_id).flavor_tags
    assert abs(sum(factor.weight for factor in proposal.factors) - proposal.score) < 1e-6

    social = SocialAgent().handle(request, catalog)
    assert social.proposals[0].drink_id == "sr_hojicha_cream"

    explorer = ExplorerAgent().handle(request, catalog)
    tried = {review.drink_id for review in andrew}
    assert explorer.proposals[0].drink_id not in tried


def pytest_approx(value: float):
    return Approx(value)


class Approx:
    def __init__(self, value: float) -> None:
        self.value = value

    def __eq__(self, other: object) -> bool:
        return isinstance(other, (int, float)) and abs(float(other) - self.value) < 1e-9
