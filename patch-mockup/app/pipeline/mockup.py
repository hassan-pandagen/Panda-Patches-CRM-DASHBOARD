"""Mockup-only pipeline entry point.

generate(artwork_bytes, patch_type, ...) -> {
    "png":            bytes,          # the realistic JPEG/PNG mockup (always)
    "svg":            str | None,     # vector, only for pvc/silicone/leather/woven
    "mockup_style":   str,
    "production_file":str,            # dst | vector | none_manual (informational)
    "category":       str,
    "colors":         [ {code,name,hex,coverage} ],   # thread-snapped colors used
    "warnings":       [str],          # size/detail/colour advisories for the quote
    "size_mm":        [w, h],
}

Scope: this produces what SALES needs — a mockup constrained to producible detail
(so it never over-promises like an AI image generator), plus a clean vector where
the process needs one. It does NOT make machine files; the digitizer does the real
production work after the sale is secured.
"""
from __future__ import annotations

import io
import json
import os
from dataclasses import asdict

import numpy as np
from PIL import Image

from . import materials as M
from . import quantize as Q
from .engine import prepare

_CATS = os.path.join(os.path.dirname(__file__), "categories.json")


def load_categories(path: str = _CATS) -> dict:
    with open(path) as f:
        return json.load(f)["categories"]


def resolve_category(patch_type: str, cats: dict) -> tuple[str, dict]:
    t = (patch_type or "").strip().lower().replace("-", " ")
    # 1) exact key / label / alias
    for key, c in cats.items():
        if t == key or t == c["label"].lower() or t in [a.lower() for a in c.get("aliases", [])]:
            return key, c
    # 2) loose contains — MOST-SPECIFIC alias wins, embroidery excluded (it's the
    #    fallback, and it would greedily grab "3D EMBROIDERY puff" etc.)
    best, best_len = None, 0
    for key, c in cats.items():
        if key == "embroidery":
            continue
        for a in c.get("aliases", []):
            al = a.lower()
            if al in t and len(al) > best_len:
                best, best_len = (key, c), len(al)
    if best:
        return best
    return "embroidery", cats["embroidery"]        # safe default + a warning added later


def _estimate_min_feature_mm(labels: np.ndarray, ppm: float) -> float:
    """Rough smallest-feature probe: max erosion radius any region survives."""
    import cv2
    smallest = 999.0
    n = int(labels.max()) + 1 if labels.max() >= 0 else 0
    for i in range(n):
        m = (labels == i).astype(np.uint8)
        if m.sum() == 0:
            continue
        d = cv2.distanceTransform(m, cv2.DIST_L2, 3)
        # thinnest limb ≈ 2 * median of the local max ridge; use a robust proxy
        thick_mm = float(np.percentile(d[d > 0], 60)) * 2.0 / ppm
        smallest = min(smallest, thick_mm)
    return smallest if smallest < 999 else 0.0


def _warnings(cat_key: str, cat: dict, ctx: dict, patch_type: str,
              requested_w_mm: float, colors: list) -> list[str]:
    w = []
    longest = max(ctx["size_mm_raw"])
    if patch_type and cat_key == "embroidery" and \
       (patch_type or "").strip().lower() not in ["embroidery", "embroidered"]:
        # only warn about the fallback if the input truly didn't match anything
        if not any(a.lower() in (patch_type or "").lower()
                   for a in cat.get("aliases", [])):
            w.append(f"Patch type '{patch_type}' not recognized — defaulted to Embroidery. Confirm the type.")
    mn, mx = cat.get("min_size_in"), cat.get("max_size_in")
    in_longest = longest / 25.4
    if mn and in_longest < mn:
        w.append(f"Size {in_longest:.1f}in is below the {mn}in practical minimum for {cat['label']}.")
    if mx and in_longest > mx:
        w.append(f"Size {in_longest:.1f}in exceeds the {mx}in maximum for {cat['label']}.")
    # colour cap
    cap = cat.get("max_colors")
    if cap and len(colors) >= cap:
        w.append(f"{cat['label']} runs best at <= {cap} colors; using {len(colors)}.")
    # detail floors (embroidery/puff mainly)
    feat = _estimate_min_feature_mm(ctx["labels"], ctx["px_per_mm"])
    if cat.get("min_line_mm") and 0 < feat < cat["min_line_mm"]:
        w.append(f"Fine detail ~{feat:.1f}mm is below the {cat['min_line_mm']}mm floor for {cat['label']} — may not reproduce cleanly.")
    if cat_key == "puff_3d" and len(colors) > 2:
        w.append("3D puff supports 2 colors max and bold shapes only — thin lines/detail will lose the raised effect.")
    return w


