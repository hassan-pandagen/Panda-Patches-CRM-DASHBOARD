"""Optional fal.ai FLUX image-to-image finishing pass.

Turns the CONSTRAINED flat render (already reduced to producible thread colours
and detail by the rest of the pipeline) into a photoreal material mockup. Because
the input is already producible, FLUX adds realistic texture without inventing
impossible fine detail — solving the "AI makes it too detailed to sew" problem.

Endpoint: fal-ai/flux/dev/image-to-image  (~$0.03/megapixel, seed-able).
Requires: pip install fal-client, and env FAL_KEY set on the service.
This module is import-guarded — if fal-client or FAL_KEY is absent, the pipeline
falls back to the deterministic local textures in materials.py.
"""
from __future__ import annotations

import io
import os
import tempfile

# Per-material prompts. Phrased to KEEP flat solid thread colours and reject the
# gradients / photographic detail that can't be produced.
PROMPTS = {
    "embroidery": ("embroidered patch, dense satin and fill stitches with visible "
                   "thread direction, merrow stitched rope border, flat solid thread "
                   "colours, matte fabric, no gradients, no photographic detail, "
                   "product photo, plain background"),
    "puff": ("3D puff embroidered patch, bold raised foam satin stitches, thick "
             "rounded lettering, merrow border, flat solid thread colours, "
             "no fine detail, product photo, plain background"),
    "molded_pvc": ("glossy molded PVC rubber patch, smooth raised 2D layers, clean "
                   "raised walls separating each flat colour, soft sheen, "
                   "no colour bleed, product photo, plain background"),
    "woven": ("woven fabric patch, fine tight thread weave, crisp small detail, "
              "flat solid colours, stitched border, product photo, plain background"),
    "flat_print": ("dye-sublimation printed fabric patch, smooth flat print, "
                   "merrow stitched border, product photo, plain background"),
    "leather": ("laser-engraved genuine leather patch, debossed design, natural "
                "leather grain, tonal monochrome, product photo, plain background"),
    "chenille": ("chenille yarn patch, fuzzy raised looped chenille texture, bold "
                 "simple shapes, felt background, embroidered border, product photo"),
    "sequin": ("sequin patch, rows of small reflective shiny sequins, sparkle, "
               "bold shapes, embroidered border, product photo, plain background"),
}

DEFAULT_STRENGTH = {
    "embroidery": 0.60, "puff": 0.62, "molded_pvc": 0.58, "woven": 0.55,
    "flat_print": 0.45, "leather": 0.68, "chenille": 0.70, "sequin": 0.72,
}


def available() -> bool:
    if not os.getenv("FAL_KEY"):
        return False
    try:
        import fal_client  # noqa: F401
        return True
    except ImportError:
        return False


def stylize(flat_png: bytes, mockup_style: str, seed: int = 7,
            strength: float | None = None, size_px: int = 1024) -> bytes:
    """flat_png: the constrained flat render (PNG bytes). Returns FLUX'd PNG bytes.
    Raises if fal is unavailable — callers should guard with available()."""
    import fal_client
    import requests

    prompt = PROMPTS.get(mockup_style, PROMPTS["embroidery"])
    strength = strength if strength is not None else DEFAULT_STRENGTH.get(mockup_style, 0.6)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(flat_png)
        tmp = f.name
    image_url = fal_client.upload_file(tmp)          # -> hosted URL for the input

    result = fal_client.subscribe(
        "fal-ai/flux/dev/image-to-image",
        arguments={
            "image_url": image_url,
            "prompt": prompt,
            "strength": strength,      # lower = closer to the producible input
            "seed": seed,              # reproducible per design
            "num_inference_steps": 28,
            "image_size": {"width": size_px, "height": size_px},
            "enable_safety_checker": True,
        },
    )
    out_url = result["images"][0]["url"]
    return requests.get(out_url, timeout=60).content
