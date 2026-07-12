import io

import pytest
from PIL import Image

from app.pipeline import ingest


def _png_bytes(size=(10, 10), color=(200, 30, 30, 255)):
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG")
    return buf.getvalue()


def test_is_raster_true_for_png():
    assert ingest.is_raster(_png_bytes())


def test_is_raster_false_for_pdf_header():
    assert not ingest.is_raster(b"%PDF-1.4\n...")


def test_is_pdf_like_true_for_pdf_header():
    assert ingest.is_pdf_like(b"%PDF-1.4\n...")


def test_is_pdf_like_false_for_png():
    assert not ingest.is_pdf_like(_png_bytes())


def test_to_raster_png_passes_through_raster_bytes():
    data = _png_bytes()
    assert ingest.to_raster_png(data) == data


def test_to_raster_png_rejects_unsupported_format():
    with pytest.raises(ValueError):
        ingest.to_raster_png(b"not an image or pdf at all")
