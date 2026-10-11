"""Shared request and event models. JSON fields are snake_case."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

ATTRIBUTES: tuple[str, ...] = (
    "sweetness",
    "milkiness",
    "tea_intensity",
    "fruitiness",
    "toppings",
)

DIMENSIONS: tuple[str, ...] = ("taste", "social", "novelty", "cost")


class Drink(BaseModel):
    id: str
    name: str
    shop_id: str
    price: float
    attributes: dict[str, float]
    flavor_tags: list[str]
    available: bool = True

    @model_validator(mode="after")
    def _check_attributes(self) -> Drink:
        expected = set(ATTRIBUTES)
        got = set(self.attributes)
        if got != expected:
            raise ValueError(
                f"attributes must be {sorted(expected)}, got {sorted(got)}"
            )
        for key, value in self.attributes.items():
            if not 0.0 <= float(value) <= 1.0:
                raise ValueError(f"{key} must be between 0 and 1")
        return self


class Shop(BaseModel):
    id: str
    name: str
    neighborhood: str
    online: bool = True
    # Dollars the shop can put toward a close-call discount. Default covers 10% of any drink.
    promo_budget: float = 1.0


class Review(BaseModel):
    id: str
    user_id: str
    drink_id: str
    rating: int = Field(ge=1, le=5)
    text: str


class User(BaseModel):
    id: str
    name: str
    persona: str


class Evidence(BaseModel):
    review_id: str
    drink_name: str
    rating: int
    text: str
    relevance: str


class FactorContribution(BaseModel):
    factor: str
    weight: float


class Proposal(BaseModel):
    agent_id: str
    drink_id: str
    drink_name: str
    shop_id: str
    score: float
    factors: list[FactorContribution]
    evidence: list[Evidence]
    rationale: str
    price: float = 0.0
    dimension: str | None = None
    # 0 on the proposal event. Later rounds are objections and rebuttals.
    round: int | None = None


class ObjectionKind(str, Enum):
    veto = "veto"
    concern = "concern"
    neutral = "neutral"
    support = "support"


class RevisedFrom(BaseModel):
    """The stance an objection had before this round softened it.

    Omitted when nothing moved. Vetoes never carry it. Kind is the soften
    scale (concern, then neutral, then support); veto is outside that scale.
    """

    kind: Literal["support", "concern", "neutral"]
    score: float | None = None


class Objection(BaseModel):
    agent_id: str
    target_drink_id: str
    kind: ObjectionKind
    reason: str
    score: float | None = None
    dimension: str | None = None
    # Set only on the round that softened this stance. Previous kind and score.
    revised_from: RevisedFrom | None = None
    # 1 is the first objection round. Rebuttals are 2, 3, then 4.
    round: int | None = None


class AgentSelection(BaseModel):
    agent_id: str
    capabilities: list[str]
    reason: str
    # Copied from the agent card so a team grid can render without another request.
    name: str | None = None
    description: str | None = None


class Offer(BaseModel):
    """A shop's discount on one drink. percent is a whole number, so 10 means 10% off."""

    shop_id: str
    percent: int
    price_after: float
    reason: str


class RankedDrink(BaseModel):
    drink_id: str
    drink_name: str
    score: float
    shop_id: str = ""
    price: float = 0.0
    dimension_scores: dict[str, float] = Field(default_factory=dict)
    offer: Offer | None = None


class DroppedDrink(BaseModel):
    drink_id: str
    drink_name: str
    reason: str
    by: str


class Decision(BaseModel):
    drink_id: str
    drink_name: str
    shop_id: str
    score: float
    ask_human: bool
    question: str | None
    alternatives: list[RankedDrink]
    explanation: str
    options: list[RankedDrink] = Field(default_factory=list)
    weights: dict[str, float] = Field(default_factory=dict)
    dropped: list[DroppedDrink] = Field(default_factory=list)
    # "agents" when a rebuttal changes nothing before the cap, including the third.
    # "arbiter" in single mode, when all 3 rebuttals still move, or on a revise timeout.
    decided_by: Literal["agents", "arbiter"] | None = None
    # Rebuttal rounds that finished. 0 in single mode. A discarded timeout does not count.
    rounds: int | None = None


class ChoiceRecord(BaseModel):
    """One time the user picked a drink from a set of offered options."""

    user_id: str
    chosen_drink_id: str
    options: list[RankedDrink]
    source: Literal["history", "live"] = "live"


