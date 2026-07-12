"""Patch Mockup Service (mockup-only).

The deliverable is a realistic mockup for SALES — constrained to producible
detail so it never over-promises like an AI image generator — plus a clean
vector where the process needs one. It does NOT make machine files; the
digitizer does the real production work after the sale is secured.

POST /mockup       multipart file + patch_type + params  ->  JSON   (internal bench, synchronous)
                   { png_base64, svg, mockup_style, production_file, category,
                     colors[], warnings[], size_mm }
POST /mockup.png   same params  ->  raw PNG (headers: X-Mockup-Style, X-Warnings-Count)
POST /mockup/jobs  CRM contract (CLAUDE.md §10c), JSON body  ->  { job_id, status:"queued" }
                   queues the job on RQ; the worker POSTs the result to
                   payload.callback_url when done (success or failure).
GET  /mockup/jobs/{job_id}  poll a queued job's status (debugging aid — the
                   real notification path is the worker's callback POST)
GET  /            internal test bench
GET  /health      liveness
"""
import base64
import os
import uuid

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel, Field

from .pipeline import ingest
from .pipeline.mockup import generate

app = FastAPI(title="Patch Mockup Service", version="1.0.0")

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",")]
app.add_middleware(CORSMiddleware, allow_origins=origins,
                   allow_methods=["*"], allow_headers=["*"])

MAX_UPLOAD = int(os.getenv("MAX_UPLOAD_BYTES", 15 * 1024 * 1024))
API_KEY = os.getenv("DIGITIZE_API_KEY")            # optional bearer auth (CRM -> service)


def _check_auth(auth: str | None):
    if API_KEY and auth != f"Bearer {API_KEY}":
        raise HTTPException(401, "unauthorized")


async def _run(file, patch_type, width_mm, border_mm, base_hex, border_hex):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "file too large")
    try:
        data = ingest.to_raster_png(data)
        return generate(data, patch_type=patch_type, width_mm=float(width_mm),
                        border_mm=float(border_mm), base_hex=base_hex,
                        border_hex=border_hex or None)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/mockup")
async def mockup_json(file: UploadFile = File(...),
                      patch_type: str = Form("embroidery"),
                      width_mm: float = Form(80.0),
                      border_mm: float = Form(3.0),
                      base_hex: str = Form("#232830"),
                      border_hex: str = Form(""),
                      authorization: str = Header(None)):
    _check_auth(authorization)
    res = await _run(file, patch_type, width_mm, border_mm, base_hex, border_hex)
    res["png_base64"] = base64.b64encode(res.pop("png")).decode()
    return JSONResponse(res)


@app.post("/mockup.png")
async def mockup_png(file: UploadFile = File(...),
                     patch_type: str = Form("embroidery"),
                     width_mm: float = Form(80.0),
                     border_mm: float = Form(3.0),
                     base_hex: str = Form("#232830"),
                     border_hex: str = Form(""),
                     authorization: str = Header(None)):
    _check_auth(authorization)
    res = await _run(file, patch_type, width_mm, border_mm, base_hex, border_hex)
    return Response(res["png"], media_type="image/png", headers={
        "X-Mockup-Style": res["mockup_style"],
        "X-Warnings-Count": str(len(res["warnings"])),
    })


class MockupParams(BaseModel):
    width_mm: float = 80.0
    border_mm: float = 3.0
    base_hex: str = "#232830"
    border_hex: str | None = None


class MockupJobRequest(BaseModel):
    entity_type: str
    entity_id: str
    patch_type: str
    artwork_url: str
    params: MockupParams = Field(default_factory=MockupParams)
    callback_url: str | None = None


@app.post("/mockup/jobs")
def mockup_enqueue(req: MockupJobRequest, authorization: str = Header(None)):
    _check_auth(authorization)
    from .pipeline.jobs import JOB_TIMEOUT_S, get_queue

    job_id = str(uuid.uuid4())
    payload = req.model_dump()
    payload["job_id"] = job_id
    get_queue().enqueue("app.pipeline.jobs.process_job", payload, job_id=job_id,
                        job_timeout=JOB_TIMEOUT_S, result_ttl=3600, failure_ttl=86400)
    return {"job_id": job_id, "status": "queued"}


@app.get("/mockup/jobs/{job_id}")
def mockup_job_status(job_id: str, authorization: str = Header(None)):
    _check_auth(authorization)
    from rq.job import Job

    from .pipeline.jobs import get_redis

    try:
        job = Job.fetch(job_id, connection=get_redis())
    except Exception:
        raise HTTPException(404, "job not found")
    status = job.get_status(refresh=True)
    out = {"job_id": job_id, "status": status}
    if status == "failed" and job.exc_info:
        out["error"] = str(job.exc_info)[-500:]
    return out


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/")
def demo():
    return FileResponse(os.path.join(os.path.dirname(__file__), "demo.html"))
