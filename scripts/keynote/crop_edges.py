"""Crop edges that slice through text (check-cut.py W10).

The window shows each scene's crop, widened to the window's shape by the engine (model.fit_crop).
Where an edge of that crop runs through a line of text, the viewer sees half-letters at the window's
edge. A thin strip just inside each edge is read from the raw take: text there flips between ink and
page many times along the strip, a clean edge (a gap, a border, a flat panel) hardly at all.
Edges that lie on the take's own edge are skipped: the page simply ends there. Stdlib only."""
from __future__ import annotations

import statistics
import subprocess
from dataclasses import dataclass
from pathlib import Path

from . import spec
from .measure import PROTOCOLS
from .model import fit_crop
from .spec import Rect

CONTRAST = 45    # luma levels from the strip's median that count as ink
INSET = 1        # px inside the crop edge where the strip runs
SIDE_MIN = 4     # changes along a left or right edge that mean a line of text is cut
ACROSS_MIN = 12  # changes along a top or bottom edge (a cut line of text crosses many letters)
EDGES = ("top", "bottom", "left", "right")


@dataclass(frozen=True)
class Gray:
    """One grey (luma) frame of a raw take, at the take's own size."""
    data: bytes
    w: int
    h: int

    def row(self, y: int, x0: int, x1: int) -> list[int]:
        return list(self.data[y * self.w + x0: y * self.w + x1])

    def column(self, x: int, y0: int, y1: int) -> list[int]:
        return [self.data[y * self.w + x] for y in range(y0, y1)]


def grab_gray(video: Path, t: float, size: tuple[int, int]) -> Gray:
    """The take's frame at t seconds as luma, at its own size (any resolution)."""
    w, h = size
    out = subprocess.run(["ffmpeg", *PROTOCOLS, "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(video),
                          "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    if len(out) < w * h:
        raise ValueError(f"could not read a {w}x{h} frame at {t:.2f}s from {Path(video).name}")
    return Gray(out[: w * h], w, h)


def window_crop(crop: Rect, size: tuple[int, int], aspect: float) -> Rect:
    """The crop as the window shows it: model.fit_crop with the look's window shape (w / h)."""
    house = spec.WINDOW_ASPECT
    spec.WINDOW_ASPECT = aspect
    try:
        return fit_crop(crop, size)
    finally:
        spec.WINDOW_ASPECT = house


def transitions(strip: list[int]) -> int:
    """How often a strip flips between page and ink (ink: CONTRAST levels from the strip's median)."""
    if len(strip) < 3:
        return 0
    middle = statistics.median(strip)
    ink = [abs(v - middle) > CONTRAST for v in strip]
    return sum(1 for a, b in zip(ink, ink[1:]) if a != b)


def edge_strips(frame: Gray, crop: Rect) -> dict[str, list[int]]:
    """The strip just inside each crop edge, leaving out edges that lie on the take's own edge."""
    x0, y0 = max(0, round(crop.x)), max(0, round(crop.y))
    x1, y1 = min(frame.w, round(crop.x + crop.w)), min(frame.h, round(crop.y + crop.h))
    strips = {}
    if y0 > 1:
        strips["top"] = frame.row(y0 + INSET, x0, x1)
    if y1 < frame.h - 1:
        strips["bottom"] = frame.row(y1 - 1 - INSET, x0, x1)
    if x0 > 1:
        strips["left"] = frame.column(x0 + INSET, y0, y1)
    if x1 < frame.w - 1:
        strips["right"] = frame.column(x1 - 1 - INSET, y0, y1)
    return strips


def cut_edges(frame: Gray, crop: Rect) -> dict[str, int]:
    """{edge: changes} for each crop edge that runs through text on this frame."""
    found = {}
    for name, strip in edge_strips(frame, crop).items():
        count = transitions(strip)
        if count >= (ACROSS_MIN if name in ("top", "bottom") else SIDE_MIN):
            found[name] = count
    return found


def scan(frames, crop: Rect) -> dict[str, tuple[float, int]]:
    """{edge: (time, changes)} at the worst sampled moment, over (time, Gray) pairs."""
    worst: dict[str, tuple[float, int]] = {}
    for t, frame in frames:
        for name, count in cut_edges(frame, crop).items():
            if count > worst.get(name, (0.0, 0))[1]:
                worst[name] = (t, count)
    return {name: worst[name] for name in EDGES if name in worst}
