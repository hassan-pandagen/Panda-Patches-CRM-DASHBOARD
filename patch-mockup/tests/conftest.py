import io

import pytest
from PIL import Image, ImageDraw


@pytest.fixture
def sample_artwork_png() -> bytes:
    img = Image.new("RGBA", (240, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([20, 20, 220, 180], fill=(21, 42, 85, 255))
    d.polygon([(60, 150), (120, 60), (160, 110), (200, 150)], fill=(46, 158, 68, 255))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()
