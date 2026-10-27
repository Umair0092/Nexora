"""
LLM client settings, shared by every model call in this service.

Any OpenAI-compatible API works. Defaults point at Groq's free tier, so a
GROQ_API_KEY alone is enough; set LLM_BASE_URL / LLM_API_KEY / LLM_MODEL to
use another provider (e.g. OpenRouter, Google AI Studio, a local Ollama).
"""

import os

from langchain_openai import ChatOpenAI

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-120b"


def llm_api_key() -> str | None:
    return os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY")


def new_llm(max_tokens: int, temperature: float | None = None) -> ChatOpenAI:
    """Build a chat client. max_tokens includes the model's reasoning tokens on gpt-oss."""
    api_key = llm_api_key()
    if not api_key:
        raise RuntimeError("No LLM API key configured. Set GROQ_API_KEY (or LLM_API_KEY).")
    kwargs = {"temperature": temperature} if temperature is not None else {}
    # Free tiers limit tokens per minute (Groq: 8k/min for gpt-oss-120b). The OpenAI
    # client waits for the provider's Retry-After between attempts, so a burst, such
    # as both halves of a Full interview being scored at once, slows down instead of failing.
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", DEFAULT_MODEL),
        base_url=os.getenv("LLM_BASE_URL", DEFAULT_BASE_URL),
        api_key=api_key,
        max_tokens=max_tokens,
        max_retries=int(os.getenv("LLM_MAX_RETRIES", 6)),
        **kwargs,
    )
