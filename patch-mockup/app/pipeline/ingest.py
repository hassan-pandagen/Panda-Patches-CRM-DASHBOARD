"""Rasterize non-raster uploads (PDF / PDF-compatible AI) to PNG bytes.

Poppler (via pdf2image) handles PDF and modern Illustrator files — AI9+ saves
PDF-compatible by default, so its file header is a plain PDF header. Legacy
PostScript-only AI/EPS is out of scope (see CLAUDE.md §10f); such files raise
a clear ValueError instead of crashing the pipeline.

Detection is by magic bytes, not filename/content-type, so it works the same
whether the artwork arrived as a bench upload or was fetched from a URL.
"""
from __future__ import annotations

import io

_RASTER_MAGIC = (
    b"\x89PNG\r\n\x1a\n",   # PNG
    b"\xff\xd8\xff",         # JPEG
    b"GIF87a", b"GIF89a",    # GIF
)


def is_raster(data: bytes) -> bool:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    return any(data.startswith(sig) for sig in _RASTER_MAGIC)


def is_pdf_like(data: bytes) -> bool:
    """PDF, or PDF-compatible Illustrator — both start with the PDF header."""
    return data.lstrip()[:5] == b"%PDF-"


def to_raster_png(data: bytes, dpi: int = 300) -> bytes:
    """Best-effort: pass raster bytes through unchanged, or rasterize a
    PDF/PDF-compatible-AI's first page to PNG via poppler. Raises ValueError
    (with a message safe to surface as a warning/job-failure reason) for
    anything else or if rasterization fails — callers must not let that
    crash the request/job."""
    if is_raster(data):
        return data
    if not is_pdf_like(data):
        raise ValueError(
            "Unsupported upload — expected a raster image (PNG/JPG/WebP) or a "
            "PDF/PDF-compatible AI file. Legacy PostScript AI/EPS isn't supported."
        )
    try:
        from pdf2image import convert_from_bytes
    except ImportError as e:
        raise ValueError("PDF/AI rasterization requires pdf2image + poppler on this host.") from e
    try:
        pages = convert_from_bytes(data, dpi=dpi, first_page=1, last_page=1)
    except Exception as e:
        raise ValueError(f"Could not rasterize the uploaded PDF/AI file: {e}") from e
    if not pages:
        raise ValueError("PDF/AI file has no pages to rasterize.")
    buf = io.BytesIO()
    pages[0].convert("RGBA").save(buf, "PNG")
    return buf.getvalue()
