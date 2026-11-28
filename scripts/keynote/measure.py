"""Pixel and stream measurements for check-cut.py: frames as raw RGB from ffmpeg, the window's
bounding box, pill and highlight detection, MP4 atom order, keyframe times. Stdlib only."""
from __future__ import annotations

import json
import re
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path

# Same as demolib.PROTOCOL_WHITELIST: media from a demo folder may only be read as local files or
# pipes, never through a URL a crafted file points ffmpeg at. One input per command here.
PROTOCOLS = ("-protocol_whitelist", "file,pipe")

W, H = 1920, 1080


@dataclass(frozen=True)
class Frame:
    """One RGB frame. A cut is 1920x1080 (E2); a raw take may be larger (2880x1620 at DPR 3)."""
    rgb: bytes
    w: int = W
    h: int = H

    def px(self, x: int, y: int) -> tuple[int, int, int]:
        i = (min(max(y, 0), self.h - 1) * self.w + min(max(x, 0), self.w - 1)) * 3
        return self.rgb[i], self.rgb[i + 1], self.rgb[i + 2]

    def luma(self, x: int, y: int) -> float:
        r, g, b = self.px(x, y)
        return 0.299 * r + 0.587 * g + 0.114 * b


def grab(video: Path, t: float, size: tuple[int, int] = (W, H)) -> Frame:
    """The frame at t seconds; `size` is the video's own (w, h): 1920x1080 for a cut, the take's size
    for a raw take."""
    w, h = size
    out = subprocess.run(["ffmpeg", *PROTOCOLS, "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(video), "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    if len(out) < w * h * 3:
        raise ValueError(f"could not read a {w}x{h} frame at {t:.2f}s from {video.name}")
    return Frame(out[: w * h * 3], w, h)


def probe(video: Path) -> dict:
    out = subprocess.run(["ffprobe", *PROTOCOLS, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def keyframe_times(video: Path) -> list[float]:
    out = subprocess.run(["ffprobe", *PROTOCOLS, "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags",
                          "-of", "csv=p=0", str(video)], capture_output=True, text=True, check=True).stdout
    times = []
    for line in out.splitlines():
        parts = line.split(",")
        if len(parts) >= 2 and "K" in parts[1] and parts[0] not in ("", "N/A"):
            times.append(float(parts[0]))
    return sorted(times)


def video_bitrate(video: Path, info: dict) -> float:
    stream = next(s for s in info["streams"] if s["codec_type"] == "video")
    if stream.get("bit_rate"):
        return float(stream["bit_rate"])
    out = subprocess.run(["ffprobe", *PROTOCOLS, "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=size",
                          "-of", "csv=p=0", str(video)], capture_output=True, text=True, check=True).stdout
    size = sum(int(x) for x in out.split() if x.isdigit())
    return size * 8 / float(info["format"]["duration"])


def atom_order(video: Path) -> list[str]:
    """Top-level MP4 box names in file order (moov before mdat means faststart)."""
    names = []
    with open(video, "rb") as handle:
        while True:
            header = handle.read(8)
            if len(header) < 8:
                break
            size, name = struct.unpack(">I4s", header)
            if size == 1:
                size = struct.unpack(">Q", handle.read(8))[0]
                handle.seek(size - 16, 1)
            elif size == 0:
                names.append(name.decode("latin-1"))
                break
            else:
                handle.seek(size - 8, 1)
            names.append(name.decode("latin-1"))
    return names


MOMENTARY_LINE = re.compile(r"\bt:\s*(?P<t>-?[\d.]+).*?\bM:\s*(?P<m>-?(?:[\d.]+|inf)|nan)")


def parse_momentary(stderr: str) -> list[tuple[float, float]]:
    """(time, momentary LUFS) from ffmpeg ebur128's per-frame lines. ffmpeg pads the value after
    `M:` with spaces only when it is short, so silence prints `M:-120.7` with no space; -inf and nan
    come through as floats."""
    series = []
    for line in stderr.splitlines():
        if "Parsed_ebur128" not in line:
            continue
        match = MOMENTARY_LINE.search(line)
        if match:
            series.append((float(match["t"]), float(match["m"])))
    return series


def momentary(video: Path) -> list[tuple[float, float]]:
    """(time, momentary LUFS) every 0.1 s from ffmpeg ebur128."""
    result = subprocess.run(["ffmpeg", *PROTOCOLS, "-hide_banner", "-nostats", "-i", str(video), "-map", "0:a:0",
                             "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    return parse_momentary(result.stderr)


def edge_scan(values: list[float], threshold: float) -> int | None:
    """Index of the first sharp edge: the first place |v[i+2] - v[i]| >= threshold, refined to the
    steepest step within the next 6 px (a soft shadow crosses the threshold a pixel or two early)."""
    for i in range(len(values) - 2):
        if abs(values[i + 2] - values[i]) >= threshold:
            window = range(i, min(len(values) - 1, i + 7))
            return max(window, key=lambda j: abs(values[j + 1] - values[j])) + 1
    return None


def edges(values: list[float], threshold: float) -> list[int]:
    """Every sharp edge along a line, in order (edge_scan repeated past each one found)."""
    found, start = [], 0
    while start < len(values) - 2:
        hit = edge_scan(values[start:], threshold)
        if hit is None:
            break
        found.append(start + hit)
        start += hit + 4
    return found


def _outermost(found: list[int | None], low: bool) -> int | None:
    hits = [v for v in found if v is not None]
    if not hits:
        return None
    return min(hits) if low else max(hits)


ROW_FRACTIONS = (0.25, 0.5, 0.75)          # scan rows in the rest window (house: y 300, 500, 700)
COLUMN_FRACTIONS = (80 / 1560, 1480 / 1560)  # scan columns in the rest window (house: x 260, 1660)


def scan_lines(rect: tuple[float, float, float, float] | None) -> tuple[tuple[int, ...], tuple[int, ...]]:
    """(rows, columns) to scan for a window that rests at `rect`: the house lines for the house rect,
    the same places inside any other look's window (None: the house lines)."""
    if rect is None:
        return (300, 500, 700), (260, 1660)
    x, y, w, h = rect
    return (tuple(round(y + h * f) for f in ROW_FRACTIONS), tuple(round(x + w * f) for f in COLUMN_FRACTIONS))


def edge_threshold(frame: Frame, rect: tuple[float, float, float, float], low: float = 4, high: float = 10) -> float:
    """The step that counts as the window's edge on this look and frame: half the contrast between
    the window and the background across its rest edges, on the weaker sides (the lower quartile of
    12 samples), kept to low..high. A white window on a near-white paper field steps only 8 levels
    on one side; the house window steps 20 or more all round, so it keeps the full 10."""
    x, y, w, h = (round(v) for v in rect)
    steps = []
    for k in (0.2, 0.4, 0.6, 0.8):
        cx, cy = x + round(w * k), y + round(h * k)
        steps.append(abs(frame.luma(cx, y + 12) - frame.luma(cx, y - 12)))
        steps.append(abs(frame.luma(x + 12, cy) - frame.luma(x - 12, cy)))
        steps.append(abs(frame.luma(x + w - 12, cy) - frame.luma(x + w + 12, cy)))
    steps.sort()
    return min(high, max(low, steps[len(steps) // 4] / 2))


def window_box(frame: Frame, threshold: float = 10,
               rect: tuple[float, float, float, float] | None = None) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) of the floating window: the outermost sharp edge seen scanning inward along
    several rows and columns. Light UI on the light corner of the background can hide one edge on
    one scan line, so each side takes the outermost of three lines (content edges are always inside).
    `rect` is the look's rest window, so the lines fall inside it (None: the house lines)."""
    rows, columns = scan_lines(rect)
    width, height = frame.w, frame.h
    lefts, rights, tops, bottoms = [], [], [], []
    for y in rows:
        line = [frame.luma(x, y) for x in range(width)]
        lefts.append(edge_scan(line, threshold))
        right = edge_scan(line[::-1], threshold)
        rights.append(None if right is None else width - right)
    for x in columns:
        col = [frame.luma(x, y) for y in range(height)]
        tops.append(edge_scan(col, threshold))
        bottom = edge_scan(col[::-1], threshold)
        bottoms.append(None if bottom is None else height - bottom)
    left, right = _outermost(lefts, True), _outermost(rights, False)
    top, bottom = _outermost(tops, True), _outermost(bottoms, False)
    if None in (left, right, top, bottom) or right - left < 200 or bottom - top < 100:
        return None
    return left, top, right - left, bottom - top


def top_edge(frame: Frame, threshold: float = 10) -> int | None:
    """The window's top edge alone (works while it is still rising, its bottom below the frame)."""
    return _outermost([edge_scan([frame.luma(x, y) for y in range(H)], threshold) for x in (260, 1660)], True)


def rising_top(frame: Frame, rect: tuple[float, float, float, float], threshold: float = 10,
               columns: int = 9, quorum: int = 5, cover: float = 0.7) -> int | None:
    """The rising window's top edge (W6): the highest row where at least `quorum` of `columns`
    evenly spread across the look's rest window see a sharp edge (within 3 px), and the step holds
    along `cover` of the row (a step of half the threshold: a white window on a paper field steps
    only a few levels in places, and none where a light corner of the field matches its top bar).
    The window's top is one long line; the words of a title card still fading out above it are
    broken by the gaps between letters and words (about half the row on real cuts), so they are not
    taken for it."""
    x, _, w, _ = rect
    found = []
    for k in range(columns):
        cx = round(x + w * (0.05 + 0.9 * k / max(1, columns - 1)))
        found.append(edges([frame.luma(cx, y) for y in range(frame.h)], threshold))
    xs = range(round(x + 0.05 * w), round(x + 0.95 * w), 8)
    step = max(3.0, threshold / 2)
    for y in sorted({e for line in found for e in line}):
        if sum(1 for line in found if any(abs(e - y) <= 3 for e in line)) < quorum:
            continue
        steps = sum(1 for cx in xs if abs(frame.luma(cx, y + 2) - frame.luma(cx, y - 3)) >= step)
        if steps >= cover * len(xs):
            return y
    return None


def corner_radius(frame: Frame, box: tuple[int, int, int, int], bottom: bool = False) -> float:
    """Radius estimated along the left corner's diagonal (top or bottom): a circle of radius r meets
    the diagonal at r(1 - 1/sqrt 2) from the corner."""
    x, y, _, h = box
    sign, y0 = (-1, y + h - 1) if bottom else (1, y)
    inside = frame.luma(x + 40, y0 + sign * 40)
    outside = frame.luma(x - 8, y0 - sign * 8)
    for d in range(0, 40):
        value = frame.luma(x + d, y0 + sign * d)
        if abs(value - inside) < abs(value - outside):
            return round(d / 0.2929, 1)
    return float("nan")


def near(color: tuple[int, int, int], target: tuple[int, int, int], tolerance: int) -> bool:
    return all(abs(a - b) <= tolerance for a, b in zip(color, target))


def hex_rgb(value: str) -> tuple[int, int, int]:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


def count_colour(frame: Frame, target: tuple[int, int, int], tolerance: int, box=(0, 0, W, H), step: int = 2) -> int:
    x0, y0, w, h = box
    return sum(1 for y in range(y0, y0 + h, step) for x in range(x0, x0 + w, step)
               if near(frame.px(x, y), target, tolerance))


PILL_FILL_ALPHA = 0.95  # the pill is white at this opacity (scripts/keynote-page.mjs #pill background)


def pill_bright(frame: Frame, center_y: float) -> float:
    """The luma that counts as pill on this frame: the white pill over this look's background, read
    at the pill's row beside it, minus up to 8 levels for the encode. Always between pill and field,
    so a near-white paper field is not taken for a pill and a grey pill on a dark field is found."""
    y = int(center_y)
    field = sorted(frame.luma(x, y) for x in (40, 80, 120, 160, 1760, 1800, 1840, 1880))[3]
    pill = PILL_FILL_ALPHA * 255 + (1 - PILL_FILL_ALPHA) * field
    return pill - min(8.0, max(1.0, (pill - field) / 2))


def _run_start(bright, xs) -> int | None:
    """First x in xs that starts 12 bright px in a row (the pill's end, not a stray light pixel)."""
    xs = list(xs)
    for i, x in enumerate(xs):
        if all(bright(v) for v in xs[i:i + 12]):
            return x
    return None


def pill_box(frame: Frame, center_y: float = 962, bright_from: float = 246,
             height: float | None = None) -> tuple[int, int, int, int] | None:
    """The callout pill: rows of a band around center_y that are mostly bright (>= bright_from)
    across x 835 to 1085 (text breaks the white, so half is enough), then its left and right ends.
    The band is the pill's height plus 20 px each way when the look gives it, else y -57 to +114
    (the house band, 905 to 1075 for a pill centred at 962)."""
    def bright(x: int, y: int) -> bool:
        return frame.luma(x, y) >= bright_from

    if height is None:
        low, high = int(center_y) - 57, int(center_y) + 114
    else:
        low, high = int(center_y - height / 2 - 20), int(center_y + height / 2 + 20)
    low, high = max(0, low), min(frame.h, high)
    rows = [y for y in range(low, high) if sum(bright(x, y) for x in range(835, 1086, 2)) >= 0.4 * 126]
    if not rows:
        return None
    top, bottom = min(rows), max(rows)
    middle = (top + bottom) // 2
    left = _run_start(lambda x: bright(x, middle), range(40, 960))
    right = _run_start(lambda x: bright(x, middle), range(frame.w - 40, 960, -1))
    if left is None or right is None:
        return None
    return left, top, right - left + 1, bottom - top + 1


def is_ink(value: float, threshold: float, light: bool) -> bool:
    """Dark ink on a light look is below the threshold; light ink on a dark look is above it."""
    return value > threshold if light else value < threshold


def ink_rows(frame: Frame, box: tuple[int, int, int, int], darker_than: float,
             light: bool = False) -> tuple[int, int] | None:
    """(top, bottom) of rows in box holding text ink: pixels darker than `darker_than`, or lighter
    than it when `light` (a dark look's light ink)."""
    x0, y0, w, h = box
    rows = [y for y in range(y0, y0 + h)
            if any(is_ink(frame.luma(x, y), darker_than, light) for x in range(x0, x0 + w, 2))]
    return (min(rows), max(rows)) if rows else None


def first_word_box(frame: Frame, band: tuple[int, int], darker_than: float = 120,
                   light: bool = False) -> tuple[int, int, int, int] | None:
    """Ink box of the first word on a title line (columns split by a gap of 18 px or more)."""
    y0, y1 = band
    columns = [x for x in range(0, W) if any(is_ink(frame.luma(x, y), darker_than, light) for y in range(y0, y1, 2))]
    if not columns:
        return None
    end = columns[0]
    for x in columns[1:]:
        if x - end > 18:
            break
        end = x
    rows = ink_rows(frame, (columns[0], y0, end - columns[0] + 1, y1 - y0), darker_than, light)
    if not rows:
        return None
    return columns[0], rows[0], end - columns[0] + 1, rows[1] - rows[0] + 1


def mean_abs_diff(a: Frame, b: Frame, step: int = 7) -> float:
    total = count = 0
    for i in range(0, len(a.rgb), 3 * step):
        total += abs(a.rgb[i] - b.rgb[i]) + abs(a.rgb[i + 1] - b.rgb[i + 1])
        count += 2
    return total / max(1, count)
