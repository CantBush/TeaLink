"""The Preference agent learns priorities from picks and explains each shift."""

from tealink.agents.preference_agent import PreferenceAgent
from tealink.core.preferences import PRIOR, fit, update
from tealink.data.loader import load_catalog, load_choices
from tealink.data.seed import write_dataset
from tealink.schemas import ChoiceRecord, DeliberationRequest, RankedDrink


def _option(drink_id: str, **scores: float) -> RankedDrink:
    full = {"taste": 0.5, "social": 0.5, "novelty": 0.5, "cost": 0.5} | scores
    return RankedDrink(drink_id=drink_id, drink_name=drink_id, score=0.5, dimension_scores=full)


def _cheap_over_tasty() -> ChoiceRecord:
    return ChoiceRecord(
        user_id="u",
        chosen_drink_id="cheap",
        options=[_option("cheap", taste=0.7, cost=0.9), _option("tasty", taste=0.95, cost=0.1)],
    )


def test_picking_the_cheaper_drink_raises_cost_and_lowers_taste():
    after = update(PRIOR, _cheap_over_tasty())
    assert after["cost"] > PRIOR["cost"]
    assert after["taste"] < PRIOR["taste"]
    assert abs(sum(after.values()) - 1.0) < 1e-9


def test_weights_stay_positive_after_many_one_sided_picks():
    weights = fit([_cheap_over_tasty()] * 20)
    assert min(weights.values()) > 0.0
    assert weights["cost"] == max(weights.values())


def test_pick_outside_the_options_changes_nothing():
    choice = ChoiceRecord(user_id="u", chosen_drink_id="missing", options=[_option("a"), _option("b")])
    assert update(PRIOR, choice) == fit([], PRIOR)


def test_one_live_pick_uses_the_full_rate_and_older_live_picks_fade():
    live = _cheap_over_tasty()
    historic = live.model_copy(update={"source": "history"})
    assert fit([live]) == fit([historic])

    tasty = ChoiceRecord(
        user_id="u",
        chosen_drink_id="tasty",
        source="live",
        options=[_option("cheap", taste=0.7, cost=0.9), _option("tasty", taste=0.95, cost=0.1)],
    )
    cheap = _cheap_over_tasty()
    both_full = fit(
        [
            tasty.model_copy(update={"source": "history"}),
            cheap.model_copy(update={"source": "history"}),
        ]
    )
    newer_cheap = fit([tasty, cheap])
    assert newer_cheap["cost"] > both_full["cost"]


def test_agent_learns_from_seeded_history_and_live_picks():
    write_dataset()
    catalog = load_catalog()
    history = load_choices()
    assert history and all(choice.source == "history" for choice in history)
    agent = PreferenceAgent(history)

    start = agent.handle(DeliberationRequest(round="propose", user_id="andrew", query=""), catalog).preference
    assert start is not None
    assert start.choices_seen == len(history)
    assert start.weights["cost"] > PRIOR["cost"]
    assert start.weights["novelty"] < PRIOR["novelty"]

    live = _cheap_over_tasty().model_copy(update={"user_id": "andrew"})
    learned = agent.handle(DeliberationRequest(round="learn", user_id="andrew", query="", choice=live), catalog).preference
    assert learned is not None
    assert learned.previous_weights == start.weights
    assert learned.weights["cost"] > start.weights["cost"]
    assert "price now counts for" in learned.summary
