#!/usr/bin/env python3
"""Template copier, step 1: measure an existing video's look into a draft look template.

Probes the video (ffprobe), finds its scene changes, pulls frames into a scratch folder (every 0.5 s
for the first 20 s, at every scene change, and densely around each one), and measures what a
machine can: the encode, loudness (EBU R128), background colours at the corners and edges, the most
common accent colours, the floating window's rest rectangle and corner radius, zoom count, scale,
duration and easing (from per-frame window width), the window's rise-in time, the pill position,
shot lengths and the ending. It writes:

  <out>/<id>/template.json   draft look (measured values only; the rest falls back to the house look)
  <out>/<id>/source.json     provenance: file name, duration, sha256, size, date. Never the video.
  <out>/<id>/README.md       draft notes for the agent to finish
  <work>/measurements.json   every number, its confidence, which frames it came from, what to fill by eye
  <work>/frames/, <work>/sheets/sheet-NN.png   frames and 4x4 contact sheets to review frame by frame

The reference's frames, logos, words and music stay in <work> (scratch); nothing of it goes into the
template folder. Finish the template with skill demo-template (fonts, pill and box styles by eye),
then check it with template-validate.py.

Usage: template-from-video.py VIDEO [--name NAME] [--out DIR] [--work DIR] [--force]
  --out    templates folder (default <demos root>/_templates: $DEMO_ROOT/_templates, else ./demos/_templates)
  --work   scratch folder (default a new temp folder; printed)
Prints PROGRESS lines and `OUTPUT <template folder>`. Heavy-ish: decodes the video twice at low rate.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import demolib as lib  # noqa: E402
from keynote import look as looks  # noqa: E402
from keynote import measure as m  # noqa: E402
from keynote.easing import cubic_bezier  # noqa: E402

TOOL = "template-from-video"
W, H = m.W, m.H
TRACK_FPS = 4
EARLY_SECONDS, EARLY_STEP = 20.0, 0.5
AROUND_CUT = (-0.4, -0.2, -0.067, 0.067, 0.2, 0.4)
SCENE_THRESHOLD = 0.3
EASES = {"ease-in-out sine": (0.37, 0, 0.63, 1), "ease-in-out cubic": (0.65, 0, 0.35, 1),
         "ease-in-out quad": (0.45, 0, 0.55, 1), "ease-in-out quart": (0.76, 0, 0.24, 1),
         "ease-in-out (CSS)": (0.42, 0, 0.58, 1), "ease (CSS)": (0.25, 0.1, 0.25, 1), "linear": (0, 0, 1, 1)}
BG_POINTS = {"top-left": (40, 40), "top": (960, 40), "top-right": (1880, 40), "left": (40, 540),
             "right": (1880, 540), "bottom-left": (40, 1040), "bottom": (960, 1040), "bottom-right": (1880, 1040)}
FIELD_POINTS = ((307, 216), (1766, 86), (1824, 1060), (96, 1058), (960, 540))  # B2 field centres, clamped


def fail(message: str) -> None:
    sys.exit(f"{TOOL}: {message}")


# ---------------------------------------------------------------- small pure helpers (unit-tested)

def template_id(name: str, sha256: str) -> str:
    """<slug>-<first 6 hex of the file's sha256>, inside the template id pattern."""
    slug = re.sub(r"[^a-z0-9]+", "-", Path(name).stem.lower()).strip("-")[:56].strip("-") or "look"
    if not slug[0].isalnum():
        slug = "look-" + slug
    return f"{slug}-{sha256[:6]}"


def parse_scene_times(showinfo: str) -> list[float]:
    return [float(t) for t in re.findall(r"pts_time:([0-9.]+)", showinfo)]


