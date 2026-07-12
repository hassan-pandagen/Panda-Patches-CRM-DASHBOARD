"""End-to-end pipeline. prepare() builds the shared design context; the proof
(render_mockup) and the machine file (digitize.build_stitch_plan) are BOTH
generated from that same context — so the proof a customer approves and the
file the machine runs can never drift apart.
"""
from __future__ import annotations

import io
from dataclasses import asdict

import cv2
import numpy as np
from PIL import Image

from . import quantize as Q
from . import texture as T

# ---------- input handling -------------------------------------------------

def _load_rgba(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGBA")
    return np.array(img)


def _key_out_flat_background(rgba: np.ndarray, tol: int = 26) -> np.ndarray:
    if (rgba[..., 3] < 250).mean() > 0.02:
        return rgba
    h, w = rgba.shape[:2]
    rgb = rgba[..., :3].copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    flood = rgb.copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        cv2.floodFill(flood, ff_mask, seed, (255, 0, 255),
                      loDiff=(tol,) * 3, upDiff=(tol,) * 3,
                      flags=8 | cv2.FLOODFILL_MASK_ONLY)
    bg = ff_mask[1:-1, 1:-1].astype(bool)
    if bg.mean() < 0.9:
        rgba = rgba.copy()
        rgba[..., 3] = np.where(bg, 0, 255).astype(np.uint8)
    return rgba


def _trim_and_scale(rgba: np.ndarray, design_w_px: int) -> np.ndarray:
    a = rgba[..., 3] > 10
    if not a.any():
        raise ValueError("empty artwork")
    ys, xs = np.where(a)
    rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    scale = design_w_px / rgba.shape[1]
    new = (design_w_px, max(8, int(round(rgba.shape[0] * scale))))
    return np.array(Image.fromarray(rgba).resize(new, Image.LANCZOS))


def _silhouette(alpha: np.ndarray, px_per_mm: float) -> np.ndarray:
    m = (alpha > 128).astype(np.uint8)
    r = max(3, int(round(1.2 * px_per_mm)))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    ff = m.copy()
    mask = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 1)
    m = m | (1 - ff)
    m = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.35 * px_per_mm)
    return m > 0.5


# ---------- shared context ---------------------------------------------------

def prepare(art_bytes: bytes,
            width_mm: float = 80.0,
            border_mm: float = 3.0,
            px_per_mm: float = 8.0,
            max_colors: int = 8,
            base_hex: str = "#232830",
            border_hex: str | None = None,
            chart_path: str | None = None) -> dict:
    chart = Q.load_chart(chart_path) if chart_path else Q.load_chart()

    pad_mm = 1.0
    design_w_px = int(round((width_mm - 2 * (border_mm + pad_mm)) * px_per_mm))
    rgba = _load_rgba(art_bytes)
    if (rgba[..., 3] < 250).mean() <= 0.02:
        try:                                  # rembg auto-used if installed
            from rembg import remove
            rgba = _load_rgba(remove(art_bytes))
        except ImportError:
            pass
    rgba = _key_out_flat_background(rgba)
    rgba = _trim_and_scale(rgba, design_w_px)

    margin = int(round((border_mm + pad_mm + 3.0) * px_per_mm))
    rgba = np.pad(rgba, ((margin, margin), (margin, margin), (0, 0)))
    alpha = rgba[..., 3]

    labels, threads = Q.quantize(rgba[..., :3], alpha, max_colors, chart)

    sil = _silhouette(alpha, px_per_mm)
    rB = max(2, int(round(border_mm * px_per_mm)))
    kB = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * rB + 1, 2 * rB + 1))
    outer = cv2.dilate(sil.astype(np.uint8), kB).astype(bool)

    # border thread: explicit hex snapped to the chart, else dominant thread
    if border_hex:
        want = Q._hex_to_rgb(border_hex)
        lab = Q._rgb_to_lab(np.array([t.rgb for t in chart] + [want], np.uint8))
        border_thread = chart[int(np.argmin(
            np.linalg.norm(lab[:-1] - lab[-1], axis=1)))]
    elif threads:
        border_thread = threads[int(np.argmax([t.coverage for t in threads]))]
    else:
        border_thread = Q.ThreadColor("T-007", "Black", (26, 26, 28))

    return dict(rgba=rgba, alpha=alpha, labels=labels, threads=threads,
                sil=sil, outer=outer, px_per_mm=px_per_mm, border_mm=border_mm,
                width_mm=width_mm, base_rgb=Q._hex_to_rgb(base_hex),
                border_thread=border_thread)


# ---------- proof render -----------------------------------------------------

def render_mockup(art_bytes: bytes = None, ctx: dict = None, **kw) -> dict:
    ctx = ctx or prepare(art_bytes, **kw)
    labels, threads = ctx["labels"], ctx["threads"]
    h, w = labels.shape
    ppm = ctx["px_per_mm"]

    design = T.satin_fill((h, w), labels, [t.rgb for t in threads], ppm)
    design_mask = labels >= 0
    sil, outer = ctx["sil"], ctx["outer"]

    twill_rgb = T.twill((h, w), ctx["base_rgb"], ppm)
    border_rgb_img, ring = T.merrow_border(outer, sil, ctx["border_thread"].rgb, ppm)

    canvas = np.zeros((h, w, 4), np.float32)
    sh = cv2.GaussianBlur(outer.astype(np.float32), (0, 0), 0.9 * ppm)
    sh = np.roll(np.roll(sh, int(0.5 * ppm), 0), int(0.35 * ppm), 1)
    canvas[..., 3] = np.maximum(canvas[..., 3], sh * 0.38)

    inside = sil & ~ring
    canvas[inside, :3] = twill_rgb[inside]
    canvas[inside, 3] = 1.0
    dm = design_mask & inside
    canvas[dm, :3] = design[dm]
    canvas[ring, :3] = border_rgb_img[ring]
    canvas[ring, 3] = 1.0

    png = Image.fromarray((np.clip(canvas, 0, 1) * 255).astype(np.uint8), "RGBA")
    buf = io.BytesIO()
    png.save(buf, "PNG")

    mm2 = 1.0 / (ppm ** 2)
    fill_mm2 = float(design_mask.sum()) * mm2
    perim_mm = 0.0
    cnts, _ = cv2.findContours(outer.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cnts:
        perim_mm += cv2.arcLength(c, True) / ppm

    bt = ctx["border_thread"]
    return {
        "png": buf.getvalue(),
        "threads": [asdict(t) | {"hex": "#%02X%02X%02X" % t.rgb} for t in threads],
        "border_thread": {"code": bt.code, "name": bt.name,
                          "hex": "#%02X%02X%02X" % bt.rgb},
        "stitch_estimate": int(fill_mm2 * 2.8 + perim_mm * 6.0),
        "size_mm": [ctx["width_mm"], round(h / ppm - 6.0, 1)],
    }
