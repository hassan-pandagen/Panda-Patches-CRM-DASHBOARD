"""RQ job: fetch artwork, run the mockup pipeline, POST the result to the
CRM's callback URL. This is what app/worker.py executes for every job
enqueued by POST /mockup/jobs — the single-worker queue is the answer to
"two quotes at once" (CLAUDE.md architecture, §3): jobs run one at a time
instead of racing for CPU.

Auth model (CLAUDE.md §2 rule 3): this service never holds a Supabase key.
It authenticates itself to the callback with DIGITIZE_CALLBACK_SECRET only.
"""
from __future__ import annotations

import base64
import os

import redis as redis_lib
import requests
from rq import Queue

from . import ingest
from .mockup import generate

QUEUE_NAME = "mockup"
JOB_TIMEOUT_S = 300


def get_redis() -> "redis_lib.Redis":
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    return redis_lib.from_url(url)


def get_queue() -> Queue:
    return Queue(QUEUE_NAME, connection=get_redis())


def _post_callback(callback_url: str | None, body: dict) -> None:
    if not callback_url:
        return
    secret = os.getenv("DIGITIZE_CALLBACK_SECRET")
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    requests.post(callback_url, json=body, headers=headers, timeout=30)


def process_job(payload: dict) -> dict:
    """payload matches the CRM->VPS contract (CLAUDE.md §10c) plus a
    server-assigned job_id. Always POSTs to callback_url — success or
    failure — then returns (success) or re-raises (failure, so RQ's failed
    registry also has it)."""
    entity_type = payload.get("entity_type")
    entity_id = payload.get("entity_id")
    job_id = payload.get("job_id")
    callback_url = payload.get("callback_url")

    try:
        resp = requests.get(payload["artwork_url"], timeout=30)
        resp.raise_for_status()
        artwork = ingest.to_raster_png(resp.content)

        params = payload.get("params") or {}
        result = generate(
            artwork,
            patch_type=payload.get("patch_type", "embroidery"),
            width_mm=float(params.get("width_mm", 80.0)),
            border_mm=float(params.get("border_mm", 3.0)),
            base_hex=params.get("base_hex", "#232830"),
            border_hex=params.get("border_hex") or None,
        )
    except Exception as e:
        _post_callback(callback_url, {
            "entity_type": entity_type, "entity_id": entity_id,
            "job_id": job_id, "status": "failed", "error": str(e),
        })
        raise

    body = {
        "entity_type": entity_type, "entity_id": entity_id, "job_id": job_id,
        "status": "ready",
        "mockup_style": result["mockup_style"],
        "production_file": result["production_file"],
        "render_source": result["render_source"],
        "files": {
            "png_base64": base64.b64encode(result["png"]).decode(),
            "svg": result["svg"],
        },
        "colors": result["colors"],
        "warnings": result["warnings"],
        "size_mm": result["size_mm"],
    }
    _post_callback(callback_url, body)
    return body
