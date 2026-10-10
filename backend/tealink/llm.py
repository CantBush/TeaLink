"""Wording only. Numbers never come from this module."""

from __future__ import annotations

import os

from tealink.config import get_settings

_PROVIDER_KEYS = (
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "MISTRAL_API_KEY",
    "AZURE_API_KEY",
    "COHERE_API_KEY",
)


def _provider_key_present() -> bool:
    return any(os.environ.get(name, "").strip() for name in _PROVIDER_KEYS)


def complete(prompt: str, fallback: str | None = None) -> str:
    """Return model text, or a template string when no key is configured.

    Never raises because a provider key or package is missing.
    """
    settings = get_settings()
    if settings.llm_model and _provider_key_present():
        try:
            import litellm

            response = litellm.completion(
                model=settings.llm_model,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.choices[0].message.content
            if isinstance(text, str) and text.strip():
                return text.strip()
        except Exception:
            pass
    if fallback:
        return fallback
    first = prompt.strip().split("\n", 1)[0]
    return first