def frame_times(duration: float, scenes: list[float]) -> list[float]:
    """Every 0.5 s for the first 20 s, each scene change and a few frames either side of it."""
    times = {round(t * EARLY_STEP, 3) for t in range(int(min(duration, EARLY_SECONDS) / EARLY_STEP))}
    for cut in scenes:
        times.add(round(cut, 3))
        times.update(round(cut + d, 3) for d in AROUND_CUT)
    last = max(0.0, duration - 0.05)
    times.add(round(last, 3))
    return sorted(t for t in times if 0 <= t <= last)


def hexcolour(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02X}" for c in rgb)


def median_rgb(samples: list[tuple[int, int, int]]) -> tuple[float, float, float] | None:
    if not samples:
        return None
    return tuple(statistics.median(s[i] for s in samples) for i in range(3))


def saturation(rgb: tuple[int, int, int]) -> tuple[float, float]:
    hi, lo = max(rgb), min(rgb)
    return ((hi - lo) / hi if hi else 0.0), hi / 255


def fit_ease(progress: list[tuple[float, float]]) -> tuple[str, tuple[float, ...], float]:
    """Best named curve for (x, p) samples of a move: (name, bezier, rms error)."""
    best = None
    for name, curve in EASES.items():
        ease = cubic_bezier(*curve)
        err = (sum((ease(x) - p) ** 2 for x, p in progress) / max(1, len(progress))) ** 0.5
        if best is None or err < best[2]:
            best = (name, curve, round(err, 4))
    return best


# ---------------------------------------------------------------- ffmpeg

def probe(video: Path) -> dict:
    info = m.probe(video)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if not v:
        fail(f"{video.name} has no video stream")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    num, den = (int(x) for x in v.get("r_frame_rate", "30/1").split("/"))
    return {"duration": float(info["format"]["duration"]), "width": v["width"], "height": v["height"],
            "fps": round(num / den, 3) if den else 30.0, "video": {k: v.get(k) for k in (
                "codec_name", "profile", "pix_fmt", "color_primaries", "color_transfer", "color_space", "bit_rate")},
            "audio": {k: a.get(k) for k in ("codec_name", "sample_rate", "channels", "bit_rate")} if a else None,
            "bit_rate": info["format"].get("bit_rate")}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def scene_changes(video: Path, threshold: float, crop: list[int] | None = None) -> list[float]:
    """Scene changes over the whole frame, or inside `crop` [x, y, w, h] (1920x1080 px): a cut inside
    a floating window changes too little of the full frame to register."""
    region = ""
    if crop:
        x, y, w, h = crop
        region = f"scale={W}:{H},crop={w}:{h}:{x}:{y},"
    result = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-an", "-vf",
                             f"{region}scale=480:-2,select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
                            capture_output=True, text=True)
    return parse_scene_times(result.stderr)


def merge_times(a: list[float], b: list[float], gap: float = 0.25) -> list[float]:
    out: list[float] = []
    for t in sorted(a + b):
        if not out or t - out[-1] > gap:
            out.append(t)
    return out


def frames_at(video: Path, start: float, seconds: float, fps: float):
    """Yields (t, measure.Frame) at `fps` over [start, start + seconds], scaled to 1920x1080."""
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, start):.3f}", "-t", f"{seconds:.3f}", "-i", str(video),
           "-an", "-vf", f"fps={fps},scale={W}:{H}:flags=bicubic", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size, n = W * H * 3, 0
    try:
        while True:
            chunk = proc.stdout.read(size)
            if len(chunk) < size:
                break
            yield max(0.0, start) + n / fps, m.Frame(chunk)
            n += 1
    finally:
        proc.stdout.close()
        proc.wait()


def extract_stills(video: Path, times: list[float], folder: Path) -> list[dict]:
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for i, t in enumerate(times, 1):
        path = folder / f"f{i:04d}.png"
        lib.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
                 "-vf", "scale=1280:720:flags=bicubic", path])
        out.append({"file": path.name, "t": t})
        if i % 20 == 0 or i == len(times):
            lib.progress("frames", i, len(times))
    return out


