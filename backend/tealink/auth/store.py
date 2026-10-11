"""SQLite accounts and httpOnly sessions.

Passwords are hashed with PBKDF2 and never logged. The demo accounts are
inserted once; a later reset of menus and orders leaves them in place.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import threading
from pathlib import Path

from tealink.config import get_settings

COOKIE = "tealink_session"
DEMO_PASSWORD = "boba"
DEMO_ACCOUNTS = (
    {"email": "andrew@tealink.demo", "user_id": "andrew", "role": "customer", "shop_id": None},
    {"email": "sunright@tealink.demo", "user_id": "store_sunright", "role": "store", "shop_id": "sunright"},
)

_LOCK = threading.Lock()


def db_path() -> Path:
    return get_settings().data_dir / "accounts.sqlite"


def _connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def ensure() -> None:
    """Create the tables and the two demo accounts, if they are not there yet."""
    with _LOCK:
        conn = _connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS accounts (
                    email TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    shop_id TEXT,
                    salt TEXT NOT NULL,
                    password_hash TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    email TEXT NOT NULL
                );
                """
            )
            for account in DEMO_ACCOUNTS:
                if conn.execute("SELECT 1 FROM accounts WHERE email = ?", (account["email"],)).fetchone():
                    continue
                salt, digest = _hash_password(DEMO_PASSWORD)
                conn.execute(
                    "INSERT INTO accounts (email, user_id, role, shop_id, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
                    (account["email"], account["user_id"], account["role"], account["shop_id"], salt, digest),
                )
            conn.commit()
        finally:
            conn.close()


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return salt, digest


def _public(row: sqlite3.Row) -> dict:
    return {
        "email": row["email"],
        "user_id": row["user_id"],
        "role": row["role"],
        "shop_id": row["shop_id"],
    }


def create_account(email: str, password: str, role: str, user_id: str, shop_id: str | None) -> dict:
    ensure()
    email = email.strip().lower()
    salt, digest = _hash_password(password)
    with _LOCK:
        conn = _connect()
        try:
            if conn.execute("SELECT 1 FROM accounts WHERE email = ?", (email,)).fetchone():
                raise ValueError("That email already has an account. Sign in instead.")
            conn.execute(
                "INSERT INTO accounts (email, user_id, role, shop_id, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
                (email, user_id, role, shop_id, salt, digest),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()
            return _public(row)
        finally:
            conn.close()


def authenticate(email: str, password: str) -> dict | None:
    ensure()
    email = email.strip().lower()
    with _LOCK:
        conn = _connect()
        try:
            row = conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()
        finally:
            conn.close()
    if row is None:
        return None
    _, digest = _hash_password(password, row["salt"])
    if not hmac.compare_digest(digest, row["password_hash"]):
        return None
    return _public(row)


def open_session(email: str) -> str:
    ensure()
    token = secrets.token_urlsafe(32)
    with _LOCK:
        conn = _connect()
        try:
            conn.execute("INSERT INTO sessions (token, email) VALUES (?, ?)", (token, email.strip().lower()))
            conn.commit()
        finally:
            conn.close()
    return token


def close_session(token: str | None) -> None:
    if not token:
        return
    ensure()
    with _LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
        finally:
            conn.close()


def account_for_token(token: str | None) -> dict | None:
    if not token:
        return None
    ensure()
    with _LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                """
                SELECT accounts.* FROM sessions
                JOIN accounts ON accounts.email = sessions.email
                WHERE sessions.token = ?
                """,
                (token,),
            ).fetchone()
        finally:
            conn.close()
    return _public(row) if row else None
