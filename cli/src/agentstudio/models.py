from __future__ import annotations

import json
import os
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse


@dataclass(frozen=True)
class ModelResponse:
    provider: str
    model: str
    text: str
    raw: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {"provider": self.provider, "model": self.model, "text": self.text, "raw": self.raw}


class ModelGateway:
    def complete(self, provider: str, model: str, prompt: str, dry_run: bool = False) -> ModelResponse:
        if dry_run:
            return ModelResponse(provider, model, f"[dry-run:{provider}/{model}] {prompt[:80]}", {"dry_run": True})
        if provider == "openai":
            return self._openai(model, prompt)
        if provider == "anthropic":
            return self._anthropic(model, prompt)
        if provider == "google":
            return self._google(model, prompt)
        if provider == "ollama":
            return self._ollama(model, prompt)
        raise ValueError(f"unsupported model provider: {provider}")

    def stream_complete(self, provider: str, model: str, prompt: str, dry_run: bool = False) -> Iterator[dict[str, Any]]:
        if dry_run:
            for index, token in enumerate(f"[dry-run:{provider}/{model}] {prompt[:80]}".split()):
                yield {"type": "delta", "index": index, "text": token + " "}
            yield {"type": "done", "provider": provider, "model": model}
            return
        if provider == "ollama":
            yield from self._ollama_stream(model, prompt)
            return
        response = self.complete(provider, model, prompt, dry_run=False)
        yield {"type": "delta", "index": 0, "text": response.text}
        yield {"type": "done", "provider": response.provider, "model": response.model, "raw": response.raw}

    def _openai(self, model: str, prompt: str) -> ModelResponse:
        key = _require_env("OPENAI_API_KEY")
        payload = {"model": model, "messages": [{"role": "user", "content": prompt}]}
        raw = _post_json("https://api.openai.com/v1/chat/completions", payload, {"Authorization": f"Bearer {key}"})
        text = raw.get("choices", [{}])[0].get("message", {}).get("content", "")
        return ModelResponse("openai", model, text, raw)

    def _anthropic(self, model: str, prompt: str) -> ModelResponse:
        key = _require_env("ANTHROPIC_API_KEY")
        payload = {"model": model, "max_tokens": 1024, "messages": [{"role": "user", "content": prompt}]}
        raw = _post_json("https://api.anthropic.com/v1/messages", payload, {"x-api-key": key, "anthropic-version": "2023-06-01"})
        text = "".join(block.get("text", "") for block in raw.get("content", []) if isinstance(block, dict))
        return ModelResponse("anthropic", model, text, raw)

    def _google(self, model: str, prompt: str) -> ModelResponse:
        key = _require_env("GEMINI_API_KEY")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        raw = _post_json(url, {"contents": [{"parts": [{"text": prompt}]}]}, {})
        text = raw.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return ModelResponse("google", model, text, raw)

    def _ollama(self, model: str, prompt: str) -> ModelResponse:
        url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
        raw = _post_json(url, {"model": model, "prompt": prompt, "stream": False}, {})
        return ModelResponse("ollama", model, raw.get("response", ""), raw)

    def _ollama_stream(self, model: str, prompt: str) -> Iterator[dict[str, Any]]:
        url = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
        _require_url_scheme(url, {"http", "https"})
        request = urllib.request.Request(
            url,
            data=json.dumps({"model": model, "prompt": prompt, "stream": True}).encode("utf-8"),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=60) as response:  # nosec B310
            for index, line in enumerate(response):
                if not line.strip():
                    continue
                payload = json.loads(line.decode("utf-8"))
                if payload.get("done"):
                    yield {"type": "done", "provider": "ollama", "model": model, "raw": payload}
                    return
                yield {"type": "delta", "index": index, "text": payload.get("response", ""), "raw": payload}
        yield {"type": "done", "provider": "ollama", "model": model}


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required for this provider")
    return value


def _post_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
    _require_url_scheme(url, {"http", "https"})
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"content-type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:  # nosec B310
        return json.loads(response.read().decode("utf-8"))


def _require_url_scheme(url: str, allowed: set[str]) -> None:
    scheme = urlparse(url).scheme
    if scheme not in allowed:
        raise ValueError(f"unsupported URL scheme: {scheme}")