def contact_sheets(frames: list[dict], folder: Path, sheets: Path) -> list[dict]:
    """4x4 sheets of 480x270 tiles, in time order; returns which frame and time each tile holds."""
    sheets.mkdir(parents=True, exist_ok=True)
    out = []
    for k in range(0, len(frames), 16):
        group = frames[k:k + 16]
        name = f"sheet-{k // 16 + 1:02d}.png"
        lib.run(["ffmpeg", "-y", "-v", "error", "-start_number", str(k + 1), "-i", folder / "f%04d.png",
                 "-frames:v", "1", "-vf", f"scale=480:270,tile=4x4:nb_frames={len(group)}:padding=0", sheets / name])
        out.append({"sheet": name, "tiles": [{"tile": i + 1, "file": f["file"], "t": f["t"]}
                                             for i, f in enumerate(group)]})
    return out


def loudness(video: Path, has_audio: bool) -> dict | None:
    if not has_audio:
        return None
    from narration.mix import ebur128
    levels = ebur128(video)
    series = m.momentary(video)
    silent_tail = 0.0
    for t, v in reversed(series):
        if v == v and v > -50:  # not NaN and audible
            break
        silent_tail = series[-1][0] - t
    return {"integrated": levels["I"], "true_peak": levels["TP"], "range": levels["LRA"],
            "silent_tail": round(silent_tail, 2)}


# ---------------------------------------------------------------- measuring

def track(video: Path, duration: float) -> list[dict]:
    """Per tracked frame: window box, pill box, background and saturated-colour samples."""
    rows = []
    total = int(duration * TRACK_FPS)
    for n, (t, frame) in enumerate(frames_at(video, 0.0, duration, TRACK_FPS)):
        box = m.window_box(frame)
        inside = (lambda x, y: box and box[0] - 30 <= x <= box[0] + box[2] + 30
                  and box[1] - 30 <= y <= box[1] + box[3] + 60)
        colours = []
        for y in range(8, H, 24):
            for x in range(8, W, 24):
                rgb = frame.px(x, y)
                s, v = saturation(rgb)
                if s >= 0.45 and v >= 0.35:
                    colours.append((rgb, bool(inside(x, y))))
        rows.append({"t": round(t, 3), "box": box, "pill": m.pill_box(frame) if box else None,
                     "top": m.top_edge(frame), "luma": round(sum(frame.luma(x, y) for x in range(0, W, 96)
                                                                for y in range(0, H, 96)) / 240, 1),
                     "bg": {k: frame.px(*p) for k, p in BG_POINTS.items() if not inside(*p)},
                     "fields": [frame.px(*p) if not inside(*p) else None for p in FIELD_POINTS],
                     "colours": colours})
        if (n + 1) % 40 == 0 or n + 1 == total:
            lib.progress("track", min(n + 1, total), total)
    return rows


def rest_window(rows: list[dict]) -> tuple[list[int] | None, int]:
    boxes = [tuple(r["box"]) for r in rows if r["box"]]
    if not boxes:
        return None, 0
    buckets: dict[tuple, int] = {}
    for b in boxes:
        key = tuple(round(v / 4) * 4 for v in b)
        buckets[key] = buckets.get(key, 0) + 1
    key, _ = max(buckets.items(), key=lambda kv: kv[1])
    near = [b for b in boxes if all(abs(a - c) <= 6 for a, c in zip(b, key))]
    return [round(statistics.median(b[i] for b in near)) for i in range(4)], len(near)


