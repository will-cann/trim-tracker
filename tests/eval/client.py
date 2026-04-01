"""API client for ai-parse endpoint with mock/live/record modes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import httpx

from .config import AUTH_TOKEN, FIXTURES_DIR


class AiParseClient:
    """Wraps the ai-parse endpoint with mock/live/record modes."""

    def __init__(self, mode: str, endpoint: str):
        self.mode = mode
        self.endpoint = endpoint
        self._http = httpx.Client(timeout=30.0) if mode != "mock" else None

    def parse(
        self,
        transcript_chunks: list[str] | None = None,
        message: str | None = None,
        context: dict | None = None,
    ) -> dict:
        """Send a parse request and return {actions: [...], message: str}.

        In mock mode, loads from fixtures.
        In live mode, calls the endpoint.
        In record mode, calls the endpoint and saves the response.
        """
        payload = self._build_payload(transcript_chunks, message, context)
        fixture_key = self._fixture_key(payload)

        if self.mode == "mock":
            return self._load_fixture(fixture_key)

        response = self._call_api(payload)

        if self.mode == "record":
            self._save_fixture(fixture_key, payload, response)

        return response

    def close(self):
        if self._http:
            self._http.close()

    # --- Internal ---

    def _build_payload(
        self,
        transcript_chunks: list[str] | None,
        message: str | None,
        context: dict | None,
    ) -> dict:
        payload: dict = {}
        if transcript_chunks:
            payload["transcriptChunks"] = transcript_chunks
        if message:
            payload["message"] = message
        payload["context"] = context or {
            "hasActiveSession": False,
            "trimmerProfiles": [],
            "existingEntries": [],
        }
        return payload

    def _fixture_key(self, payload: dict) -> str:
        """Deterministic hash of the request for fixture keying."""
        canonical = json.dumps(payload, sort_keys=True, ensure_ascii=True)
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]

    def _call_api(self, payload: dict) -> dict:
        """Make the actual HTTP call."""
        assert self._http is not None, "HTTP client not initialized for mock mode"

        headers = {"Content-Type": "application/json"}
        if AUTH_TOKEN:
            headers["Authorization"] = f"Bearer {AUTH_TOKEN}"

        resp = self._http.post(self.endpoint, json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()

    def _load_fixture(self, key: str) -> dict:
        """Load a recorded fixture."""
        fixture_path = FIXTURES_DIR / f"{key}.json"
        if not fixture_path.exists():
            raise FileNotFoundError(
                f"No fixture found for key {key}. "
                f"Run with --eval-mode=record to capture fixtures first."
            )
        data = json.loads(fixture_path.read_text())
        return data["response"]

    def _save_fixture(self, key: str, payload: dict, response: dict) -> None:
        """Save a fixture for future mock runs."""
        FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
        fixture_path = FIXTURES_DIR / f"{key}.json"
        fixture_data = {
            "request": payload,
            "response": response,
        }
        fixture_path.write_text(json.dumps(fixture_data, indent=2, ensure_ascii=False))
