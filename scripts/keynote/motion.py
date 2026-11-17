"""Is the UI under a highlight box still? A highlight rect is a fixed source-px rectangle, so if the
page scrolls or reflows while the box is on screen, the box lands on the wrong element or on empty
space (quality bar H8). These helpers read grey patches of the raw take with ffmpeg and compare them.

Two users: build-keynote.py probes every highlight densely before rendering (a warning, an error
under --strict), and check-cut.py samples each box's start, middle and end on the finished plan.
"""
from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from . import spec
from .spec import Rect

CHANGED_LEVEL = 32       # a pixel changed when its grey level moved at least this much
MOVING_FRACTION = 0.20   # the area moved when at least this share of its pixels changed
EMPTY_SPREAD = 3.0       # grey-level standard deviation under which the box holds nothing
CONTEXT_PAD = 48         # px around the rect also compared, so a cursor over a small target reads small
PROBE_STEP = 0.2         # seconds between samples in the build-time probe
MAX_SAMPLES = 20000      # pixels compared per patch (strided above this)


class MotionError(RuntimeError):
    """ffmpeg could not read the take."""


@dataclass(frozen=True)
class Patch:
    """A grey crop of one take frame: the context area, with the highlight rect at (ix, iy, iw, ih)."""
    w: int
    h: int
    gray: bytes
    inner: tuple[int, int, int, int]

    def stride(self, box: tuple[int, int, int, int]) -> int:
        return max(1, int(math.sqrt(box[2] * box[3] / MAX_SAMPLES)))

    def values(self, box: tuple[int, int, int, int] | None = None) -> list[int]:
        x0, y0, w, h = box or (0, 0, self.w, self.h)
        step = self.stride((x0, y0, w, h))
        return [self.gray[y * self.w + x] for y in range(y0, y0 + h, step) for x in range(x0, x0 + w, step)]


def context_box(rect: Rect, size: tuple[int, int]) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    """(context crop in take px, rect inside that crop), both whole px and inside the take."""
    sw, sh = size
    x0 = max(0, int(rect.x) - CONTEXT_PAD)
    y0 = max(0, int(rect.y) - CONTEXT_PAD)
    x1 = min(sw, int(math.ceil(rect.right)) + CONTEXT_PAD)
    y1 = min(sh, int(math.ceil(rect.bottom)) + CONTEXT_PAD)
    ix, iy = int(rect.x) - x0, int(rect.y) - y0
    iw = max(1, min(int(math.ceil(rect.right)) - int(rect.x), x1 - x0 - ix))
    ih = max(1, min(int(math.ceil(rect.bottom)) - int(rect.y), y1 - y0 - iy))
    return (x0, y0, x1 - x0, y1 - y0), (ix, iy, iw, ih)


def changed_fraction(a: Patch, b: Patch) -> float:
    """Share of the context area whose grey level moved by CHANGED_LEVEL or more."""
    va, vb = a.values(), b.values()
    if not va or len(va) != len(vb):
        return 1.0
    return sum(1 for p, q in zip(va, vb) if abs(p - q) >= CHANGED_LEVEL) / len(va)


def spread(patch: Patch) -> float:
    """Grey-level standard deviation inside the highlight rect (near 0 means blank)."""
    values = patch.values(patch.inner)
    mean = sum(values) / len(values)
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))


def _read(take: Path, rect: Rect, size: tuple[int, int], start: float, args: list[str]) -> list[Patch]:
    (x, y, w, h), inner = context_box(rect, size)
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, start):.3f}", "-i", str(take), *args,
           "-vf", f"crop={w}:{h}:{x}:{y},format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode:
        raise MotionError(f"ffmpeg could not read {take.name}: {result.stderr.decode(errors='replace')[-300:]}")
    data, n = result.stdout, w * h
    return [Patch(w, h, data[i:i + n], inner) for i in range(0, len(data) - n + 1, n)]


def patch_at(take: Path, rect: Rect, size: tuple[int, int], t: float) -> Patch:
    """The context patch of one frame at take time t."""
    patches = _read(take, rect, size, t, ["-frames:v", "1"])
    if not patches:
        raise MotionError(f"no frame at {t:.2f}s in {take.name}")
    return patches[0]


def patch_series(take: Path, rect: Rect, size: tuple[int, int], start: float, end: float,
                 step: float = PROBE_STEP) -> list[tuple[float, Patch]]:
    """(take time, patch) every `step` seconds from start to end, from one ffmpeg decode."""
    patches = _read(take, rect, size, start, ["-t", f"{max(step, end - start):.3f}", "-r", f"{1 / step:.4f}"])
    return [(start + i * step, p) for i, p in enumerate(patches)]


def moving_spans(series: list[tuple[float, Patch]]) -> list[tuple[float, float, float]]:
    """(from, to, changed fraction) for each pair of neighbouring samples where the area moved."""
    return [(ta, tb, f) for (ta, a), (tb, b) in zip(series, series[1:])
            if (f := changed_fraction(a, b)) >= MOVING_FRACTION]


FIX = "re-time `at`/`dur` to a still moment or re-measure `rect`"


def highlight_warnings(plan) -> list[str]:
    """Build-time probe: one warning per highlight whose take moves or is blank while the box shows,
    or whose box outlasts its scene. Reads the raw takes (one short decode per highlight)."""
    warnings = []
    for h in plan.highlights:
        shot = plan.shots[h.shot]
        first, last = shot.start / spec.FPS, (shot.start + shot.frames - 1) / spec.FPS
        shown_to = h.end + spec.HIGHLIGHT_OUT
        if shown_to > last + 1 / spec.FPS + 0.01:
            warnings.append(f"{h.where}: the box stays on screen until {shown_to:.2f}s, after its scene ends at "
                            f"{last + 1 / spec.FPS:.2f}s, so it sits over the next clip; shorten `dur` (H8)")
        a, b = max(h.start, first), min(shown_to, last)
        take = lambda t: shot.trim_in + (t - first) * shot.speed  # noqa: E731
        try:
            series = patch_series(shot.source, h.rect, shot.source_size, take(a), take(b), PROBE_STEP * shot.speed)
        except MotionError as error:
            warnings.append(f"{h.where}: could not check the take under the box for motion ({error}) (H8)")
            continue
        scene = lambda take_t: (take_t - shot.trim_in) / shot.speed  # noqa: E731
        moving = moving_spans(series)
        if moving:
            lo, hi = moving[0][0], moving[-1][1]
            worst = max(f for _, _, f in moving)
            warnings.append(f"{h.where}: the take moves under the box (scroll or reflow; {worst:.0%} of the area "
                            f"changes) at scene {scene(lo):.2f} to {scene(hi):.2f}s, while the box shows at scene "
                            f"{a - first:.2f} to {b - first:.2f}s; {FIX} (H8)")
        elif series and spread(series[0][1]) < EMPTY_SPREAD:
            warnings.append(f"{h.where}: the box frames an empty area of the take (rect {list(h.rect)}); "
                            f"{FIX} (H8)")
    return warnings
