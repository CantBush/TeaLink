"""Environment settings. python-dotenv is optional."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(_REPO_ROOT / ".env")
    load_dotenv()


@dataclass(frozen=True)
class Settings:
    transport: str
    nats_url: str
    llm_model: str
    data_dir: Path
    deliberation: str


def get_settings() -> Settings:
    load_env()
    data_dir = os.environ.get("DATA_DIR", "").strip()
    deliberation = os.environ.get("DELIBERATION", "single").strip().lower() or "single"
    if deliberation not in {"single", "dialogue"}:
        deliberation = "single"
    return Settings(
        transport=os.environ.get("TRANSPORT", "local").strip() or "local",
        nats_url=os.environ.get("NATS_URL", "nats://localhost:4222").strip()
        or "nats://localhost:4222",
        llm_model=os.environ.get("LLM_MODEL", "").strip(),
        data_dir=Path(data_dir) if data_dir else _BACKEND_DIR / "data",
        deliberation=deliberation,
    )
