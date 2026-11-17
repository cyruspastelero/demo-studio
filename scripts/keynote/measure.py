"""Pixel and stream measurements for check-cut.py: frames as raw RGB from ffmpeg, the window's
bounding box, pill and highlight detection, MP4 atom order, keyframe times. Stdlib only."""
from __future__ import annotations

import json
import re
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path

W, H = 1920, 1080


@dataclass(frozen=True)
class Frame:
    rgb: bytes

    def px(self, x: int, y: int) -> tuple[int, int, int]:
        i = (min(max(y, 0), H - 1) * W + min(max(x, 0), W - 1)) * 3
        return self.rgb[i], self.rgb[i + 1], self.rgb[i + 2]

    def luma(self, x: int, y: int) -> float:
        r, g, b = self.px(x, y)
        return 0.299 * r + 0.587 * g + 0.114 * b


def grab(video: Path, t: float) -> Frame:
    out = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(video), "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    if len(out) < W * H * 3:
        raise ValueError(f"could not read a 1920x1080 frame at {t:.2f}s from {video.name}")
    return Frame(out[: W * H * 3])


def probe(video: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(video)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def keyframe_times(video: Path) -> list[float]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags",
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
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=size",
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
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(video), "-map", "0:a:0",
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


def _outermost(found: list[int | None], low: bool) -> int | None:
    hits = [v for v in found if v is not None]
    if not hits:
        return None
    return min(hits) if low else max(hits)


def window_box(frame: Frame, threshold: float = 10) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) of the floating window: the outermost sharp edge seen scanning inward along
    several rows and columns. Light UI on the light corner of the background can hide one edge on
    one scan line, so each side takes the outermost of three lines (content edges are always inside)."""
    rows, columns = (300, 500, 700), (260, 1660)
    lefts, rights, tops, bottoms = [], [], [], []
    for y in rows:
        line = [frame.luma(x, y) for x in range(W)]
        lefts.append(edge_scan(line, threshold))
        right = edge_scan(line[::-1], threshold)
        rights.append(None if right is None else W - right)
    for x in columns:
        col = [frame.luma(x, y) for y in range(H)]
        tops.append(edge_scan(col, threshold))
        bottom = edge_scan(col[::-1], threshold)
        bottoms.append(None if bottom is None else H - bottom)
    left, right = _outermost(lefts, True), _outermost(rights, False)
    top, bottom = _outermost(tops, True), _outermost(bottoms, False)
    if None in (left, right, top, bottom) or right - left < 200 or bottom - top < 100:
        return None
    return left, top, right - left, bottom - top


def top_edge(frame: Frame, threshold: float = 10) -> int | None:
    """The window's top edge alone (works while it is still rising, its bottom below the frame)."""
    return _outermost([edge_scan([frame.luma(x, y) for y in range(H)], threshold) for x in (260, 1660)], True)


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


def pill_box(frame: Frame, center_y: float = 962) -> tuple[int, int, int, int] | None:
    """The callout pill under the window: rows of the band y 905 to 1075 (for a pill centred at 962;
    the band follows a look template's pill.center_y) that are mostly near white across x 835 to
    1085 (text breaks the white, so half is enough), then its left and right ends."""
    def bright(x: int, y: int) -> bool:
        return frame.luma(x, y) >= 246

    low, high = max(0, int(center_y) - 57), min(H, int(center_y) + 114)
    rows = [y for y in range(low, high) if sum(bright(x, y) for x in range(835, 1086, 2)) >= 0.4 * 126]
    if not rows:
        return None
    top, bottom = min(rows), max(rows)
    middle = (top + bottom) // 2
    left = next((x for x in range(300, 960) if bright(x, middle)), None)
    right = next((x for x in range(1620, 960, -1) if bright(x, middle)), None)
    if left is None or right is None:
        return None
    return left, top, right - left + 1, bottom - top + 1


def ink_rows(frame: Frame, box: tuple[int, int, int, int], darker_than: float) -> tuple[int, int] | None:
    """(top, bottom) of rows in box holding pixels darker than `darker_than` (text ink)."""
    x0, y0, w, h = box
    rows = [y for y in range(y0, y0 + h) if any(frame.luma(x, y) < darker_than for x in range(x0, x0 + w, 2))]
    return (min(rows), max(rows)) if rows else None


def first_word_box(frame: Frame, band: tuple[int, int], darker_than: float = 120) -> tuple[int, int, int, int] | None:
    """Ink box of the first word on a title line (columns split by a gap of 18 px or more)."""
    y0, y1 = band
    columns = [x for x in range(0, W) if any(frame.luma(x, y) < darker_than for y in range(y0, y1, 2))]
    if not columns:
        return None
    end = columns[0]
    for x in columns[1:]:
        if x - end > 18:
            break
        end = x
    rows = ink_rows(frame, (columns[0], y0, end - columns[0] + 1, y1 - y0), darker_than)
    if not rows:
        return None
    return columns[0], rows[0], end - columns[0] + 1, rows[1] - rows[0] + 1


def mean_abs_diff(a: Frame, b: Frame, step: int = 7) -> float:
    total = count = 0
    for i in range(0, len(a.rgb), 3 * step):
        total += abs(a.rgb[i] - b.rgb[i]) + abs(a.rgb[i + 1] - b.rgb[i + 1])
        count += 2
    return total / max(1, count)
