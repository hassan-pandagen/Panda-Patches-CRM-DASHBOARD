"""Deterministic embroidery textures: satin fill, twill base, merrow border.

Everything works on float32 RGB in 0..1 and uint8 masks. No AI, no randomness
that changes between runs (seeded), so the same artwork always renders the
same proof — the proof is the contract with the customer.
"""
from __future__ import annotations

import cv2
import numpy as np

RNG = np.random.default_rng(1234)

# stitch angles cycle per color region so adjacent fills catch light differently
FILL_ANGLES_DEG = [25, 115, 70, 160, 45, 135, 90, 0]


def _stripe_field(h: int, w: int, angle_deg: float, period_px: float, phase: float = 0.0) -> np.ndarray:
    """0..1 sinusoidal stripes at a given angle — the 'threads'."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    a = np.deg2rad(angle_deg)
    u = xx * np.cos(a) + yy * np.sin(a)
    return 0.5 + 0.5 * np.sin(2 * np.pi * u / period_px + phase)


def satin_fill(shape_hw, labels: np.ndarray, thread_rgbs: list, px_per_mm: float) -> np.ndarray:
    """Render every color region with directional satin texture + sheen.
    Returns float32 (H,W,3) in 0..1 (garbage outside labels>=0 — mask later)."""
    h, w = shape_hw
    out = np.zeros((h, w, 3), np.float32)
    period = max(2.5, 0.42 * px_per_mm)          # ~0.42 mm per thread of 40wt
    noise = RNG.normal(0.0, 0.02, (h, w)).astype(np.float32)

    n_regions = int(labels.max()) + 1 if labels.max() >= 0 else 0
    for i in range(n_regions):
        m = labels == i
        if not m.any():
            continue
        ang = FILL_ANGLES_DEG[i % len(FILL_ANGLES_DEG)]
        stripes = _stripe_field(h, w, ang, period, phase=i * 1.7)
        sheen = 0.80 + 0.34 * (stripes ** 1.5)            # thread highlight
        sheen = np.where(stripes < 0.10, sheen * 0.78, sheen)  # groove between threads
        sheen = sheen + noise
        col = np.array(thread_rgbs[i], np.float32) / 255.0
        region = col[None, None, :] * sheen[..., None]

        # stitch-pull shading at region boundary (separates color blocks)
        m8 = m.astype(np.uint8)
        inner = cv2.erode(m8, np.ones((3, 3), np.uint8))
        edge = (m8 - inner).astype(bool)
        region[edge] *= 0.80

        out[m] = region[m]
    return np.clip(out, 0, 1)


def twill(shape_hw, base_rgb: tuple, px_per_mm: float) -> np.ndarray:
    """Woven twill fabric texture (the patch base under/around the embroidery)."""
    h, w = shape_hw
    rib = _stripe_field(h, w, 63, max(2.2, 0.40 * px_per_mm))
    weft = _stripe_field(h, w, -27, max(2.2, 0.80 * px_per_mm))
    shade = 0.86 + 0.16 * (rib ** 1.2) + 0.05 * weft
    shade += RNG.normal(0.0, 0.015, (h, w)).astype(np.float32)
    col = np.array(base_rgb, np.float32) / 255.0
    return np.clip(col[None, None, :] * shade[..., None], 0, 1)


def merrow_border(outer_mask: np.ndarray, sil_mask: np.ndarray,
                  border_rgb: tuple, px_per_mm: float):
    """Render the wrapped over-lock border on the ring between silhouette and
    the dilated outline. Threads run perpendicular to the edge (radial lines
    drawn along the contour), with a torus cross-profile for roundness.
    Returns (rgb float32, ring_mask bool)."""
    h, w = outer_mask.shape
    ring = (outer_mask & ~sil_mask)
    rgb = np.zeros((h, w, 3), np.float32)
    if not ring.any():
        return rgb, ring

    col = np.array(border_rgb, np.float32) / 255.0
    ring_w = max(2.0, float(cv2.distanceTransform(outer_mask.astype(np.uint8),
                                                  cv2.DIST_L2, 3)[ring].max()))

    # 1) draw radial 'threads' along the outer contour
    canvas = np.zeros((h, w), np.float32)
    cnts, _ = cv2.findContours(outer_mask.astype(np.uint8), cv2.RETR_EXTERNAL,
                               cv2.CHAIN_APPROX_NONE)
    thread_px = max(2, int(round(0.35 * px_per_mm)))
    for cnt in cnts:
        pts = cnt.reshape(-1, 2).astype(np.float32)
        n = len(pts)
        if n < 8:
            continue
        arc = 0.0
        for i in range(0, n, 1):
            p = pts[i]
            t = pts[(i + 3) % n] - pts[(i - 3) % n]
            norm = np.hypot(*t)
            if norm < 1e-3:
                continue
            t /= norm
            nvec = np.array([-t[1], t[0]])
            q = p - nvec * (ring_w + 1)           # candidate inner point
            qi = np.clip(q.astype(int), [0, 0], [w - 1, h - 1])
            if not outer_mask[qi[1], qi[0]]:      # normal pointed outward — flip
                nvec = -nvec
                q = p - nvec * (ring_w + 1)
            arc += 1.0
            shade = 0.72 + 0.34 * (0.5 + 0.5 * np.sin(arc * 2 * np.pi / (thread_px * 2)))
            cv2.line(canvas, tuple(np.round(p).astype(int)),
                     tuple(np.round(q).astype(int)), float(shade), thread_px)

    # 2) torus cross-profile: bright crown at the middle of the ring
    d_out = cv2.distanceTransform(outer_mask.astype(np.uint8), cv2.DIST_L2, 3)
    prof = np.clip(d_out / ring_w, 0, 1)
    crown = (np.clip(np.sin(np.pi * prof), 0, 1) ** 0.7).astype(np.float32)

    shade = np.clip(canvas, 0.55, 1.15) * (0.55 + 0.55 * crown)
    rgb = col[None, None, :] * shade[..., None]
    return np.clip(rgb, 0, 1), ring
