"""Write a deterministic boba catalog to backend/data/*.json.

``random.seed(7)`` fixes the reviews for everyone except Andrew and Sarah,
whose reviews are written out so their personas stay stable.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from tealink.core.taste import match_score
from tealink.schemas import ATTRIBUTES, Drink, Review, Shop, User

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

SHOPS: list[tuple[str, str, str]] = [
    ("kungfu", "Kung Fu Tea Co.", "Inner Sunset"),
    ("sunright", "Sunright Tea Studio", "Mission"),
    ("tigersugar", "Tiger Sugar Lab", "SoMa"),
    ("boba_guys", "Boba Guys", "Hayes Valley"),
    ("sharetea", "Sharetea Lounge", "Richmond"),
]

# id, name, shop_id, price, sweetness, milkiness, tea_intensity, fruitiness, toppings, tags
RAW_DRINKS: list[tuple] = [
    ("kf_brown_sugar_oolong", "Brown Sugar Oolong Milk Tea", "kungfu", 6.50, 0.84, 0.80, 0.45, 0.08, 0.70, ("brown_sugar", "oolong")),
    ("kf_classic_milk", "Classic Milk Tea", "kungfu", 5.50, 0.70, 0.80, 0.55, 0.05, 0.40, ("oolong",)),
    ("kf_jasmine_milk", "Jasmine Milk Tea", "kungfu", 5.75, 0.65, 0.75, 0.45, 0.10, 0.30, ("jasmine",)),
    ("kf_taro", "Taro Milk Tea", "kungfu", 6.00, 0.80, 0.85, 0.20, 0.15, 0.50, ("taro",)),
    ("kf_mango_green", "Mango Green Tea", "kungfu", 5.75, 0.60, 0.10, 0.40, 0.90, 0.20, ("fruit",)),
    ("kf_passion_fruit", "Passion Fruit Green Tea", "kungfu", 5.50, 0.55, 0.05, 0.35, 0.95, 0.15, ("fruit",)),
    ("kf_matcha_latte", "Matcha Latte", "kungfu", 6.25, 0.55, 0.80, 0.60, 0.05, 0.20, ("matcha",)),
    ("kf_thai", "Thai Tea", "kungfu", 5.25, 0.85, 0.70, 0.50, 0.10, 0.35, ("thai_tea",)),
    ("sr_hojicha_cream", "Hojicha Cream Tea", "sunright", 6.75, 0.70, 0.85, 0.55, 0.05, 0.25, ("hojicha",)),
    ("sr_hojicha_latte", "Hojicha Latte", "sunright", 6.50, 0.60, 0.80, 0.60, 0.05, 0.20, ("hojicha",)),
    ("sr_brown_sugar_black", "Brown Sugar Black Milk", "sunright", 6.50, 0.92, 0.90, 0.45, 0.02, 0.90, ("brown_sugar",)),
    ("sr_osmanthus_oolong", "Osmanthus Oolong", "sunright", 5.00, 0.40, 0.15, 0.75, 0.10, 0.10, ("oolong",)),
    ("sr_strawberry_matcha", "Strawberry Matcha", "sunright", 6.25, 0.65, 0.50, 0.40, 0.80, 0.30, ("matcha", "fruit")),
    ("sr_pearl_milk", "Pearl Milk Tea", "sunright", 5.75, 0.75, 0.82, 0.40, 0.05, 0.80, ("oolong",)),
    ("sr_wintermelon", "Wintermelon Tea", "sunright", 4.75, 0.50, 0.20, 0.35, 0.15, 0.10, ("oolong",)),
    ("sr_grapefruit", "Grapefruit Green Tea", "sunright", 5.25, 0.45, 0.05, 0.40, 0.85, 0.10, ("fruit",)),
    ("ts_tiger_brown", "Tiger Brown Sugar Boba", "tigersugar", 7.00, 0.95, 0.85, 0.35, 0.02, 0.95, ("brown_sugar",)),
    ("ts_brown_cream", "Brown Sugar Cream Foam", "tigersugar", 6.75, 0.88, 0.90, 0.30, 0.05, 0.70, ("brown_sugar",)),
    ("ts_oolong_milk", "Roasted Oolong Milk Tea", "tigersugar", 6.25, 0.60, 0.75, 0.65, 0.05, 0.40, ("oolong",)),
    ("ts_black_sugar_fresh", "Fresh Milk Black Sugar", "tigersugar", 6.50, 0.80, 0.92, 0.25, 0.05, 0.75, ("brown_sugar",)),
    ("ts_matcha_brown", "Matcha Brown Sugar", "tigersugar", 6.75, 0.70, 0.70, 0.50, 0.05, 0.60, ("matcha", "brown_sugar")),
    ("ts_lychee", "Lychee Oolong", "tigersugar", 5.75, 0.55, 0.10, 0.50, 0.80, 0.20, ("fruit", "oolong")),
    ("ts_peach", "Peach Black Tea", "tigersugar", 5.50, 0.60, 0.10, 0.45, 0.85, 0.15, ("fruit",)),
    ("ts_sesame", "Black Sesame Latte", "tigersugar", 6.25, 0.65, 0.85, 0.20, 0.05, 0.40, ("taro",)),
    ("bg_horchata", "Horchata Milk Tea", "boba_guys", 6.50, 0.70, 0.80, 0.30, 0.10, 0.45, ("thai_tea",)),
    ("bg_strawberry_matcha", "Strawberry Matcha Latte", "boba_guys", 6.75, 0.60, 0.65, 0.40, 0.75, 0.25, ("fruit", "matcha")),
    ("bg_classic", "House Milk Tea", "boba_guys", 5.75, 0.72, 0.78, 0.50, 0.05, 0.55, ("oolong",)),
    ("bg_jasmine", "Jasmine Green Milk", "boba_guys", 5.50, 0.50, 0.70, 0.40, 0.15, 0.30, ("jasmine",)),
    ("bg_ube", "Ube Milk Tea", "boba_guys", 6.50, 0.75, 0.85, 0.15, 0.20, 0.50, ("taro",)),
    ("bg_pineapple", "Pineapple Green Tea", "boba_guys", 5.25, 0.50, 0.05, 0.35, 0.90, 0.10, ("fruit",)),
    ("bg_dirty_horchata", "Dirty Horchata", "boba_guys", 6.75, 0.65, 0.70, 0.55, 0.05, 0.40, ("thai_tea",)),
    ("bg_banana_milk", "Banana Milk", "boba_guys", 5.75, 0.80, 0.75, 0.10, 0.35, 0.20, ("fruit",)),
    ("st_qq", "QQ Passion Fruit Tea", "sharetea", 6.00, 0.70, 0.15, 0.30, 0.95, 0.40, ("fruit",)),
    ("st_thai", "Thai Milk Tea", "sharetea", 5.75, 0.85, 0.75, 0.50, 0.08, 0.45, ("thai_tea",)),
    ("st_taro", "Taro Smoothie", "sharetea", 6.25, 0.82, 0.80, 0.10, 0.20, 0.55, ("taro",)),
    ("st_oolong", "High Mountain Oolong", "sharetea", 4.50, 0.25, 0.05, 0.90, 0.05, 0.05, ("oolong",)),
    ("st_brown_sugar", "Brown Sugar Pearl Milk", "sharetea", 6.50, 0.90, 0.80, 0.35, 0.02, 0.90, ("brown_sugar",)),
    ("st_honey_lemon", "Honey Lemon Tea", "sharetea", 4.75, 0.55, 0.05, 0.40, 0.70, 0.05, ("fruit",)),
    ("st_matcha", "Matcha Milk Tea", "sharetea", 6.00, 0.50, 0.75, 0.55, 0.05, 0.35, ("matcha",)),
    ("st_coffee_milk", "Coffee Milk Tea", "sharetea", 6.25, 0.60, 0.70, 0.65, 0.02, 0.40, ("oolong",)),
]

ANDREW_REVIEWS: list[tuple[str, int, str]] = [
    ("kf_brown_sugar_oolong", 5, "Brown sugar and oolong, exactly my order."),
    ("ts_tiger_brown", 5, "Sweet, milky, and plenty of boba."),
    ("sr_brown_sugar_black", 5, "Could drink this every day."),
    ("st_brown_sugar", 4, "Really sweet, in a good way."),
    ("kf_classic_milk", 4, "Solid milk tea, not too fruity."),
    ("bg_classic", 4, "House milk tea hits the spot."),
    ("kf_taro", 4, "Creamy taro with the right sugar."),
    ("st_thai", 4, "Milky Thai tea, good sugar level."),
    ("kf_mango_green", 2, "Too fruity, not enough milk."),
    ("st_qq", 1, "Way too much passion fruit for me."),
]

SARAH_REVIEWS: list[tuple[str, int, str]] = [
    ("sr_hojicha_cream", 5, "The hojicha cream tea is perfect."),
    ("sr_hojicha_latte", 5, "Roasty, creamy, and not too sweet."),
    ("ts_oolong_milk", 5, "Roasted oolong milk tea, a new favorite."),
    ("kf_brown_sugar_oolong", 4, "Sweet, but I still like it."),
    ("bg_classic", 4, "Reliable house milk tea."),
    ("kf_jasmine_milk", 4, "Jasmine is gentle and milky."),
    ("st_matcha", 4, "Good matcha with enough milk."),
    ("sr_pearl_milk", 4, "Classic pearls, easy to finish."),
    ("kf_passion_fruit", 2, "A bit too sharp and fruity."),
    ("ts_peach", 2, "Peach overpowers the tea."),
]

OTHER_USERS: list[tuple[str, str, str]] = [
    ("maya", "Maya", "Orders fruit tea when the weather is warm."),
    ("jordan", "Jordan", "Splits time between matcha and milk tea."),
    ("priya", "Priya", "Likes jasmine and lighter sweetness."),
    ("leo", "Leo", "Looks for roasted tea and not much fruit."),
    ("nora", "Nora", "Happy with classic milk tea and pearls."),
    ("owen", "Owen", "Prefers unsweetened oolong."),
    ("rina", "Rina", "Matcha first, fruit second."),
    ("chris", "Chris", "Brown sugar when it is on the menu."),
    ("hana", "Hana", "Hojicha and other roasted drinks."),
    ("marco", "Marco", "Thai tea and horchata fan."),
    ("elena", "Elena", "Taro and other creamy drinks."),
    ("sam", "Sam", "Tries a new shop drink every week."),
    ("yuki", "Yuki", "Keeps tea intensity high and sugar low."),
]

_TEXTS = {
    1: ["Too far from what I like.", "I would not order this again."],
    2: ["Not really my thing.", "The flavors missed for me."],
    3: ["It was okay.", "Fine, nothing I would seek out."],
    4: ["Really enjoyable.", "I would get this again."],
    5: ["Loved it.", "This is exactly my order."],
}


def build_dataset() -> tuple[list[Shop], list[Drink], list[User], list[Review]]:
    random.seed(7)
    shops = [
        Shop(id=shop_id, name=name, neighborhood=neighborhood, online=True)
        for shop_id, name, neighborhood in SHOPS
    ]
    drinks = [_drink_from_row(row) for row in RAW_DRINKS]
    drinks_by_id = {drink.id: drink for drink in drinks}
    users = [
        User(id="andrew", name="Andrew", persona="Sweet, milky tea with boba and very little fruit."),
        User(
            id="sarah",
            name="Sarah",
            persona="Milky tea like Andrew, with a roasted hojicha favorite he has not tried.",
        ),
    ]
    reviews = _explicit_reviews("andrew", ANDREW_REVIEWS) + _explicit_reviews(
        "sarah", SARAH_REVIEWS
    )
    users.extend(
        User(id=user_id, name=name, persona=persona)
        for user_id, name, persona in OTHER_USERS
    )
    reviews.extend(_other_reviews(drinks_by_id))
    _assert_unique(shops, drinks, users, reviews)
    return shops, drinks, users, reviews


def write_dataset(directory: Path | None = None) -> Path:
    target = directory or DATA_DIR
    target.mkdir(parents=True, exist_ok=True)
    shops, drinks, users, reviews = build_dataset()
    _dump(target / "shops.json", [shop.model_dump(mode="json") for shop in shops])
    _dump(target / "drinks.json", [drink.model_dump(mode="json") for drink in drinks])
    _dump(target / "users.json", [user.model_dump(mode="json") for user in users])
    _dump(target / "reviews.json", [review.model_dump(mode="json") for review in reviews])
    return target


def main() -> None:
    target = write_dataset()
    shops, drinks, users, reviews = build_dataset()
    print(
        f"Wrote {len(shops)} shops, {len(drinks)} drinks, "
        f"{len(users)} users, {len(reviews)} reviews to {target}"
    )


def _drink_from_row(row: tuple) -> Drink:
    (
        drink_id,
        name,
        shop_id,
        price,
        sweetness,
        milkiness,
        tea_intensity,
        fruitiness,
        toppings,
        tags,
    ) = row
    attributes = {
        "sweetness": sweetness,
        "milkiness": milkiness,
        "tea_intensity": tea_intensity,
        "fruitiness": fruitiness,
        "toppings": toppings,
    }
    return Drink(
        id=drink_id,
        name=name,
        shop_id=shop_id,
        price=float(price),
        attributes=attributes,
        flavor_tags=list(tags),
        available=True,
    )


def _explicit_reviews(user_id: str, rows: list[tuple[str, int, str]]) -> list[Review]:
    reviews: list[Review] = []
    for index, (drink_id, rating, text) in enumerate(rows, start=1):
        reviews.append(
            Review(
                id=f"rev_{user_id}_{index:02d}",
                user_id=user_id,
                drink_id=drink_id,
                rating=rating,
                text=text,
            )
        )
    return reviews


def _other_reviews(drinks_by_id: dict[str, Drink]) -> list[Review]:
    reviews: list[Review] = []
    drink_ids = sorted(drinks_by_id)
    for user_id, _name, _persona in OTHER_USERS:
        latent = {attr: random.random() for attr in ATTRIBUTES}
        count = random.randint(8, 12)
        chosen = sorted(random.sample(drink_ids, count))
        for index, drink_id in enumerate(chosen, start=1):
            drink = drinks_by_id[drink_id]
            score = match_score(latent, drink.attributes)
            rating = int(min(5, max(1, round(score * 5))))
            reviews.append(
                Review(
                    id=f"rev_{user_id}_{index:02d}",
                    user_id=user_id,
                    drink_id=drink_id,
                    rating=rating,
                    text=random.choice(_TEXTS[rating]),
                )
            )
    return reviews


def _assert_unique(
    shops: list[Shop], drinks: list[Drink], users: list[User], reviews: list[Review]
) -> None:
    for label, rows in (
        ("shop", shops),
        ("drink", drinks),
        ("user", users),
        ("review", reviews),
    ):
        ids = [row.id for row in rows]
        if len(ids) != len(set(ids)):
            raise RuntimeError(f"duplicate {label} id")
    if len(drinks) != 40:
        raise RuntimeError(f"expected 40 drinks, got {len(drinks)}")
    if len(users) != 15:
        raise RuntimeError(f"expected 15 users, got {len(users)}")


def _dump(path: Path, payload: list[dict]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
