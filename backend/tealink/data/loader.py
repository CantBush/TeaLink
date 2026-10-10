"""Load seed JSON into pydantic models."""

from __future__ import annotations

import json
from pathlib import Path

from tealink.config import get_settings
from tealink.schemas import ChoiceRecord, Drink, Review, Shop, User


class Catalog:
    def __init__(
        self,
        shops: list[Shop],
        drinks: list[Drink],
        users: list[User],
        reviews: list[Review],
    ) -> None:
        self.shops = shops
        self.drinks = drinks
        self.users = users
        self.reviews = reviews
        self.shops_by_id = {shop.id: shop for shop in shops}
        self.drinks_by_id = {drink.id: drink for drink in drinks}
        self.users_by_id = {user.id: user for user in users}
        self.reviews_by_user: dict[str, list[Review]] = {}
        for review in reviews:
            self.reviews_by_user.setdefault(review.user_id, []).append(review)
        # Quiz profiles, keyed by user. They seed the taste profile.
        self.base_profiles: dict[str, dict[str, float]] = {}
        # Users created or re-profiled after load. Agent processes over NATS
        # loaded the catalog at startup and have never seen these changes.
        self.runtime_users: set[str] = set()

    def add_user(self, user: User) -> None:
        self.users.append(user)
        self.users_by_id[user.id] = user
        self.runtime_users.add(user.id)

    def set_base_profile(self, user_id: str, profile: dict[str, float]) -> None:
        self.base_profiles[user_id] = dict(profile)
        self.runtime_users.add(user_id)

    def reviews_for(self, user_id: str) -> list[Review]:
        return list(self.reviews_by_user.get(user_id, []))

    def drink(self, drink_id: str) -> Drink | None:
        return self.drinks_by_id.get(drink_id)

    def shop(self, shop_id: str) -> Shop | None:
        return self.shops_by_id.get(shop_id)


def load_catalog(data_dir: Path | None = None) -> Catalog:
    directory = data_dir or get_settings().data_dir
    shops = [Shop.model_validate(row) for row in _read(directory / "shops.json")]
    drinks = [Drink.model_validate(row) for row in _read(directory / "drinks.json")]
    users = [User.model_validate(row) for row in _read(directory / "users.json")]
    reviews = [Review.model_validate(row) for row in _read(directory / "reviews.json")]
    return Catalog(shops=shops, drinks=drinks, users=users, reviews=reviews)


def load_choices(data_dir: Path | None = None) -> list[ChoiceRecord]:
    """Seeded past picks. Missing file means no history yet."""
    path = (data_dir or get_settings().data_dir) / "choices.json"
    if not path.exists():
        return []
    return [ChoiceRecord.model_validate(row) for row in _read(path)]


def _read(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Run `python -m tealink.data.seed` from backend/."
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{path} must contain a JSON list")
    return payload
