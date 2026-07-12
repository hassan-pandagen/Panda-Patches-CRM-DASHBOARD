"""Reduce artwork to N flat thread colors and snap them to the thread chart.

Steps:
  1. k-means over the opaque pixels (RGB space, cv2.kmeans — fast, no sklearn needed)
  2. snap each cluster center to the nearest thread in CIELAB space
  3. merge clusters that landed on the same thread
Returns a label map + the list of thread entries actually used.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass

import cv2
import numpy as np

_CHART_PATH = os.path.join(os.path.dirname(__file__), "threads.json")


@dataclass
class ThreadColor:
    code: str
    name: str
    rgb: tuple  # (r, g, b) 0-255
    coverage: float = 0.0  # fraction of stitched area, filled in later


def _hex_to_rgb(h: str) -> tuple:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_chart(path: str = _CHART_PATH) -> list[ThreadColor]:
    with open(path, "r") as f:
        data = json.load(f)
    return [ThreadColor(t["code"], t["name"], _hex_to_rgb(t["hex"])) for t in data["threads"]]


def _rgb_to_lab(rgb_u8: np.ndarray) -> np.ndarray:
    """rgb_u8: (N,3) uint8 -> (N,3) float32 Lab via OpenCV."""
    img = rgb_u8.reshape(-1, 1, 3).astype(np.uint8)
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
    # OpenCV packs L into 0..255; rescale to 0..100 so deltas behave like real Lab
    lab = lab.reshape(-1, 3)
    lab[:, 0] *= 100.0 / 255.0
    lab[:, 1] -= 128.0
    lab[:, 2] -= 128.0
    return lab


def quantize(rgb: np.ndarray, alpha: np.ndarray, max_colors: int = 8,
             chart: list[ThreadColor] | None = None,
             min_region_frac: float = 0.004):
    """
    rgb:   (H,W,3) uint8
    alpha: (H,W)   uint8
    Returns (labels (H,W) int32 with -1 = transparent, threads: list[ThreadColor])
    """
    chart = chart or load_chart()
    mask = alpha > 128
    pix = rgb[mask].astype(np.float32)
    if pix.size == 0:
        return np.full(rgb.shape[:2], -1, np.int32), []

    # pick k: cap by how many visually distinct colors exist
    sample = pix[np.random.default_rng(7).choice(len(pix), min(len(pix), 40000), replace=False)]
    uniq = np.unique((sample // 24).astype(np.int32), axis=0)  # coarse distinctness probe
    k = int(np.clip(len(uniq), 1, max_colors))

    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 25, 0.5)
    _, lab_idx, centers = cv2.kmeans(pix, k, None, criteria, 4, cv2.KMEANS_PP_CENTERS)
    lab_idx = lab_idx.ravel()

    # drop specks: clusters smaller than min_region_frac of the design get merged
    counts = np.bincount(lab_idx, minlength=k).astype(np.float64) / len(lab_idx)
    keep = counts >= min_region_frac
    if not keep.all() and keep.any():
        big = np.where(keep)[0]
        for small in np.where(~keep)[0]:
            d = np.linalg.norm(centers[big] - centers[small], axis=1)
            lab_idx[lab_idx == small] = big[int(np.argmin(d))]
        remap = {old: new for new, old in enumerate(np.unique(lab_idx))}
        lab_idx = np.vectorize(remap.get)(lab_idx)
        centers = centers[sorted(remap.keys())]
        k = len(centers)

    # snap centers -> nearest thread in Lab
    chart_rgb = np.array([t.rgb for t in chart], np.uint8)
    chart_lab = _rgb_to_lab(chart_rgb)
    centers_lab = _rgb_to_lab(np.clip(centers, 0, 255).astype(np.uint8))
    snap = np.argmin(np.linalg.norm(centers_lab[:, None, :] - chart_lab[None, :, :], axis=2), axis=1)

    # merge clusters that snapped to the same thread
    thread_ids = sorted(set(snap.tolist()))
    cluster_to_slot = {c: thread_ids.index(snap[c]) for c in range(k)}
    slots = np.vectorize(cluster_to_slot.get)(lab_idx)

    labels = np.full(rgb.shape[:2], -1, np.int32)
    labels[mask] = slots

    threads = []
    total = float(slots.size)
    for i, tid in enumerate(thread_ids):
        t = chart[tid]
        threads.append(ThreadColor(t.code, t.name, t.rgb, coverage=float((slots == i).sum()) / total))
    return labels, threads