def generate(artwork_bytes: bytes, patch_type: str = "embroidery",
             width_mm: float = 80.0, border_mm: float = 3.0,
             px_per_mm: float = 8.0, base_hex: str = "#232830",
             border_hex: str | None = None, annotate: bool = True,
             finish: str | None = None, categories_path: str | None = None) -> dict:
    cats = load_categories(categories_path) if categories_path else load_categories()
    cat_key, cat = resolve_category(patch_type, cats)
    style = cat["mockup_style"]
    max_colors = cat.get("max_colors") or 12

    ctx = prepare(artwork_bytes, width_mm=width_mm, border_mm=border_mm,
                  px_per_mm=px_per_mm, max_colors=max_colors,
                  base_hex=base_hex, border_hex=border_hex)
    ctx["size_mm_raw"] = [ctx["labels"].shape[1] / px_per_mm,
                          ctx["labels"].shape[0] / px_per_mm]

    # Render: fal FLUX finishing pass if enabled, else deterministic local texture.
    from . import finish_fal as FAL
    use_fal = (finish == "fal") or (finish in (None, "auto") and FAL.available())
    if use_fal and FAL.available():
        flat = (np.clip(M.flat_render(ctx), 0, 1) * 255).astype(np.uint8)
        fbuf = io.BytesIO(); Image.fromarray(flat, "RGBA").save(fbuf, "PNG")
        try:
            styled_png = FAL.stylize(fbuf.getvalue(), style)
            rgba = np.array(Image.open(io.BytesIO(styled_png)).convert("RGBA"))
            render_source = "fal-flux"
        except Exception:                                    # any fal failure -> local
            rgba = (np.clip(M.render(style, ctx), 0, 1) * 255).astype(np.uint8)
            render_source = "local-fallback"
    else:
        rgba = (np.clip(M.render(style, ctx), 0, 1) * 255).astype(np.uint8)
        render_source = "local"

    from . import canvas as CV
    if annotate:
        png_img = CV.present(rgba, width_mm)                 # grid + size arrows
        buf = io.BytesIO(); png_img.save(buf, "PNG")
    else:
        buf = io.BytesIO(); Image.fromarray(rgba, "RGBA").save(buf, "PNG")

    colors = [asdict(t) | {"hex": "#%02X%02X%02X" % t.rgb} for t in ctx["threads"]]
    warnings = _warnings(cat_key, cat, ctx, patch_type, width_mm, colors)

    svg = None
    if cat["production_file"] == "vector":
        try:
            svg = _vectorize(rgba)               # VTracer on the VPS (see README)
        except Exception:
            warnings.append("Vector (SVG) not generated on this host — install vtracer on the service.")

    return {
        "png": buf.getvalue(),
        "svg": svg,
        "mockup_style": style,
        "production_file": cat["production_file"],
        "category": cat_key,
        "colors": colors,
        "warnings": warnings,
        "size_mm": [width_mm, round(ctx["labels"].shape[0] / px_per_mm - 6.0, 1)],
        "render_source": render_source,
    }


def _vectorize(rgba: np.ndarray) -> str:
    """Full-color raster -> SVG via VTracer. Guarded import (VPS only)."""
    import tempfile

    import vtracer
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fi, \
         tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as fo:
        Image.fromarray(rgba, "RGBA").save(fi.name)
        vtracer.convert_image_to_svg_py(fi.name, fo.name, colormode="color")
        return open(fo.name).read()
