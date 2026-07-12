import pytest

from app.pipeline import jobs


class _FakeResp:
    def __init__(self, content, status=200):
        self.content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"status {self.status_code}")


def test_process_job_success_posts_ready_callback(monkeypatch, sample_artwork_png):
    calls = []

    monkeypatch.setattr(jobs.requests, "get", lambda url, timeout=None: _FakeResp(sample_artwork_png))
    monkeypatch.setattr(jobs.requests, "post",
                        lambda url, json=None, headers=None, timeout=None:
                        calls.append((url, json, headers)) or _FakeResp(b""))
    monkeypatch.setenv("DIGITIZE_CALLBACK_SECRET", "secret123")

    payload = {
        "entity_type": "quote", "entity_id": "abc-123", "job_id": "job-1",
        "patch_type": "Embroidered", "artwork_url": "https://example.com/art.png",
        "params": {"width_mm": 80.0}, "callback_url": "https://crm.example.com/cb",
    }
    result = jobs.process_job(payload)

    assert result["status"] == "ready"
    assert result["job_id"] == "job-1"
    assert result["entity_id"] == "abc-123"
    assert result["files"]["svg"] is None            # embroidery has no vector output
    assert "png_base64" in result["files"]

    assert len(calls) == 1
    url, body, headers = calls[0]
    assert url == "https://crm.example.com/cb"
    assert body["status"] == "ready"
    assert headers["Authorization"] == "Bearer secret123"


def test_process_job_failure_posts_failed_callback_and_reraises(monkeypatch):
    calls = []

    def fake_get(url, timeout=None):
        raise RuntimeError("network down")

    monkeypatch.setattr(jobs.requests, "get", fake_get)
    monkeypatch.setattr(jobs.requests, "post",
                        lambda url, json=None, headers=None, timeout=None:
                        calls.append((url, json, headers)) or _FakeResp(b""))

    payload = {
        "entity_type": "quote", "entity_id": "abc-123", "job_id": "job-2",
        "patch_type": "Embroidered", "artwork_url": "https://example.com/bad.png",
        "callback_url": "https://crm.example.com/cb",
    }
    with pytest.raises(RuntimeError):
        jobs.process_job(payload)

    assert len(calls) == 1
    _, body, _ = calls[0]
    assert body["status"] == "failed"
    assert body["job_id"] == "job-2"
    assert "network down" in body["error"]


def test_process_job_skips_callback_when_none_given(monkeypatch, sample_artwork_png):
    calls = []
    monkeypatch.setattr(jobs.requests, "get", lambda url, timeout=None: _FakeResp(sample_artwork_png))
    monkeypatch.setattr(jobs.requests, "post",
                        lambda *a, **kw: calls.append((a, kw)) or _FakeResp(b""))

    payload = {
        "entity_type": "quote", "entity_id": "abc-9", "job_id": "job-9",
        "patch_type": "Embroidered", "artwork_url": "https://example.com/art.png",
    }
    result = jobs.process_job(payload)

    assert result["status"] == "ready"
    assert calls == []                                # no callback_url -> no POST
