"""LLM access through the OpenAI-compatible protocol.

Works unchanged with Tencent TokenHub (Hunyuan `hy3`, `hy4-preview`), the
Hunyuan direct endpoint, OpenAI, or a local Ollama server - only the base URL,
key and model name change. When no LLM is configured the assistant switches
to its offline extractive composer, so a demo never depends on the network.
"""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any

from backend.config import Settings

log = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """The model could not be reached or did not return usable JSON."""


def parse_json_object(text: str) -> dict[str, Any] | None:
    """Extract the first JSON object from a model reply (tolerates think-tags and code fences)."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    candidate = text[start : end + 1]
    for attempt in (candidate, re.sub(r",\s*([}\]])", r"\1", candidate)):  # 2nd try: drop trailing commas
        try:
            parsed = json.loads(attempt)
        except json.JSONDecodeError:
            continue
        return parsed if isinstance(parsed, dict) else None
    return None


class LLMClient(ABC):
    name: str = "none"
    model: str = ""

    @property
    @abstractmethod
    def enabled(self) -> bool: ...

    @abstractmethod
    def generate_json(self, system: str, user: str) -> dict[str, Any]: ...

    def describe(self) -> dict[str, Any]:
        return {"provider": self.name, "model": self.model, "enabled": self.enabled}


class DisabledLLM(LLMClient):
    name = "extractive"
    model = "offline-extractive-composer"

    @property
    def enabled(self) -> bool:
        return False

    def generate_json(self, system: str, user: str) -> dict[str, Any]:
        raise LLMError("No LLM configured")


class OpenAICompatibleLLM(LLMClient):
    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str | None, model: str, temperature: float,
                 max_tokens: int, timeout: float, json_mode: bool):
        import openai

        self._openai = openai
        self._client = openai.OpenAI(base_url=base_url, api_key=api_key or "not-needed",
                                     timeout=timeout, max_retries=1)
        self.base_url = base_url
        self.model = model
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._json_mode = json_mode

    @property
    def enabled(self) -> bool:
        return True

    def _complete(self, messages: list[dict[str, str]]) -> str:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
        }
        if self._json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            response = self._client.chat.completions.create(**kwargs)
        except self._openai.BadRequestError as exc:
            if not self._json_mode:
                raise LLMError(f"LLM rejected the request: {exc}") from exc
            # Some endpoints do not support response_format; retry once without it and remember.
            log.info("Endpoint rejected JSON mode (%s); continuing without response_format.", exc)
            self._json_mode = False
            return self._complete(messages)
        except self._openai.OpenAIError as exc:
            raise LLMError(f"LLM call failed: {exc}") from exc
        if not response.choices:
            raise LLMError("LLM returned no choices")
        return response.choices[0].message.content or ""

    def generate_json(self, system: str, user: str) -> dict[str, Any]:
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        reply = self._complete(messages)
        parsed = parse_json_object(reply)
        if parsed is None:  # one repair attempt
            messages += [
                {"role": "assistant", "content": reply},
                {"role": "user", "content": "Your reply was not valid JSON. Return only the JSON object."},
            ]
            parsed = parse_json_object(self._complete(messages))
        if parsed is None:
            raise LLMError("LLM did not return valid JSON")
        return parsed


def build_llm(settings: Settings) -> LLMClient:
    provider = settings.llm_provider
    if provider == "extractive" or (provider == "auto" and not settings.llm_api_key):
        return DisabledLLM()
    return OpenAICompatibleLLM(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        timeout=settings.llm_timeout_s,
        json_mode=settings.llm_json_mode,
    )
