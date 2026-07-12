from fastapi.testclient import TestClient

import app.main as main_module
import app.pipeline.jobs as jobs_module
from app.main import app


class _FakeQueue:
    def __init__(self):
        self.calls = []

    def enqueue(self, func_path, payload, **kw):
        self.calls.append((func_path, payload, kw))
        return None


def test_enqueue_returns_job_id_and_queues(monkeypatch):
    fake_queue = _FakeQueue()
    monkeypatch.setattr(jobs_module, "get_queue", lambda: fake_queue)

    client = TestClient(app)
    body = {
        "entity_type": "quote", "entity_id": "abc-1", "patch_type": "PVC",
        "artwork_url": "https://example.com/art.png",
        "params": {"width_mm": 80.0}, "callback_url": "https://crm.example.com/cb",
    }
    resp = client.post("/mockup/jobs", json=body)

    assert resp.status_code == 200
    out = resp.json()
    assert out["status"] == "queued"
    assert "job_id" in out

    assert len(fake_queue.calls) == 1
    func_path, payload, kw = fake_queue.calls[0]
    assert func_path == "app.pipeline.jobs.process_job"
    assert payload["job_id"] == out["job_id"]
    assert payload["entity_id"] == "abc-1"
    assert kw["job_id"] == out["job_id"]


def test_enqueue_requires_bearer_when_api_key_set(monkeypatch):
    monkeypatch.setattr(main_module, "API_KEY", "secretkey")
    monkeypatch.setattr(jobs_module, "get_queue", lambda: _FakeQueue())

    client = TestClient(app)
    body = {
        "entity_type": "quote", "entity_id": "abc-2", "patch_type": "PVC",
        "artwork_url": "https://example.com/art.png",
    }

    resp = client.post("/mockup/jobs", json=body)
    assert resp.status_code == 401

    resp2 = client.post("/mockup/jobs", json=body,
                        headers={"Authorization": "Bearer secretkey"})
    assert resp2.status_code == 200
