"""Presentation: put a rendered patch on a grey grid canvas with size-dimension
arrows and inch labels — matching the reference mockup format Panda Patches
sends to customers.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]


def _font(sz):
    for p in _FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def _fmt_in(x: float) -> str:
    s = f"{x:.1f}".rstrip("0").rstrip(".")
    return s


def _grid(W, H, cell, line=(206, 208, 210), bg=(228, 228, 230)):
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    for x in range(0, W, cell):
        d.line([(x, 0), (x, H)], fill=line, width=1)
    for y in range(0, H, cell):
        d.line([(0, y), (W, y)], fill=line, width=1)
    return img


def _arrowhead(d, tip, dx, dy, size, color=(20, 20, 20)):
    """Draw a filled triangular arrowhead at tip pointing in (dx,dy)."""
    import math
    ang = math.atan2(dy, dx)
    left = (tip[0] - size * math.cos(ang - 0.4), tip[1] - size * math.sin(ang - 0.4))
    right = (tip[0] - size * math.cos(ang + 0.4), tip[1] - size * math.sin(ang + 0.4))
    d.polygon([tip, left, right], fill=color)


def present(patch_rgba: np.ndarray, width_mm: float) -> Image.Image:
    """patch_rgba: HxWx4 uint8. width_mm = full patch width. Height inferred from
    the rendered aspect. Returns an RGB PIL image on a dimensioned grid."""
    a = patch_rgba[..., 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return Image.fromarray(patch_rgba, "RGBA").convert("RGB")
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    patch = Image.fromarray(patch_rgba[y0:y1 + 1, x0:x1 + 1], "RGBA")
    pw, ph = patch.size

    width_in = width_mm / 25.4
    height_in = width_in * (ph / pw)

    m_left, m_right, m_top, m_bottom = 70, 190, 150, 80
    W = m_left + pw + m_right
    H = m_top + ph + m_bottom
    cell = max(20, int(round(min(W, H) / 24)))
    canvas = _grid(W, H, cell)
    px, py = m_left, m_top
    canvas.paste(patch, (px, py), patch)
    d = ImageDraw.Draw(canvas)

    fsz = max(22, int(round(cell * 1.15)))
    font = _font(fsz)
    ah = max(10, int(fsz * 0.55))
    black = (20, 20, 20)

    # horizontal dimension above the patch
    ay = py - int(fsz * 1.3)
    d.line([(px + ah, ay), (px + pw - ah, ay)], fill=black, width=max(3, fsz // 9))
    _arrowhead(d, (px, ay), -1, 0, ah)
    _arrowhead(d, (px + pw, ay), 1, 0, ah)
    d.text((px + pw / 2, ay - int(fsz * 0.5)), f"{_fmt_in(width_in)} INCHES",
           anchor="mm", font=font, fill=black)

    # vertical dimension to the right
    ax = px + pw + int(m_right * 0.45)
    d.line([(ax, py + ah), (ax, py + ph - ah)], fill=black, width=max(3, fsz // 9))
    _arrowhead(d, (ax, py), 0, -1, ah)
    _arrowhead(d, (ax, py + ph), 0, 1, ah)
    # rotated label
    lbl = f"{_fmt_in(height_in)} INCHES"
    tw = int(d.textlength(lbl, font=font))
    ti = Image.new("RGBA", (tw + 10, fsz + 10), (0, 0, 0, 0))
    ImageDraw.Draw(ti).text((5, 2), lbl, font=font, fill=black)
    ti = ti.rotate(-90, expand=True)
    canvas.paste(ti, (ax + int(fsz * 0.4), py + ph // 2 - ti.height // 2), ti)

    return canvas
