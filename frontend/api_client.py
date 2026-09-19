"""Thin HTTP client for the Knowledge Bridge API (the UI never touches the database directly)."""

from __future__ import annotations

from typing import Any

import httpx


class APIError(RuntimeError):
    def __init__(self, status: int, detail: Any):
        if isinstance(detail, list):  # FastAPI validation errors
            detail = "; ".join(f"{'/'.join(map(str, e.get('loc', [])[1:]))}: {e.get('msg')}" for e in detail)
        super().__init__(str(detail))
        self.status = status
        self.detail = str(detail)


class KnowledgeBridgeAPI:
    def __init__(self, base_url: str, timeout: float = 240.0):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout)

    def _request(self, method: str, path: str, user: str | None = None, **kwargs: Any) -> httpx.Response:
        headers = {"X-User-Id": user} if user else {}
        try:
            response = self._client.request(method, path, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise APIError(0, f"Cannot reach the Knowledge Bridge API at {self.base_url} ({exc}).") from exc
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            raise APIError(response.status_code, detail)
        return response

    def _json(self, method: str, path: str, user: str | None = None, **kwargs: Any) -> Any:
        return self._request(method, path, user, **kwargs).json()

    # system & identity
    def health(self) -> dict:
        return self._json("GET", "/health")

    def users(self) -> list[dict]:
        return self._json("GET", "/users")

    def meta(self, user: str) -> dict:
        return self._json("GET", "/meta", user)

    # assistant
    def ask(self, user: str, question: str, asset_context: str | None, asset_filter: list[str] | None,
            cross_asset: bool) -> dict:
        payload = {"question": question, "asset_context": asset_context, "asset_filter": asset_filter,
                   "cross_asset": cross_asset}
        return self._json("POST", "/ask", user, json=payload)

    def feedback(self, user: str, answer_id: int, rating: int, comment: str | None = None) -> dict:
        return self._json("POST", "/feedback", user, json={"answer_id": answer_id, "rating": rating,
                                                            "comment": comment})

    # knowledge
    def documents(self, user: str) -> list[dict]:
        return self._json("GET", "/documents", user)

    def page(self, user: str, doc_id: str, page: int) -> dict:
        return self._json("GET", f"/documents/{doc_id}/pages/{page}", user)

    def file(self, user: str, doc_id: str) -> bytes:
        return self._request("GET", f"/documents/{doc_id}/file", user).content

    def upload(self, user: str, filename: str, data: bytes, form: dict[str, str]) -> dict:
        files = {"file": (filename, data, "application/pdf")}
        return self._json("POST", "/documents", user, data=form, files=files)

    def lesson(self, user: str, payload: dict) -> dict:
        return self._json("POST", "/lessons", user, json=payload)

    # governance
    def review_queue(self, user: str) -> list[dict]:
        return self._json("GET", "/review/queue", user)

    def review(self, user: str, doc_id: str, decision: str, note: str | None = None) -> dict:
        return self._json("POST", f"/review/{doc_id}", user, json={"decision": decision, "note": note})

    def audit(self, user: str, limit: int = 200, action: str | None = None) -> list[dict]:
        params = {"limit": limit, **({"action": action} if action else {})}
        return self._json("GET", "/audit", user, params=params)

    def audit_verify(self, user: str) -> dict:
        return self._json("GET", "/audit/verify", user)

    def governance(self, user: str) -> dict:
        return self._json("GET", "/governance/summary", user)

    # knowledge graph
    def graph(self, user: str, asset_types: list[str] | None, detailed: bool) -> dict:
        params: dict[str, Any] = {"detailed": detailed}
        if asset_types:
            params["asset_types"] = asset_types
        return self._json("GET", "/graph", user, params=params)

    def similar(self, user: str, doc_id: str, cross_asset_only: bool = True) -> dict:
        return self._json("GET", f"/graph/similar/{doc_id}", user, params={"cross_asset_only": cross_asset_only})

    def export_graph(self, user: str, fmt: str) -> str:
        return self._request("GET", "/graph/export", user, params={"format": fmt}).text

    # evaluation
    def eval_run(self, user: str, generation: bool = False) -> dict:
        return self._json("POST", "/eval/run", user, params={"generation": generation})

    def eval_latest(self, user: str) -> dict:
        return self._json("GET", "/eval/latest", user)
