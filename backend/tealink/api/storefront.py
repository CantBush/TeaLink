"""Auth, shop tools, orders, and custom what-ifs.

Private routes read the user from the session cookie. A missing route is
FastAPI's "Not Found"; a missing drink or shop uses a different detail so the
frontend does not treat it as a route that has not shipped.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from tealink.auth import store as accounts
from tealink.schemas import DeliberationRequest
from tealink.store import demand as demand_core
from tealink.store import menu as menu_core
from tealink.store import orders as orders_core
from tealink.store import rules as rules_core
from tealink.store import whatif as whatif_core

router = APIRouter()


class SignupBody(BaseModel):
    email: str
    password: str
    role: str
    shop_id: str | None = None
    user_id: str | None = None


class LoginBody(BaseModel):
    email: str
    password: str


class SectionsBody(BaseModel):
    sections: list[dict]


class DrinkBody(BaseModel):
    name: str
    price: float
    description: str | None = None
    photo_url: str | None = None
    flavor_tags: list[str] = Field(default_factory=list)
    attributes: dict[str, float]
    options: dict | None = None


class ShopPatch(BaseModel):
    description: str | None = None
    photo_url: str | None = None


class OrderBody(BaseModel):
    shop_id: str
    items: list[dict]
    offer_id: str | None = None
    pay: str = "pickup"


class OrderPatch(BaseModel):
    status: str | None = None
    rating: int | None = None


class WhatIfBody(BaseModel):
    user_id: str
    changes: list[dict]


class ParseBody(BaseModel):
    text: str


def _runtime():
    from tealink.api.main import get_runtime

    return get_runtime()


def _account(request: Request) -> dict:
    account = accounts.account_for_token(request.cookies.get(accounts.COOKIE))
    if account is None:
        raise HTTPException(status_code=401, detail="sign in required")
    return account


def _shop_account(request: Request, shop_id: str) -> dict:
    account = _account(request)
    runtime = _runtime()
    if runtime.catalog.shop(shop_id) is None:
        raise HTTPException(status_code=404, detail="shop not found")
    if account["role"] != "store" or account.get("shop_id") != shop_id:
        raise HTTPException(status_code=403, detail="that shop isn't yours")
    return account


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        accounts.COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )


@router.post("/auth/signup")
def signup(body: SignupBody, response: Response) -> dict:
    runtime = _runtime()
    email = body.email.strip().lower()
    if body.role not in ("customer", "store"):
        raise HTTPException(status_code=422, detail="role must be customer or store")
    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="password must be at least 6 characters")
    if body.role == "customer":
        if not body.user_id or body.user_id not in runtime.catalog.users_by_id:
            raise HTTPException(status_code=404, detail="user not found")
        user_id = body.user_id
        shop_id = None
    else:
        if not body.shop_id or runtime.catalog.shop(body.shop_id) is None:
            raise HTTPException(status_code=404, detail="shop not found")
        user_id = f"store_{body.shop_id}"
        shop_id = body.shop_id
    try:
        account = accounts.create_account(email, body.password, body.role, user_id, shop_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _set_cookie(response, accounts.open_session(account["email"]))
    return account


@router.post("/auth/login")
def login(body: LoginBody, response: Response) -> dict:
    account = accounts.authenticate(body.email, body.password)
    if account is None:
        raise HTTPException(status_code=401, detail="Wrong email or password.")
    _set_cookie(response, accounts.open_session(account["email"]))
    return account


@router.post("/auth/logout")
def logout(request: Request, response: Response) -> dict:
    accounts.close_session(request.cookies.get(accounts.COOKIE))
    response.delete_cookie(accounts.COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(request: Request) -> dict:
    return _account(request)


@router.get("/shops/{shop_id}/menu")
def get_menu(shop_id: str) -> dict:
    runtime = _runtime()
    if runtime.catalog.shop(shop_id) is None:
        raise HTTPException(status_code=404, detail="shop not found")
    return menu_core.menu_payload(runtime, shop_id)


@router.put("/shops/{shop_id}/menu/sections")
def put_sections(shop_id: str, body: SectionsBody, request: Request) -> dict:
    _shop_account(request, shop_id)
    try:
        sections = menu_core.save_sections(_runtime(), shop_id, body.sections)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"sections": sections}


@router.post("/shops/{shop_id}/drinks")
def post_drink(shop_id: str, body: DrinkBody, request: Request) -> dict:
    _shop_account(request, shop_id)
    try:
        return menu_core.add_drink(_runtime(), shop_id, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/shops/{shop_id}/drinks/{drink_id}")
def patch_drink(shop_id: str, drink_id: str, patch: dict, request: Request) -> dict:
    _shop_account(request, shop_id)
    try:
        return menu_core.update_drink(_runtime(), shop_id, drink_id, patch)
    except KeyError:
        raise HTTPException(status_code=404, detail="drink not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/shops/{shop_id}/drinks/{drink_id}", status_code=204)
def delete_drink(shop_id: str, drink_id: str, request: Request) -> None:
    _shop_account(request, shop_id)
    try:
        menu_core.remove_drink(_runtime(), shop_id, drink_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="drink not found") from None


@router.get("/shops/{shop_id}/offer-rules")
def get_rules(shop_id: str, request: Request) -> dict:
    _shop_account(request, shop_id)
    return rules_core.payload(_runtime(), shop_id)


@router.post("/shops/{shop_id}/offer-rules")
def post_rule(shop_id: str, body: dict, request: Request) -> dict:
    _shop_account(request, shop_id)
    try:
        return rules_core.add_rule(_runtime(), shop_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/shops/{shop_id}/offer-rules/{rule_id}")
def patch_rule(shop_id: str, rule_id: str, body: dict, request: Request) -> dict:
    _shop_account(request, shop_id)
    try:
        return rules_core.update_rule(_runtime(), shop_id, rule_id, body)
    except KeyError:
        raise HTTPException(status_code=404, detail="rule not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/shops/{shop_id}/offer-rules/{rule_id}", status_code=204)
def delete_rule(shop_id: str, rule_id: str, request: Request) -> None:
    _shop_account(request, shop_id)
    try:
        rules_core.remove_rule(_runtime(), shop_id, rule_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="rule not found") from None


@router.get("/shops/{shop_id}/demand")
def get_demand(shop_id: str, request: Request, range: str = "week") -> dict:
    _shop_account(request, shop_id)
    try:
        return demand_core.demand(_runtime(), shop_id, range)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/shops/{shop_id}")
def patch_shop(shop_id: str, body: ShopPatch, request: Request) -> dict:
    _shop_account(request, shop_id)
    return menu_core.set_shop_profile(_runtime(), shop_id, body.model_dump(exclude_unset=True))


@router.post("/orders")
def post_order(body: OrderBody, request: Request) -> dict:
    account = _account(request)
    try:
        order = orders_core.create_order(_runtime(), account, body.model_dump())
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except KeyError as exc:
        missing = str(exc).strip("'")
        detail = "shop not found" if missing == "shop" else "drink not found"
        raise HTTPException(status_code=404, detail=detail) from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return orders_core.receipt(order)


@router.get("/orders")
def get_orders(request: Request) -> list[dict]:
    return orders_core.list_orders(_runtime(), _account(request))


@router.patch("/orders/{order_id}")
async def patch_order(order_id: str, body: OrderPatch, request: Request) -> dict:
    account = _account(request)
    runtime = _runtime()
    before = next((item["status"] for item in runtime.orders if item["order_id"] == order_id), None)
    try:
        order = orders_core.update_order(runtime, account, order_id, body.model_dump(exclude_unset=True))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except KeyError:
        raise HTTPException(status_code=404, detail="order not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if before != "picked_up" and order["status"] == "picked_up":
        await _learn_pickup(runtime, order)
    return order


@router.post("/whatif")
async def post_whatif(body: WhatIfBody, request: Request) -> dict:
    account = _account(request)
    if body.user_id != account["user_id"]:
        raise HTTPException(status_code=403, detail="that session is for someone else")
    try:
        applied = await whatif_core.apply_changes(_runtime(), account["user_id"], body.changes)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="drink not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"ok": True, "applied": applied}


@router.post("/whatif/parse")
def post_parse(body: ParseBody) -> dict:
    return whatif_core.parse_text(_runtime(), body.text)


async def _learn_pickup(runtime, order: dict) -> None:
    """A picked-up order is a pick, when that drink was in the last top 3."""
    from tealink.api.main import _prepare
    from tealink.api.social import prior_weights

    choice = orders_core.choice_for_pickup(runtime, order)
    if choice is None:
        return
    await _prepare(runtime)
    card = runtime.registry.get("preference")
    if card is None:
        return
    reply = await runtime.transport.send(
        card,
        DeliberationRequest(
            round="learn",
            user_id=order["user_id"],
            query="",
            choice=choice,
            prior_weights=prior_weights(runtime, order["user_id"]),
        ),
    )
    if reply.preference is not None:
        runtime.social.add(order["user_id"], "pick", drink_id=choice.chosen_drink_id)