def window_radius(video: Path, rows: list[dict], rect: list[int], count: int = 9) -> float:
    """Median corner radius over several rest frames (light UI in a light corner misleads one frame)."""
    at_rest = [r["t"] for r in rows if r["box"] and all(abs(a - b) <= 2 for a, b in zip(r["box"], rect))]
    picks = at_rest[:: max(1, len(at_rest) // count)][:count]
    values = []
    for t in picks:
        frame = next((f for _, f in frames_at(video, t, 0.2, 5)), None)
        if frame is None:
            continue
        values += [v for v in (m.corner_radius(frame, tuple(rect)), m.corner_radius(frame, tuple(rect), bottom=True))
                   if v == v]
    return round(statistics.median(values), 1) if values else float("nan")


def window_shot_max(rows: list[dict], scenes: list[float], zooms: list[dict], duration: float) -> float | None:
    """P2: the longest stretch of window footage with no cut and no zoom."""
    marks = sorted({0.0, duration, *scenes, *(z["start"] for z in zooms), *(z["end"] for z in zooms)})
    spans = []
    for a, b in zip(marks, marks[1:]):
        mid = min(rows, key=lambda r: abs(r["t"] - (a + b) / 2)) if rows else None
        if mid and mid["box"]:
            spans.append(b - a)
    return round(max(spans), 2) if spans else None


def zoom_events(rows: list[dict], rest_w: float) -> list[dict]:
    events, current = [], []
    for r in rows:
        if r["box"] and r["box"][2] > rest_w * 1.025:
            current.append(r)
        elif current:
            events.append(current)
            current = []
    if current:
        events.append(current)
    out = []
    for ev in events:
        if len(ev) < 2:
            continue
        peak = max(e["box"][2] for e in ev)
        out.append({"start": ev[0]["t"], "end": ev[-1]["t"], "peak_width": peak, "scale": round(peak / rest_w, 3)})
    return out


def zoom_curve(video: Path, event: dict, rest_w: float, fps: float) -> dict | None:
    """Per-frame window width over the first zoom-in: duration and the best-fitting easing curve."""
    start = max(0.0, event["start"] - 1.6)
    widths = [(t, (m.window_box(f) or (0, 0, 0, 0))[2]) for t, f in frames_at(video, start, 3.6, fps)]
    widths = [(t, w) for t, w in widths if w]
    if len(widths) < 10:
        return None
    peak = max(w for _, w in widths)
    if peak - rest_w < 20:
        return None
    moving = [i for i, (_, w) in enumerate(widths) if rest_w + 2 < w < peak - 2]
    if not moving:
        return None
    a = max(0, moving[0] - 1)
    b = next((i for i in range(moving[0], len(widths)) if widths[i][1] >= peak - 2), moving[-1] + 1)
    b = min(b, len(widths) - 1)
    span = widths[b][0] - widths[a][0]
    if span <= 0:
        return None
    samples = [((t - widths[a][0]) / span, (w - rest_w) / (peak - rest_w)) for t, w in widths[a:b + 1]]
    name, curve, err = fit_ease(samples)
    start_t, dur = fit_timing(widths, a, b, span, rest_w, peak, curve, fps)
    return {"dur": round(dur, 2), "start": round(start_t, 3), "ease": list(curve), "ease_name": name,
            "fit_rms": err, "per_frame": [[round(x, 3), round(p, 3)] for x, p in samples]}


def fit_timing(widths: list[tuple[float, int]], a: int, b: int, span: float, rest_w: float, peak: float,
               curve: tuple[float, ...], fps: float) -> tuple[float, float]:
    """(start, duration) of the move. The first and last frames of an eased move sit within a pixel of
    rest or peak, so the span between visibly moving frames is short; fit both against every frame
    around the move instead."""
    around = [(t, (w - rest_w) / (peak - rest_w)) for t, w in widths[max(0, a - 6):min(len(widths), b + 7)]]
    ease = cubic_bezier(*curve)
    best = (float("inf"), widths[a][0], span)
    for i in range(-8, 5):
        t0 = widths[a][0] + i / (4 * fps)
        for k in range(0, 41):
            dur = span + k * 0.01
            error = sum((ease(min(1.0, max(0.0, (t - t0) / dur))) - p) ** 2 for t, p in around)
            if error < best[0]:
                best = (error, t0, dur)
    return best[1], best[2]


def window_entry(video: Path, rows: list[dict], rect: list[int], fps: float) -> dict | None:
    """Time the window's top edge takes from below frame (not on screen yet) to rest, at the first
    tracked frame where the window sits at its rest rectangle."""
    first = next((r["t"] for r in rows if r["box"] and all(abs(a - b) <= 6 for a, b in zip(r["box"], rect))), None)
    if first is None:
        return None
    rest_y = rect[1]
    tops = [(t, H if top is None else top) for t, f in frames_at(video, max(0.0, first - 1.5), 1.8, fps)
            for top in [m.top_edge(f)]]
    arrive = next((t for t, top in tops if top == rest_y), None)  # ease-out: the last px land late
    if arrive is None:
        return None
    below = [t for t, top in tops if t < arrive and top >= rest_y + 0.8 * (H - rest_y)]
    if not below:
        return {"seconds": 0.0, "at": round(arrive, 2), "tops": []}
    return {"seconds": round(arrive - below[-1], 2), "at": round(below[-1], 2),
            "tops": [[round(t, 3), top] for t, top in tops]}


def accent_colours(rows: list[dict]) -> list[dict]:
    buckets: dict[tuple, list] = {}
    for r in rows:
        for rgb, inside in r["colours"]:
            key = tuple(c // 24 for c in rgb)
            buckets.setdefault(key, []).append((rgb, inside))
    total = sum(len(v) for v in buckets.values()) or 1
    out = []
    for key, items in sorted(buckets.items(), key=lambda kv: -len(kv[1]))[:8]:
        rgb = median_rgb([i[0] for i in items])
        out.append({"colour": hexcolour(rgb), "share": round(len(items) / total, 3),
                    "inside_window": round(sum(1 for i in items if i[1]) / len(items), 2)})
    return out


def background(rows: list[dict]) -> dict:
    points = {k: median_rgb([r["bg"][k] for r in rows if k in r["bg"] and r["luma"] > 90]) for k in BG_POINTS}
    fields = [median_rgb([r["fields"][i] for r in rows if r["fields"][i] and r["luma"] > 90])
              for i in range(len(FIELD_POINTS))]
    edges = [points[k] for k in ("top", "left", "right", "bottom") if points[k]]
    return {"samples": {k: hexcolour(v) for k, v in points.items() if v},
            "fields": [hexcolour(f) if f else None for f in fields],
            "base": hexcolour(median_rgb(edges)) if edges else None}


def moments(rows: list[dict], zooms: list[dict], duration: float, rest_w: float = 0) -> dict:
    """Reference times for the side-by-side check: title, window at rest, zoom peak, pill, end card, outro."""
    first_box = next((r["t"] for r in rows if r["box"]), None)
    rest = next((r["t"] for r in rows if r["box"] and first_box is not None and r["t"] >= first_box + 1.0
                 and not any(z["start"] - 1.2 <= r["t"] <= z["end"] + 1.2 for z in zooms)), first_box)
    pill = next((r["t"] for r in rows if r["pill"] and r["box"] and r["box"][2] <= 1.02 * rest_w
                 and (first_box is None or r["t"] >= first_box + 1.0)), None)
    last_box = max((r["t"] for r in rows if r["box"] and r["box"][2] >= 0.9 * rest_w and r["luma"] > 120),
                   default=None)
    end_card = next((r["t"] for r in rows if last_box is not None and r["t"] > last_box + 1.5 and r["luma"] > 120), None)
    return {"hero": min(0.95, duration / 4) if (first_box is None or first_box > 1.0) else None,
            "rest": rest, "zoom": round((zooms[0]["start"] + zooms[0]["end"]) / 2, 2) if zooms else None,
            "pill": pill, "end_card": end_card, "outro": round(max(0.0, duration - 0.5), 2)}


def shot_lengths(scenes: list[float], duration: float) -> list[float]:
    marks = [0.0, *scenes, duration]
    return [round(b - a, 2) for a, b in zip(marks, marks[1:]) if b - a > 0.05]


def window_cuts(rows: list[dict], scenes: list[float]) -> str:
    """inside-window when the window is on screen on both sides of most scene changes."""
    def boxed(t: float) -> bool:
        r = min(rows, key=lambda row: abs(row["t"] - t))
        return bool(r["box"])
    both = [s for s in scenes if boxed(s - 0.3) and boxed(s + 0.3)]
    either = [s for s in scenes if boxed(s - 0.3) or boxed(s + 0.3)]
    if not either:
        return "cut"
    return "inside-window" if len(both) >= 0.5 * len(either) else "cut"


# ---------------------------------------------------------------- output

def draft_look(meas: dict) -> tuple[dict, list[str]]:
    """The measured values as a look, plus the fields left for the agent to fill by eye."""
    look: dict = {}
    todo = ["title.font (compare glyphs against bundled Inter and Geist)", "title.size, title.weight, title.tracking",
            "title.reveal and title.accent_word", "pill.radius, pill.font_size, pill.kinds",
            "highlight.* (stroke, radius, pad, delay, fill and halo)", "brand.ink, brand.secondary",
            "brand.sweep and brand.dark (from the outro frames)", "window.shadow"]
    w = meas.get("window") or {}
    if w.get("rect"):
        look["window"] = {"rect": w["rect"]}
        if w.get("radius") and w["radius"] == w["radius"]:
            look["window"]["radius"] = round(w["radius"])
    else:
        todo.append("window.rect and window.radius (no floating window found automatically)")
    z = meas.get("zoom") or {}
    if z.get("events"):
        look["zoom"] = {"scale": round(statistics.median(e["scale"] for e in z["events"]), 3)}
        if z.get("curve"):
            look["zoom"].update({"dur": z["curve"]["dur"], "ease": z["curve"]["ease"]})
    else:
        todo.append("zoom.* (no zooms detected)")
    if (meas.get("pill") or {}).get("center_y"):
        look["pill"] = {"center_y": meas["pill"]["center_y"], "height": meas["pill"]["height"]}
    else:
        todo.append("pill.center_y and pill.height (no white pill found under the window)")
    bg = meas.get("background") or {}
    if bg.get("base") and all(bg.get("fields") or [None]):
        look["brand"] = {"background": {"base": bg["base"], "fields": bg["fields"]}}
    else:
        todo.append("brand.background (base and five fields)")
    accents = [a for a in meas.get("accents", []) if a["share"] >= 0.05]
    if accents:
        look.setdefault("brand", {})["accent"] = accents[0]["colour"]
        todo.append("brand.accent: check the measured accent is the title/box colour, not the product's UI")
    entry = meas.get("window_entry")
    transitions = {"cut": meas.get("cut_style", "inside-window")}
    if entry:
        transitions["window_in"] = entry["seconds"]
    look["transitions"] = transitions
    longest = meas.get("window_shot_max")
    if longest:
        look["pacing"] = {"shot_max": max(2.0, min(30.0, round(longest + 0.5, 1)))}
    audio = meas.get("loudness")
    if audio and audio["integrated"] == audio["integrated"]:
        look["audio"] = {"lufs": round(audio["integrated"]), "true_peak": max(-6.0, min(0.0, round(audio["true_peak"], 1))),
                         "outro_silence": round(min(10.0, audio["silent_tail"]), 1)}
        todo.append("audio.music_gap_db (listen: how far the music sits under the voice)")
    end = meas.get("ending") or {}
    look["end"] = {"kind": end.get("kind", "card")}
    return look, todo


def write_readme(folder: Path, template_id: str, name: str, meas: dict, todo: list[str]) -> None:
    lines = [f"# {name}", "", f"Look template `{template_id}`, measured with `template-from-video.py` on "
             f"{datetime.date.today().isoformat()}. Draft: finish it with skill `demo-template`.", "",
             "A template holds measurements of a style (geometry, timing, colours, loudness). It holds no",
             "footage, logos, words or music from the video it was measured on.", "", "## Use it", "",
             f'Set `"template": "{template_id}"` in a demo\'s demo.json, then build as usual.', "",
             "## Measured automatically", ""]
    for key in ("window", "zoom", "pill", "window_entry", "cut_style", "loudness", "ending"):
        if meas.get(key) is not None:
            value = meas[key]
            if isinstance(value, dict):
                value = {k: v for k, v in value.items() if k not in ("per_frame", "tops", "events")}
            lines.append(f"- {key}: `{json.dumps(value)}`")
    lines += ["", "## Filled by eye", ""] + [f"- [ ] {t}" for t in todo] + [""]
    (folder / "README.md").write_text("\n".join(lines))


def default_out() -> Path:
    root = Path(os.environ["DEMO_ROOT"]) if os.environ.get("DEMO_ROOT") else Path.cwd() / "demos"
    return root / "_templates"


def main() -> None:
    parser = argparse.ArgumentParser(prog="template-from-video.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("video")
    parser.add_argument("--name", help="human name for the template (default: from the file name)")
    parser.add_argument("--out", help="templates folder (default <demos root>/_templates)")
    parser.add_argument("--work", help="scratch folder for frames, sheets and measurements.json")
    parser.add_argument("--threshold", type=float, default=SCENE_THRESHOLD, help="scene-change threshold (0.3)")
    parser.add_argument("--force", action="store_true", help="replace the draft if the template folder exists")
    args = parser.parse_args()
    lib.require("ffmpeg", "ffprobe")
    video = Path(args.video).expanduser().resolve()
    if not video.is_file():
        fail(f"video not found: {video}")
    info = probe(video)
    digest = sha256(video)
    name = args.name or Path(video.name).stem.replace("_", " ").replace("-", " ").strip() or "Copied look"
    tid = template_id(args.name or video.name, digest)
    out_root = Path(args.out).expanduser().resolve() if args.out else default_out().resolve()
    folder = out_root / tid
    if folder.is_symlink():
        fail(f"{folder} is a symlink; refusing to write through it")
    if folder.exists() and not args.force:
        fail(f"{folder} exists. Pass --force to redo the draft, or delete the folder first")
    work = Path(args.work).expanduser().resolve() if args.work else Path(tempfile.mkdtemp(prefix=f"demo-template-{tid}-"))
    if work == folder or folder in work.parents:
        fail("--work must be outside the template folder (frames of the reference never go into a template)")
    work.mkdir(parents=True, exist_ok=True)
    print(f"{TOOL}: {video.name}: {info['width']}x{info['height']} at {info['fps']} fps, {info['duration']:.1f}s; "
          f"id {tid}; scratch {work}", flush=True)

    scenes = scene_changes(video, args.threshold)
    print(f"scenes: {len(scenes)} change(s)", flush=True)
    stills = extract_stills(video, frame_times(info["duration"], scenes), work / "frames")
    sheets = contact_sheets(stills, work / "frames", work / "sheets")
    rows = track(video, info["duration"])
    rect, rest_frames = rest_window(rows)
    meas: dict = {"tool": TOOL, "video": video.name, "probe": info, "scenes": scenes,
                  "shots": shot_lengths(scenes, info["duration"]), "frames": stills, "sheets": sheets}
    zooms = []
    if rect:
        radius = window_radius(video, rows, rect)
        meas["window"] = {"rect": rect, "radius": radius, "rest_frames": rest_frames,
                          "confidence": round(rest_frames / max(1, sum(1 for r in rows if r["box"])), 2)}
        zooms = zoom_events(rows, rect[2])
        curve = zoom_curve(video, zooms[0], rect[2], info["fps"]) if zooms else None
        meas["zoom"] = {"count": len(zooms), "events": zooms, "curve": curve}
        meas["window_entry"] = window_entry(video, rows, rect, info["fps"])
        # UI-to-UI cuts inside the window change less than a full-frame cut: half the threshold there.
        inside = [t for t in scene_changes(video, args.threshold / 2, rect)
                  if any(r["box"] for r in rows if abs(r["t"] - t) <= 0.3)]
        scenes = merge_times(scenes, inside)
        meas["scenes"], meas["shots"] = scenes, shot_lengths(scenes, info["duration"])
        meas["scenes_inside_window"] = len(inside)
        # Only with the window at rest: a zoomed window reaches into the pill band and reads as white rows.
        pills = [r["pill"] for r in rows if r["pill"] and all(abs(a - b) <= 6 for a, b in zip(r["box"], rect))]
        if pills:
            meas["pill"] = {"center_y": round(statistics.median(p[1] + p[3] / 2 for p in pills)),
                            "height": round(statistics.median(p[3] for p in pills)), "seen": len(pills)}
        meas["cut_style"] = window_cuts(rows, scenes)
    meas["background"] = background(rows)
    meas["accents"] = accent_colours(rows)
    meas["loudness"] = loudness(video, info["audio"] is not None)
    tail = [r for r in rows if r["t"] >= info["duration"] - 3.0]
    dark_tail = bool(tail) and statistics.median(r["luma"] for r in tail) < 70
    meas["ending"] = {"kind": "sweep-logo" if dark_tail else "card", "tail_luma": [r["luma"] for r in tail]}
    meas["window_shot_max"] = window_shot_max(rows, meas["scenes"], zooms, info["duration"]) if rect else None
    meas["moments"] = moments(rows, zooms, info["duration"], rect[2] if rect else 0)
    look, todo = draft_look(meas)
    meas["to_fill_by_eye"] = todo

    folder.mkdir(parents=True, exist_ok=True)
    (folder / "preview").mkdir(exist_ok=True)
    template = {"id": tid, "name": name[:80], "description": "Draft look measured from a reference video; finish "
                "it with skill demo-template.", "created": datetime.date.today().isoformat(), "source": "copied",
                "look": look}
    errors = lib.validate(template, "template")
    if errors:
        fail("draft template does not match the schema (a measuring bug):\n  " + "\n  ".join(errors))
    (folder / "template.json").write_text(json.dumps(template, indent=2) + "\n")
    (folder / "source.json").write_text(json.dumps({
        "file": video.name, "duration": round(info["duration"], 3), "sha256": digest,
        "created": datetime.date.today().isoformat(), "width": info["width"], "height": info["height"],
        "fps": info["fps"], "tool": TOOL}, indent=2) + "\n")
    write_readme(folder, tid, name, meas, todo)
    (work / "measurements.json").write_text(json.dumps(meas, indent=2, default=list) + "\n")
    effective = looks.effective(look)
    print(f"measured: window {effective['window']['rect']}, zooms {len(zooms)} at {effective['zoom']['scale']}x "
          f"over {effective['zoom']['dur']}s, pill y {effective['pill']['center_y']}, "
          f"loudness {look.get('audio', {}).get('lufs', 'n/a')} LUFS, end {look['end']['kind']}", flush=True)
    print(f"review: {len(sheets)} contact sheet(s) in {work / 'sheets'}; measurements {work / 'measurements.json'}\n"
          f"fill by eye: {len(todo)} item(s), listed in {folder / 'README.md'}\n"
          f"next: python3 -I {Path(__file__).resolve().parent / 'template-validate.py'} {tid} --templates {out_root} "
          f"--reference {video} --measurements {work / 'measurements.json'} --work {work / 'validate'}", flush=True)
    lib.output(folder)


if __name__ == "__main__":
    main()
