"""Write a deterministic boba catalog to backend/data/*.json.

``random.seed(7)`` fixes the reviews for everyone except Andrew and Sarah,
whose reviews are written out so their personas stay stable.
"""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

from tealink.core import objectives
from tealink.core.preferences import PRIOR, combined_score
from tealink.core.taste import match_score
from tealink.data.loader import Catalog
from tealink.schemas import (
    ATTRIBUTES,
    STAT_KEYS,
    ChoiceRecord,
    Drink,
    FeedComment,
    RankedDrink,
    Review,
    Shop,
    User,
)
from tealink.social.store import ProfileSettings, StoredFeedItem, parse_time

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

SHOPS: list[tuple[str, str, str]] = [
    ("kungfu", "Kung Fu Tea Co.", "Inner Sunset"),
    ("sunright", "Sunright Tea Studio", "Mission"),
    ("tigersugar", "Tiger Sugar Lab", "SoMa"),
    ("boba_guys", "Boba Guys", "Hayes Valley"),
    ("sharetea", "Sharetea Lounge", "Richmond"),
]

# Shops with no teagent at startup. They join mid-session through /events/shop-join.
LATE_SHOPS: list[tuple[str, str, str]] = [
    ("lantern_leaf", "Lantern Leaf", "Outer Sunset"),
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

# Lantern Leaf's menu. Nobody has reviewed these yet, so the seeded reviews stay stable.
LATE_DRINKS: list[tuple] = [
    ("ll_brown_sugar_hojicha", "Brown Sugar Hojicha Milk", "lantern_leaf", 4.95, 0.82, 0.85, 0.55, 0.05, 0.75, ("brown_sugar", "hojicha")),
    ("ll_osmanthus_milk", "Osmanthus Milk Tea", "lantern_leaf", 5.25, 0.65, 0.75, 0.50, 0.15, 0.40, ("oolong",)),
    ("ll_yuzu_green", "Yuzu Green Tea", "lantern_leaf", 5.00, 0.50, 0.05, 0.45, 0.85, 0.10, ("fruit",)),
]

# Andrew's past picks: (chosen, passed over). He sticks with drinks he knows and
# usually takes the cheaper one.
ANDREW_CHOICES: list[tuple[str, tuple[str, ...]]] = [
    ("kf_classic_milk", ("ts_tiger_brown", "ts_brown_cream")),
    ("st_thai", ("sr_brown_sugar_black", "bg_ube")),
    ("kf_thai", ("ts_black_sugar_fresh", "sr_hojicha_cream")),
    ("bg_classic", ("ts_matcha_brown", "sr_hojicha_latte")),
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

# Same milky, low-fruit orders as Andrew, plus the hojicha cream he has not tried.
# That overlap is what makes her his closest match.
SARAH_REVIEWS: list[tuple[str, int, str]] = [
    ("sr_hojicha_cream", 5, "The hojicha cream tea is perfect."),
    ("kf_brown_sugar_oolong", 5, "Brown sugar and oolong, just how I like it."),
    ("ts_tiger_brown", 5, "Sweet, milky, and plenty of boba."),
    ("sr_brown_sugar_black", 5, "I would order this every week."),
    ("st_brown_sugar", 4, "Really sweet, in a good way."),
    ("kf_classic_milk", 4, "Solid milk tea, not too fruity."),
    ("bg_classic", 4, "House milk tea hits the spot."),
    ("kf_taro", 4, "Creamy taro with the right sugar."),
    ("st_thai", 4, "Milky Thai tea, good sugar level."),
    ("kf_mango_green", 2, "Too fruity, not enough milk."),
    ("st_qq", 1, "Way too much passion fruit for me."),
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

# Social seed. Every review becomes a feed item dated so that each user's
# weekly streak ends in the week of SEED_NOW.
SEED_NOW = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)

# user id -> (emoji, avatar color, accent color, bio)
PROFILES: dict[str, tuple[str, str, str, str]] = {
    "andrew": ("🧋", "#F4C27A", "#8B5E3C", "Brown sugar, extra pearls, as cheap as it gets."),
    "sarah": ("🍵", "#B8D8BA", "#3E7C59", "Hojicha evangelist. Ask me for a rec."),
    "maya": ("🍓", "#F7A6A6", "#B23A48", "Orders fruit tea when the weather is warm."),
    "jordan": ("🍃", "#A8D5BA", "#2D6A4F", "Splits time between matcha and milk tea."),
    "priya": ("🌸", "#F5C6E0", "#A23B72", "Jasmine and lighter sweetness, please."),
    "leo": ("🔥", "#E8B07A", "#9C4A1A", "Roasted tea, not much fruit."),
    "nora": ("🧸", "#E6D3B3", "#7F5539", "Classic milk tea and pearls. Never change."),
    "owen": ("🫖", "#C9D6A3", "#556B2F", "Unsweetened oolong or nothing."),
    "rina": ("🍡", "#F2B5D4", "#C9184A", "Matcha first, fruit second."),
    "chris": ("🍯", "#E3A857", "#8A5A00", "Brown sugar when it's on the menu."),
    "hana": ("🍂", "#D4A373", "#7A4419", "Hojicha and other roasted drinks."),
    "marco": ("🌶️", "#F28C6A", "#A33B20", "Thai tea and horchata fan."),
    "elena": ("💜", "#C3B1E1", "#5A3E85", "Taro and anything creamy."),
    "sam": ("🧭", "#9AD0EC", "#1D5C7A", "A new shop drink every week."),
    "yuki": ("❄️", "#BDE0FE", "#2B4C7E", "High tea intensity, low sugar."),
}
PINNED: dict[str, tuple[str, str]] = {
    "andrew": ("kf_brown_sugar_oolong", "kungfu"),
    "sarah": ("sr_hojicha_cream", "sunright"),
}
# Andrew's and Sarah's circles are written out so the demo feed is stable.
FOLLOWS: dict[str, tuple[str, ...]] = {
    "andrew": ("sarah", "hana", "nora", "chris", "marco"),
    "sarah": ("andrew", "hana", "priya"),
    "hana": ("andrew", "sarah", "leo"),
    "nora": ("andrew", "elena"),
    "chris": ("andrew", "sarah"),
}
STREAKS: dict[str, int] = {"andrew": 6, "sarah": 9}
# Other viewers don't see priorities unless the user opts in.
PUBLIC_STATS: list[str] = [
    "fav_drink", "fav_shop", "top_notes", "tried_count", "sweetness",
    "milk_vs_fruit", "toppings", "shops_visited", "streak",
]
COMMENTS: list[tuple[str, str, str]] = [
    ("f_rev_sarah_01", "andrew", "Okay, adding it to my list."),
    ("f_rev_andrew_01", "sarah", "Same order, every time."),
    ("f_rev_andrew_01", "chris", "Brown sugar gang."),
]
SARAH_REC = ("sr_hojicha_cream", "You'd love the hojicha cream tea. Trust me on this one.")

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
    ] + [
        Shop(id=shop_id, name=name, neighborhood=neighborhood, online=False)
        for shop_id, name, neighborhood in LATE_SHOPS
    ]
    drinks = [_drink_from_row(row) for row in RAW_DRINKS + LATE_DRINKS]
    late_ids = {row[0] for row in LATE_DRINKS}
    drinks_by_id = {drink.id: drink for drink in drinks if drink.id not in late_ids}
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
    choices = build_choices(Catalog(shops=shops, drinks=drinks, users=users, reviews=reviews))
    _dump(target / "choices.json", [choice.model_dump(mode="json") for choice in choices])
    social = build_social(users, reviews, choices)
    (target / "social.json").write_text(json.dumps(social, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def build_social(users: list[User], reviews: list[Review], choices: list[ChoiceRecord]) -> dict:
    """Profiles, follows, and a feed built from the seeded reviews and Andrew's past picks."""
    rng = random.Random(11)
    ids = [user.id for user in users]
    profiles = []
    for user in users:
        emoji, color, accent, bio = PROFILES[user.id]
        drink_id, shop_id = PINNED.get(user.id, (None, None))
        visible = list(STAT_KEYS) if user.id == "andrew" else list(PUBLIC_STATS)
        profiles.append(
            ProfileSettings(
                user_id=user.id,
                handle=user.id,
                display_name=user.name,
                bio=bio,
                avatar={"emoji": emoji, "color": color},
                accent=accent,
                pinned_drink_id=drink_id,
                pinned_shop_id=shop_id,
                visible_stats=visible,
            ).model_dump(mode="json", exclude={"card_color"})
        )

    follows: set[tuple[str, str]] = set()
    for user_id in ids:
        targets = FOLLOWS.get(user_id)
        if targets is None:
            others = [other for other in ids if other != user_id]
            targets = tuple(sorted(rng.sample(others, rng.randint(2, 4))))
        follows.update((user_id, target) for target in targets)

    by_user: dict[str, list[Review]] = {}
    for review in reviews:
        by_user.setdefault(review.user_id, []).append(review)
    feed: dict[str, StoredFeedItem] = {}
    for user_id in ids:
        streak = STREAKS.get(user_id, rng.randint(0, 5))
        mine = by_user.get(user_id, [])
        oldest = SEED_NOW
        for back, review in enumerate(reversed(mine)):
            moment = _seed_moment(_week_offset(back, streak), rng)
            oldest = min(oldest, moment)
            item_id = f"f_{review.id}"
            feed[item_id] = StoredFeedItem(
                id=item_id,
                user_id=user_id,
                kind="review",
                drink_id=review.drink_id,
                rating=review.rating,
                text=review.text,
                created_at=_iso(moment),
            )
        joined = f"f_joined_{user_id}"
        feed[joined] = StoredFeedItem(id=joined, user_id=user_id, kind="joined", created_at=_iso(oldest - timedelta(days=1)))

    for index, choice in enumerate(choices, start=1):
        item_id = f"f_pick_{choice.user_id}_{index:02d}"
        moment = _seed_moment(len(choices) - index + 1, rng)
        feed[item_id] = StoredFeedItem(
            id=item_id,
            user_id=choice.user_id,
            kind="pick",
            drink_id=choice.chosen_drink_id,
            created_at=_iso(moment),
        )

    drink_id, text = SARAH_REC
    feed["f_rec_sarah_andrew"] = StoredFeedItem(
        id="f_rec_sarah_andrew",
        user_id="sarah",
        kind="rec",
        drink_id=drink_id,
        text=text,
        to_user_id="andrew",
        created_at=_iso(SEED_NOW - timedelta(hours=20)),
    )

    followers: dict[str, list[str]] = {}
    for follower, followee in sorted(follows):
        followers.setdefault(followee, []).append(follower)
    for item in feed.values():
        if item.kind == "review" and (item.rating or 0) >= 4:
            fans = followers.get(item.user_id, [])
            item.liked_by = sorted(rng.sample(fans, rng.randint(0, len(fans)))) if fans else []
    for index, (item_id, user_id, text) in enumerate(COMMENTS, start=1):
        item = feed[item_id]
        moment = min(parse_time(item.created_at) + timedelta(hours=index), SEED_NOW)
        item.comments.append(FeedComment(id=f"c_seed_{index:02d}", user_id=user_id, text=text, created_at=_iso(moment)))
        if user_id not in item.liked_by:
            item.liked_by = sorted([*item.liked_by, user_id])

    ordered = sorted(feed.values(), key=lambda item: (item.created_at, item.id), reverse=True)
    return {
        "profiles": profiles,
        "follows": [list(pair) for pair in sorted(follows)],
        "feed": [item.model_dump(mode="json") for item in ordered],
    }


def _week_offset(back: int, streak: int) -> int:
    """Weeks before SEED_NOW for the user's back-th newest review.

    The newest ``streak`` reviews fill consecutive weeks ending this week,
    then one empty week, then one review per week. A streak of 0 leaves this
    week and last week empty.
    """
    if streak == 0:
        return 2 + back
    return back if back < streak else streak + 1 + (back - streak)


def _seed_moment(weeks_back: int, rng: random.Random) -> datetime:
    """A time in the week ``weeks_back`` before SEED_NOW (a Saturday), never after it."""
    return SEED_NOW - timedelta(weeks=weeks_back, hours=rng.randint(0, 96), minutes=rng.randint(0, 59))


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_choices(catalog: Catalog) -> list[ChoiceRecord]:
    """Andrew's past picks, scored with today's objective functions."""
    near = objectives.neighbors(catalog, "andrew")
    records: list[ChoiceRecord] = []
    for chosen, passed in ANDREW_CHOICES:
        options = []
        for drink_id in (chosen, *passed):
            drink = catalog.drinks_by_id[drink_id]
            taste, _factors = objectives.taste(catalog, "andrew", drink, None)
            scores = {
                "taste": taste,
                "social": objectives.social(catalog, drink, near)[0],
                "novelty": objectives.novelty(catalog, "andrew", drink)[0],
                "cost": objectives.cost(catalog, drink)[0],
            }
            options.append(
                RankedDrink(
                    drink_id=drink.id,
                    drink_name=drink.name,
                    score=combined_score(PRIOR, scores),
                    shop_id=drink.shop_id,
                    price=drink.price,
                    dimension_scores=scores,
                )
            )
        records.append(
            ChoiceRecord(user_id="andrew", chosen_drink_id=chosen, options=options, source="history")
        )
    return records


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
    if len(drinks) != len(RAW_DRINKS) + len(LATE_DRINKS):
        raise RuntimeError(f"unexpected drink count {len(drinks)}")
    if len(users) != 15:
        raise RuntimeError(f"expected 15 users, got {len(users)}")


def _dump(path: Path, payload: list[dict]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
