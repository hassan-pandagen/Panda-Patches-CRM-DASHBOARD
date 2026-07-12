"""Eight material looks for realistic patch mockups.

render(style, ctx) -> RGBA float (H,W,4) in 0..1, composited on transparency.
`ctx` comes from engine.prepare() (labels, threads, sil, outer, base_rgb,
border_thread, px_per_mm). All styles are DETERMINISTIC (seeded) — the mockup a
customer approves must be reproducible, and it is deliberately constrained to
producible detail so it never over-promises like an AI image generator.

Styles: embroidery, puff, molded_pvc (also silicone), woven, flat_print,
leather, chenille, sequin.
"""
from __future__ import annotations

import cv2
import numpy as np

from . import texture as T

RNG = np.random.default_rng(20260709)


# ---------- directional fill (stitches follow each shape) --------------------

def _components(mask, min_px):
    n, lbl = cv2.connectedComponents(mask.astype(np.uint8), connectivity=8)
    return [lbl == i for i in range(1, n) if (lbl == i).sum() >= min_px]


def _pca(mask):
    ys, xs = np.where(mask)
    c = np.stack([xs, ys], 1).astype(np.float64)
    c -= c.mean(0)
    if len(c) < 8:
        return 0.0, 1.0
    cov = c.T @ c / len(c)
    ev, evec = np.linalg.eigh(cov)
    long = evec[:, int(np.argmax(ev))]
    ang = float(np.degrees(np.arctan2(long[1], long[0])))
    ratio = float(np.sqrt((ev.max() + 1e-6) / (ev.min() + 1e-6)))
    return ang, ratio


def directional_satin(shape_hw, labels, thread_rgbs, ppm):
    """Satin fill where each connected shape gets its own stitch direction:
    thin strokes (letters, cross arms) get satin ACROSS the stroke; broad
    areas get a consistent directional fill. Closer to real digitizing."""
    h, w = shape_hw
    out = np.zeros((h, w, 3), np.float32)
    period = max(2.5, 0.42 * ppm)
    noise = RNG.normal(0, 0.02, (h, w)).astype(np.float32)
    n = int(labels.max()) + 1 if labels.max() >= 0 else 0
    min_px = (0.8 * ppm) ** 2
    for i in range(n):
        region = labels == i
        if not region.any():
            continue
        col = np.array(thread_rgbs[i], np.float32) / 255.0
        for comp in _components(region, min_px):
            ang, ratio = _pca(comp)
            stripe_ang = ang + 90 if ratio > 2.3 else ang   # across thin strokes
            stripes = T._stripe_field(h, w, stripe_ang, period)
            sheen = 0.80 + 0.34 * (stripes ** 1.5)
            sheen = np.where(stripes < 0.10, sheen * 0.78, sheen) + noise
            rgb = col[None, None, :] * sheen[..., None]
            m8 = comp.astype(np.uint8)
            edge = (m8 - cv2.erode(m8, np.ones((3, 3), np.uint8))).astype(bool)
            rgb[edge] *= 0.80
            out[comp] = np.clip(rgb, 0, 1)[comp]
    return out


# ---------- shared helpers --------------------------------------------------

def _unpack(ctx):
    labels = ctx["labels"]
    h, w = labels.shape
    ppm = ctx["px_per_mm"]
    sil = ctx["sil"]
    outer = ctx["outer"]
    ring = outer & ~sil
    threads = ctx["threads"]
    rgbs = [np.array(t.rgb, np.float32) / 255.0 for t in threads]
    return h, w, ppm, labels, sil, outer, ring, threads, rgbs


def _region_flat(labels, rgbs, h, w):
    """Flat mean color per region."""
    out = np.zeros((h, w, 3), np.float32)
    for i, c in enumerate(rgbs):
        out[labels == i] = c
    return out


def _drop_shadow(canvas, outer, ppm, strength=0.38, spread=0.9, dx=0.35, dy=0.5):
    sh = cv2.GaussianBlur(outer.astype(np.float32), (0, 0), spread * ppm)
    sh = np.roll(np.roll(sh, int(dy * ppm), 0), int(dx * ppm), 1)
    canvas[..., 3] = np.maximum(canvas[..., 3], sh * strength)
    return canvas


def _dist_norm(mask, ppm):
    """0..1 distance-to-edge inside a mask (for doming / bevels)."""
    d = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 3)
    mx = max(1.0, d.max())
    return d / mx


def _region_boundaries(labels):
    """Bool mask of pixels where the label differs from a neighbor."""
    lab = labels.astype(np.int32)
    b = np.zeros(lab.shape, bool)
    b[:, :-1] |= lab[:, :-1] != lab[:, 1:]
    b[:, 1:] |= lab[:, :-1] != lab[:, 1:]
    b[:-1, :] |= lab[:-1, :] != lab[1:, :]
    b[1:, :] |= lab[:-1, :] != lab[1:, :]
    b &= labels >= 0
    return b