class PreferenceReport(BaseModel):
    user_id: str
    weights: dict[str, float]
    previous_weights: dict[str, float] | None = None
    choices_seen: int
    summary: str


class LensEventType(str, Enum):
    selection = "selection"
    proposal = "proposal"
    objection = "objection"
    decision = "decision"
    status = "status"
    preference = "preference"
    offer = "offer"


class LensEvent(BaseModel):
    type: LensEventType
    agent_id: str | None
    message: str
    payload: dict
    seq: int


class DeliberationRequest(BaseModel):
    round: Literal["propose", "object", "learn", "offer", "revise"]
    user_id: str
    query: str
    preference_overrides: dict[str, float] = Field(default_factory=dict)
    candidate_drink_ids: list[str] = Field(default_factory=list)
    sold_out_drink_ids: list[str] = Field(default_factory=list)
    choice: ChoiceRecord | None = None
    # Starting weights from the onboarding quiz. Picks are learned on top of them.
    prior_weights: dict[str, float] | None = None
    # Latest objections from every agent. Revise is stateless, so the prior stance travels here.
    peer_objections: list[Objection] = Field(default_factory=list)


class AgentReply(BaseModel):
    agent_id: str
    proposals: list[Proposal] = Field(default_factory=list)
    objections: list[Objection] = Field(default_factory=list)
    preference: PreferenceReport | None = None
    offer: Offer | None = None


# Social layer. Mirrored in frontend/src/api/types.ts.

StatKey = Literal[
    "fav_drink",
    "fav_shop",
    "sweetness",
    "toppings",
    "milk_vs_fruit",
    "tried_count",
    "shops_visited",
    "streak",
    "top_notes",
    "priorities",
]

STAT_KEYS: tuple[str, ...] = (
    "fav_drink",
    "fav_shop",
    "sweetness",
    "toppings",
    "milk_vs_fruit",
    "tried_count",
    "shops_visited",
    "streak",
    "top_notes",
    "priorities",
)

# The BobaStats fields each stat key shows. Personality is always shown.
STAT_FIELDS: dict[str, str] = {
    "fav_drink": "fav_drink_id",
    "fav_shop": "fav_shop_id",
    "sweetness": "sweetness",
    "toppings": "toppings",
    "milk_vs_fruit": "milk_vs_fruit",
    "tried_count": "tried_count",
    "shops_visited": "shops_visited",
    "streak": "streak_weeks",
    "top_notes": "top_notes",
    "priorities": "priorities",
}


class BobaStats(BaseModel):
    fav_drink_id: str | None = None
    fav_shop_id: str | None = None
    sweetness: float = 0.5
    toppings: float = 0.5
    milk_vs_fruit: float = 0.5
    tried_count: int = 0
    shops_visited: int = 0
    streak_weeks: int = 0
    top_notes: list[str] = Field(default_factory=list)
    priorities: dict[str, float] = Field(default_factory=dict)
    personality: str = ""


class Avatar(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class UserProfile(BaseModel):
    user_id: str
    handle: str
    display_name: str
    bio: str
    avatar: Avatar
    accent: str
    # In-memory boba-card background. Same #RRGGBB check as accent. Reset demo clears it.
    card_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    pinned_drink_id: str | None
    pinned_shop_id: str | None
    visible_stats: list[StatKey]
    followers: int
    following: int
    followed_by_me: bool
    taste_match: float | None
    stats: dict
    # Reserved for a chosen cover. Null until photo uploads exist.
    cover_url: str | None = None


class QuizOption(BaseModel):
    id: str
    label: str
    emoji: str | None = None


class QuizQuestion(BaseModel):
    id: str
    prompt: str
    options: list[QuizOption]
    multi: bool = False


class Author(BaseModel):
    handle: str
    display_name: str
    avatar: Avatar


class QuizResult(BaseModel):
    user_id: str
    personality: str
    stats: BobaStats
    weights: dict[str, float]


class FeedComment(BaseModel):
    id: str
    user_id: str
    text: str
    created_at: str
    author: Author | None = None


class FeedItem(BaseModel):
    id: str
    user_id: str
    kind: Literal["review", "pick", "rec", "joined"]
    drink_id: str | None = None
    rating: int | None = None
    text: str | None = None
    to_user_id: str | None = None
    created_at: str
    likes: int = 0
    liked_by_me: bool = False
    comments: list[FeedComment] = Field(default_factory=list)
    author: Author | None = None
    to_author: Author | None = None
    # Reserved for a review photo. Null until photo uploads exist.
    photo_url: str | None = None
