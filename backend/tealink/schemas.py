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


class ObjectionKind(str, Enum):
    veto = "veto"
    concern = "concern"
    neutral = "neutral"
    support = "support"


class Objection(BaseModel):
    agent_id: str
    target_drink_id: str
    kind: ObjectionKind
    reason: str
    score: float | None = None
    dimension: str | None = None


class AgentSelection(BaseModel):
    agent_id: str
    capabilities: list[str]
    reason: str


class RankedDrink(BaseModel):
    drink_id: str
    drink_name: str
    score: float
    shop_id: str = ""
    price: float = 0.0
    dimension_scores: dict[str, float] = Field(default_factory=dict)


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


class LensEvent(BaseModel):
    type: LensEventType
    agent_id: str | None
    message: str
    payload: dict
    seq: int


class DeliberationRequest(BaseModel):
    round: Literal["propose", "object", "learn"]
    user_id: str
    query: str
    preference_overrides: dict[str, float] = Field(default_factory=dict)
    candidate_drink_ids: list[str] = Field(default_factory=list)
    sold_out_drink_ids: list[str] = Field(default_factory=list)
    choice: ChoiceRecord | None = None


class AgentReply(BaseModel):
    agent_id: str
    proposals: list[Proposal] = Field(default_factory=list)
    objections: list[Objection] = Field(default_factory=list)
    preference: PreferenceReport | None = None