def _leather_base(h, w, ppm, tone):
    """Leather grain base color field."""
    n = RNG.normal(0, 1, (h, w)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), 0.6 * ppm)
    n2 = cv2.GaussianBlur(RNG.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 2.5 * ppm)
    grain = 0.90 + 0.06 * n + 0.05 * n2
    return np.clip(tone[None, None, :] * grain[..., None], 0, 1)


# ---------- borders ---------------------------------------------------------

def _merrow(outer, sil, rgb, ppm):
    img, ring = T.merrow_border(outer, sil, rgb, ppm)
    return img, ring


def _rubber_rim(outer, sil, rgb, ppm):
    """Rounded glossy rim for PVC/silicone."""
    ring = outer & ~sil
    prof = _dist_norm(outer, ppm)
    crown = np.clip(np.sin(np.pi * prof), 0, 1) ** 0.6
    hi = 0.6 + 0.6 * crown
    img = rgb[None, None, :] * hi[..., None]
    return np.clip(img, 0, 1), ring


def _flat_rim(outer, sil, rgb, ppm, darken=0.82):
    ring = outer & ~sil
    img = np.zeros((*outer.shape, 3), np.float32)
    img[ring] = rgb * darken
    return img, ring


# ---------- the eight styles ------------------------------------------------

def _embroidery(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = directional_satin((h, w), labels, [t.rgb for t in threads], ppm)
    base = T.twill((h, w), ctx["base_rgb"], ppm)
    border_img, ring = _merrow(outer, sil, ctx["border_thread"].rgb, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _puff(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = directional_satin((h, w), labels, [t.rgb for t in threads], ppm)
    # dome each region: brighten crown, darken edges → raised foam
    dome = np.zeros((h, w), np.float32)
    for i in range(len(rgbs)):
        m = labels == i
        if m.any():
            dome[m] = (np.clip(np.sin(np.pi * _dist_norm(m, ppm)), 0, 1) ** 0.5)[m]
    lift = 0.55 + 0.75 * dome
    design = np.clip(design * lift[..., None], 0, 1)
    base = T.twill((h, w), ctx["base_rgb"], ppm)
    border_img, ring = _merrow(outer, sil, ctx["border_thread"].rgb, ppm)
    # stronger shadow = more height
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img,
                    shadow=dict(strength=0.5, spread=1.2, dx=0.6, dy=0.8))


def _molded_pvc(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = _region_flat(labels, rgbs, h, w)
    # soft top-left gloss over the whole patch
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    gloss = 0.86 + 0.20 * (1.0 - (xx / w * 0.5 + yy / h * 0.5))
    design = design * gloss[..., None]
    # COLOR WALLS: raised divider between adjacent colors (bevel = light/dark)
    b = _region_boundaries(labels)
    up = np.roll(b, -1, 0) | np.roll(b, -1, 1)     # highlight top-left side
    dn = np.roll(b, 1, 0) | np.roll(b, 1, 1)       # shadow bottom-right side
    design[up & (labels >= 0)] *= 1.35
    design[dn & (labels >= 0)] *= 0.7
    design[b] *= 0.9                                # wall crease
    design = np.clip(design, 0, 1)
    base = np.tile((np.array(ctx["base_rgb"], np.float32) / 255.0), (h, w, 1)) * 0.92
    border_img, ring = _rubber_rim(outer, sil,
                                   np.array(ctx["border_thread"].rgb, np.float32) / 255.0, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _woven(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = _region_flat(labels, rgbs, h, w)
    # tight fine weave: two perpendicular high-freq stripe fields
    warp = T._stripe_field(h, w, 0, max(1.6, 0.28 * ppm))
    weft = T._stripe_field(h, w, 90, max(1.6, 0.28 * ppm))
    weave = 0.85 + 0.16 * warp * weft + 0.06 * (warp + weft) * 0.5
    design = np.clip(design * weave[..., None], 0, 1)
    base = np.tile((np.array(ctx["base_rgb"], np.float32) / 255.0), (h, w, 1))
    base = np.clip(base * weave[..., None], 0, 1)
    border_img, ring = _flat_rim(outer, sil,
                                 np.array(ctx["border_thread"].rgb, np.float32) / 255.0, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _flat_print(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = _region_flat(labels, rgbs, h, w)
    # faint fabric tooth only — printing is smooth/matte
    tooth = T._stripe_field(h, w, 45, max(1.4, 0.22 * ppm))
    design = np.clip(design * (0.96 + 0.05 * tooth)[..., None], 0, 1)
    base = np.tile((np.array(ctx["base_rgb"], np.float32) / 255.0), (h, w, 1))
    border_img, ring = _merrow(outer, sil, ctx["border_thread"].rgb, ppm)  # stitched edge
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _leather(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    tone = np.array(ctx["base_rgb"], np.float32) / 255.0
    if tone.mean() < 0.25:                          # if base too dark, use tan leather
        tone = np.array([0.42, 0.28, 0.16], np.float32)
    base = _leather_base(h, w, ppm, tone)
    design = base.copy()
    dmask = labels >= 0
    # deboss: darken engraved areas + inner shadow at the edges
    design[dmask] *= 0.55
    inner = cv2.erode(dmask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2).astype(bool)
    edge = dmask & ~inner
    design[edge] *= 0.7                              # burned edge
    # tiny top highlight just outside the deboss for relief
    border_img, ring = _flat_rim(outer, sil, tone * 0.7, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _chenille(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = _region_flat(labels, rgbs, h, w)
    # fuzzy loop texture: bumpy low-freq noise + soft speckle, soft edges
    bump = cv2.GaussianBlur(RNG.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 0.9 * ppm)
    speck = cv2.GaussianBlur(RNG.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 0.35 * ppm)
    fuzz = 0.82 + 0.16 * bump + 0.12 * speck
    design = design * fuzz[..., None]
    # soften edges (chenille is fluffy, not crisp)
    design = cv2.GaussianBlur(design, (0, 0), 0.4 * ppm)
    design = np.clip(design, 0, 1)
    base = T.twill((h, w), ctx["base_rgb"], ppm)
    border_img, ring = _merrow(outer, sil, ctx["border_thread"].rgb, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


def _sequin(ctx):
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    colors = _region_flat(labels, rgbs, h, w)
    design = colors * 0.35                            # dark gaps between sequins
    step = max(4, int(round(5.0 * ppm)))             # ~5mm sequins
    r = int(step * 0.62)
    yy, xx = np.mgrid[0:r * 2 + 1, 0:r * 2 + 1].astype(np.float32) - r
    dist = np.sqrt(xx ** 2 + yy ** 2) / r
    disc = np.clip(1 - dist, 0, 1)
    # specular highlight offset up-left on each disc
    spec = np.clip(1 - np.sqrt((xx + r * 0.35) ** 2 + (yy + r * 0.35) ** 2) / (r * 0.7), 0, 1)
    sil_m = sil
    for cy in range(step // 2, h, step):
        for cx in range(step // 2, w, step):
            if not (0 <= cy < h and 0 <= cx < w) or not sil_m[cy, cx] or labels[cy, cx] < 0:
                continue
            col = colors[cy, cx]
            y0, y1 = cy - r, cy + r + 1
            x0, x1 = cx - r, cx + r + 1
            ay0, ax0 = max(0, -y0), max(0, -x0)
            y0, x0 = max(0, y0), max(0, x0)
            y1, x1 = min(h, y1), min(w, x1)
            dh, dw = y1 - y0, x1 - x0
            if dh <= 0 or dw <= 0:
                continue
            d = disc[ay0:ay0 + dh, ax0:ax0 + dw]
            s = spec[ay0:ay0 + dh, ax0:ax0 + dw]
            shade = (0.55 + 0.5 * (1 - d)) [..., None] * col[None, None, :] + 0.6 * s[..., None]
            region = design[y0:y1, x0:x1]
            m = d > 0.02
            region[m] = np.clip(shade, 0, 1)[m]
            design[y0:y1, x0:x1] = region
    design = np.clip(design, 0, 1)
    base = T.twill((h, w), ctx["base_rgb"], ppm)
    border_img, ring = _flat_rim(outer, sil,
                                 np.array(ctx["border_thread"].rgb, np.float32) / 255.0, ppm)
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)


# ---------- compositor ------------------------------------------------------

def _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img, shadow=None):
    canvas = np.zeros((h, w, 4), np.float32)
    canvas = _drop_shadow(canvas, outer, ppm, **(shadow or {}))
    inside = sil & ~ring
    canvas[inside, :3] = base[inside]
    canvas[inside, 3] = 1.0
    dm = (labels >= 0) & inside
    canvas[dm, :3] = design[dm]
    canvas[ring, :3] = border_img[ring]
    canvas[ring, 3] = 1.0
    return np.clip(canvas, 0, 1)


_STYLES = {
    "embroidery": _embroidery,
    "puff": _puff,
    "molded_pvc": _molded_pvc,
    "woven": _woven,
    "flat_print": _flat_print,
    "leather": _leather,
    "chenille": _chenille,
    "sequin": _sequin,
}


def render(style: str, ctx: dict) -> np.ndarray:
    fn = _STYLES.get(style, _embroidery)
    return fn(ctx)


def flat_render(ctx: dict) -> np.ndarray:
    """Constrained FLAT render — producible thread colours + border, NO synthetic
    stitch/material texture. This is what we feed to the fal FLUX finishing pass:
    detail is already reduced, so FLUX can only add texture, not impossible detail."""
    h, w, ppm, labels, sil, outer, ring, threads, rgbs = _unpack(ctx)
    design = _region_flat(labels, rgbs, h, w)
    base = np.tile((np.array(ctx["base_rgb"], np.float32) / 255.0), (h, w, 1))
    border_rgb = np.array(ctx["border_thread"].rgb, np.float32) / 255.0
    border_img = np.zeros((h, w, 3), np.float32)
    border_img[ring] = border_rgb
    return _compose(h, w, ppm, sil, outer, ring, labels, design, base, border_img)
