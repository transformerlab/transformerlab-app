from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import requests


def _run_async(coro):
    """
    Helper to run async code from sync context.
    Mirrors lab_facade._run_async behavior.
    """
    try:
        asyncio.get_running_loop()
        running = True
    except RuntimeError:
        running = False

    if not running:
        return asyncio.run(coro)

    loop = asyncio.get_event_loop()
    if loop.is_closed():
        return asyncio.run(coro)
    return loop.run_until_complete(coro)


@dataclass
class GenerationModel:
    """
    Simple, library-agnostic text generation interface.
    Implementations should provide:
      - generate(prompt, system_prompt=None) -> str
      - a_generate(prompt, system_prompt=None) -> str (async)
    """

    def generate(self, prompt: str, system_prompt: Optional[str] = None) -> str:  # pragma: no cover - interface
        raise NotImplementedError

    async def a_generate(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        # Default async implementation delegates to sync in a thread
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.generate, prompt, system_prompt)


class LocalHTTPGenerationModel(GenerationModel):
    """
    Generation model that talks to a local HTTP server with an OpenAI-compatible
    /v1/chat/completions endpoint (e.g., vLLM, sglang, or TransformerLab inference server).
    """

    def __init__(self, base_url: str, model: str, api_key: str = "dummy") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key or "dummy"

    def generate(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        url = f"{self.base_url}/chat/completions"
        messages: list[Dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }

        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=60)
        resp.raise_for_status()
        data = resp.json()
        try:
            return data["choices"][0]["message"]["content"]
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"Unexpected response from local generation server: {data}") from exc


def load_generation_model(config: Optional[Dict[str, Any] | str] = None) -> GenerationModel:
    """
    Load a simple generation model wrapper based on a configuration object.
    This function is intentionally library-agnostic (no deepeval, no LangChain).
    Current support:
      - provider=\"local\": talks to a local HTTP server exposing an OpenAI-style
        /v1/chat/completions endpoint (e.g., TransformerLab inference server).
    Args:
        config: Either:
            - dict with at least a \"provider\" field (e.g. {\"provider\": \"local\", \"model\": \"MyModel\"})
            - JSON string representing such a dict
            - simple string provider name (e.g. \"local\")
    Returns:
        GenerationModel implementation.
    """
    # Normalize config to dict
    if config is None:
        config_dict: Dict[str, Any] = {"provider": "local"}
    elif isinstance(config, str):
        # Try to parse as JSON first; if that fails, treat as provider name
        try:
            config_dict = json.loads(config)
            if not isinstance(config_dict, dict):
                config_dict = {"provider": str(config)}
        except json.JSONDecodeError:
            config_dict = {"provider": config}
    elif isinstance(config, dict):
        config_dict = dict(config)
    else:
        raise TypeError("config must be a dict, JSON string, provider string, or None")

    provider = str(config_dict.get("provider", "local")).lower()

    if provider == "local":
        # Base URL and model name can be provided in config, otherwise fallback to env vars
        base_url = config_dict.get("base_url") or os.environ.get("TFL_LOCAL_MODEL_BASE_URL", "http://localhost:8338/v1")
        model_name = config_dict.get("model") or os.environ.get("TFL_LOCAL_MODEL_NAME", "default")
        api_key = os.environ.get("TFL_LOCAL_MODEL_API_KEY", "dummy")
        return LocalHTTPGenerationModel(base_url=base_url, model=model_name, api_key=api_key)

    raise NotImplementedError(
        f"Provider '{provider}' is not yet supported by load_generation_model. "
        "For now, only provider='local' is implemented."
    )
