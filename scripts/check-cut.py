#!/usr/bin/env python3
"""Runs the docs/quality-bar.md review checklist on a finished cut and prints one line per item:
PASS, FAIL (with the measured value and the bar), or LOOK (needs your eyes: open the frame named).

Usage: check-cut.py CUT.mp4 [--plan PLAN.json] [--frames DIR] [--json OUT.json]
  CUT.mp4    the narrated cut (…-keynote-cut-narrated.mp4) or the silent one
  --plan     build-keynote.py's sidecar; found next to the cut by default (<slug>-keynote-cut.plan.json)
  --frames   also save the checklist's sample frames there as PNGs, to Read one by one
Exit code 0 when nothing FAILs. Needs ffmpeg and ffprobe. Heavy-ish: decodes ~60 frames and the audio.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from keynote import measure as m  # noqa: E402
from keynote import motion, spec  # noqa: E402

REST = (180, 100, 1560, 800)
BG_SAMPLES = {(40, 40): "#EFEFEF", (960, 40): "#E4E4E4", (1880, 40): "#C2CAD6", (40, 1040): "#E0DBDA",
              (1880, 1040): "#E5C9C8", (320, 240): "#FAF7F6"}


class Report:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, status: str, item: str, text: str) -> None:
        self.rows.append({"status": status, "item": item, "text": text})
        print(f"{status:<5} {item:<6} {text}", flush=True)

    def check(self, ok: bool, item: str, text: str) -> None:
        self.add("PASS" if ok else "FAIL", item, text)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.rows if r["status"] == "FAIL")


def find_plan(cut: Path, given: str | None) -> tuple[Path, dict]:
    path = Path(given) if given else cut.with_name(re.sub(r"-narrated$", "", cut.stem) + ".plan.json")
    if not path.exists():
        sys.exit(f"check-cut: no plan file {path}. Build the cut with build-keynote.py first, or pass --plan.")
    return path.resolve(), json.loads(path.read_text())


OLD_HIGHLIGHT = "#E2483C"  # what plans built before the brand-coloured boxes drew


def brand_colours(plan: dict) -> tuple[str, tuple[str, str]]:
    """(accent, (sweep from, sweep to)) the cut was built with; quality-bar defaults for old plans."""
    brand = plan.get("brand") or {}
    sweep = brand.get("sweep") or [spec.SWEEP_FROM, spec.SWEEP_TO]
    return brand.get("accent", spec.ACCENT), (sweep[0], sweep[1])


def overlay_colours(plan: dict) -> tuple[str, str | None]:
    """(highlight stroke, statement-pill text) the cut was drawn with: the product's accent (or
    neutral ink) from plan.json. Old plans: the old red stroke and no pill colour to check."""
    brand = plan.get("brand") or {}
    return brand.get("highlight", OLD_HIGHLIGHT), brand.get("pill")


def find_voice(cut: Path) -> dict | None:
    path = cut.with_suffix(".voice.json")
    return json.loads(path.read_text()) if path.exists() else None


def check_streams(r: Report, cut: Path) -> dict:
    info = m.probe(cut)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    if not v:
        r.check(False, "E1", "no video stream")
        return info
    tags = (v.get("color_primaries"), v.get("color_transfer"), v.get("color_space"), v.get("color_range"))
    level = v.get("level", 0)
    r.check(v["codec_name"] == "h264" and v.get("profile") == "High" and level in (40, 41), "E1",
            f"{v['codec_name']} {v.get('profile')} level {level / 10:.1f} (bar: H.264 High 4.0/4.1)")
    r.check((v["width"], v["height"], v["r_frame_rate"]) == (1920, 1080, "30/1"), "E2",
            f"{v['width']}x{v['height']} at {v['r_frame_rate']} (bar: 1920x1080, 30/1)")
    r.check(v["pix_fmt"] == "yuv420p" and tags == ("bt709", "bt709", "bt709", "tv"), "E3",
            f"{v['pix_fmt']}, primaries/transfer/matrix/range {'/'.join(map(str, tags))} (bar: yuv420p, bt709 x3, tv)")
    rate = m.video_bitrate(cut, info) / 1e6
    r.check(rate >= 3.5, "E4", f"video {rate:.2f} Mbps (bar: >= 3.5)")
    keys = m.keyframe_times(cut)
    gaps = [b - a for a, b in zip(keys, keys[1:])]
    r.check(bool(gaps) and all(abs(g - 2.0) < 0.04 for g in gaps[:-1]), "E5",
            f"{len(keys)} keyframes, gaps {min(gaps, default=0):.2f} to {max(gaps, default=0):.2f}s (bar: every 2.0 s)")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if a:
        kbps = float(a.get("bit_rate", 0)) / 1000
        r.check(a["codec_name"] == "aac" and a["sample_rate"] == "48000" and a["channels"] == 2 and kbps >= 160,
                "E6", f"{a['codec_name']} {a['sample_rate']} Hz, {a['channels']} ch, {kbps:.0f} kbps (bar: AAC 48 kHz stereo >= 160)")
    else:
        r.check(False, "E6", "no audio stream: run narrate.py on the cut (bar: AAC 48 kHz stereo)")
    atoms = m.atom_order(cut)
    ok = "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat")
    r.check(ok, "E7", f"atoms {' '.join(atoms[:4])} (bar: moov before mdat)")
    return info


def check_audio(r: Report, cut: Path, plan: dict, voice: dict | None, has_audio: bool) -> None:
    if not has_audio:
        return
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from narration.mix import ebur128
    levels = ebur128(cut)
    r.check(abs(levels["I"] + 14) <= 1, "A2", f"integrated {levels['I']:.1f} LUFS (bar: -14 +-1)")
    r.check(levels["TP"] <= -1.0, "A3", f"true peak {levels['TP']:.1f} dBTP (bar: <= -1.0)")
    r.check(levels["LRA"] <= 15, "A4", f"loudness range {levels['LRA']:.1f} LU (bar: <= 15)")
    series = m.momentary(cut)
    total = plan["total"]
    if voice:
        spoken = sum(l["end"] - l["start"] for l in voice["lines"])
        r.check(spoken / total >= 0.5, "A1", f"narration {spoken:.1f}s of {total:.1f}s = {spoken / total:.0%} (bar: >= 50%)")
        gaps = []
        for a, b in zip(voice["lines"], voice["lines"][1:]):
            if b["start"] - a["end"] >= 1.2:
                gaps.append((a["end"] + 0.5, b["start"] - 0.1))
        dips = [(d["at"] - 0.5, d["at"] + d["dur"] + 0.8) for d in voice.get("dips", [])]  # deliberate drops
        series = [(t, v) for t, v in series if not any(a <= t <= b for a, b in dips)]
        values = [v for t, v in series for g in gaps if g[0] <= t <= g[1]]
        if values:
            low, high = min(values), max(values)
            r.check(-32 <= low and high <= -24, "A6", f"bed between lines {low:.1f} to {high:.1f} LUFS momentary "
                    "(bar: -24 to -32, audible, not competing)")
        else:
            r.add("LOOK", "A6", "no narration-free gap of 1.2 s or more to measure the bed in; listen to it")
    else:
        r.add("LOOK", "A1", "no .voice.json next to the cut (narrate.py writes it); narration share not measured")
    tail = [-120.0 if math.isnan(v) else v for t, v in series if t >= total - 2.6]
    if plan.get("cards") and plan["cards"][-1].get("outro"):
        r.check(bool(tail) and max(tail) <= -50, "X3", f"last 3 s peak momentary {max(tail, default=-120):.1f} LUFS "
                "(bar: music faded out, silent)")


def ink_present(frame: m.Frame, band: tuple[int, int], darker_than: float = 150) -> int:
    return sum(1 for y in range(band[0], band[1], 3) for x in range(100, 1820, 3) if frame.luma(x, y) < darker_than)


def check_opening(r: Report, cut: Path, plan: dict, save) -> None:
    f0 = m.grab(cut, 0.0)
    save("00-frame0", 0.0)
    r.check(ink_present(f0, (380, 700), 215) > 40, "O1", "frame 0 shows title glyphs already blurring in (not blank)")
    f05 = m.grab(cut, 0.5)
    r.check(ink_present(f05, (380, 700)) > 200, "O1", "title glyphs visible by 0.5 s")
    counts = [ink_present(m.grab(cut, t / 10), (380, 700)) for t in range(0, 10, 2)]
    r.check(counts == sorted(counts) and counts[-1] > counts[0], "T10",
            f"title ink grows word by word over 0 to 0.8 s: {counts}")
    first = plan["cards"][0] if plan["cards"] and plan["cards"][0]["start"] == 0 else None
    if first:
        hold = m.grab(cut, 0.95)
        save("01-title-full", 0.95)
        word = m.first_word_box(hold, (400, 680))
        if word:
            r.check(abs(word[3] - 96) <= 3 or first["kind"] != "hero", "T2",
                    f"first title word ink height {word[3]} px (bar: 132 px hero -> 96 px cap +-3; a word with "
                    "descenders reads taller)")
        colour = brand_colours(plan)[0]
        accent = m.count_colour(m.grab(cut, first["end"] - 0.3), m.hex_rgb(colour), 40, (100, 300, 1720, 500))
        r.check(bool(first["accent"]) and accent > 30, "T9",
                f"accent word {first['accent']!r}, {accent} {colour} pixels on the card (bar: exactly one accent word)")
    runs = plan["runs"]
    if runs:
        r.check(runs[0]["start"] <= 6.0, "O4", f"first product UI at {runs[0]['start']:.2f}s (bar: <= 6.0)")


def check_windows(r: Report, cut: Path, plan: dict, save) -> None:
    for n, run in enumerate(plan["runs"]):
        rest_t = run["start"] + spec.ENTRY_SECONDS + 0.3
        zooms = [(z["start"], z["end"]) for z in run["zooms"]]
        while any(a - 0.05 <= rest_t <= b + 0.05 for a, b in zooms) and rest_t < run["end"]:
            rest_t += 0.5
        frame = m.grab(cut, rest_t)
        save(f"10-run{n}-rest", rest_t)
        box = m.window_box(frame)
        ok = box is not None and all(abs(a - b) <= 4 for a, b in zip(box, REST))
        r.check(ok, "W1", f"run {n} rest window {box} at {rest_t:.2f}s (bar: (180, 100, 1560, 800) +-4)")
        if box:
            radius = min(m.corner_radius(frame, box), m.corner_radius(frame, box, bottom=True))
            shade = frame.luma(400, box[1] + box[3] + 6) - frame.luma(400, min(1079, box[1] + box[3] + 120))
            r.check(18 <= radius <= 26, "W3", f"corner radius about {radius} px, top and bottom corners (bar: 20 to 24)")
            r.check(shade <= -20, "W5", f"shadow darkens the background {shade:.0f} levels under the bottom edge (bar: >= 20)")
        tops = []
        for i in range(0, 9):
            edge = m.top_edge(m.grab(cut, run["start"] + i * 0.1))
            tops.append(1080 if edge is None else edge)
        landed = abs(tops[7] - 100) <= 6
        early = tops[3] - 100 <= 0.3 * (tops[0] - 100) if tops[0] > 100 else False
        r.check(tops[0] >= 860 and landed and early, "W6",
                f"run {n} top edge every 0.1 s: {tops} (bar: >= 860 -> 100 in 0.7 s, mostly early)")
        for cut_t in run["cuts"]:
            boxes = [m.window_box(m.grab(cut, cut_t + d)) for d in (-1 / 30, 0, 1 / 30)]
            r.check(all(boxes), "W7", f"window present on both sides of the cut at {cut_t:.2f}s")
        marks = sorted([run["start"], run["end"], *run["cuts"], *[z["start"] for z in run["zooms"]],
                        *[z["end"] for z in run["zooms"]]])
        longest = max(b - a for a, b in zip(marks, marks[1:])) if len(marks) > 1 else 0
        r.check(longest <= 8.0, "P2", f"run {n} longest uninterrupted window shot {longest:.1f}s (bar: <= 8)")
        for k, z in enumerate(run["zooms"]):
            peak_t = (z["landed"] + z["out"]) / 2
            peak = m.window_box(m.grab(cut, peak_t))
            save(f"20-run{n}-zoom{k}-peak", peak_t)
            ok = peak is not None and abs(peak[2] - 1794) <= 10 and peak[0] >= 38 and peak[1] >= 38 \
                and peak[0] + peak[2] <= 1882 and peak[1] + peak[3] <= 1042  # 2 px measuring tolerance
            r.check(ok, "Z2-Z3", f"zoom {k} peak window {peak} (bar: width 1794 +-10, >= 40 px clear)")
            mid = m.window_box(m.grab(cut, z["start"] + 0.55))
            move = z["landed"] - z["start"]
            r.check(mid is not None and abs(mid[2] - (1560 + 1794) / 2) <= 10 and 1.0 <= move <= 1.2, "Z4",
                    f"zoom {k} move {move:.2f}s, midpoint width {mid[2] if mid else None} (bar: 1.0 to 1.2 s, 1677 +-10)")
            hold = z["out"] - z["landed"]
            r.check(2.4 <= hold <= 4.5, "Z5", f"zoom {k} holds {hold:.1f}s (bar: 2.4 to 4.5)")


def check_overlays(r: Report, cut: Path, plan: dict, save) -> None:
    landings = [z["landed"] for run in plan["runs"] for z in run["zooms"]]
    zooms = [(z["start"], z["end"]) for run in plan["runs"] for z in run["zooms"]]
    stroke, pill_text = overlay_colours(plan)
    for k, h in enumerate(plan["highlights"]):
        t = h["start"] + 0.6
        frame = m.grab(cut, t)
        save(f"30-highlight{k}", t)
        # The box takes the product's colour, which the UI itself also uses: count what the box adds
        # over the frame just before it appears.
        before = m.count_colour(m.grab(cut, max(0.0, h["start"] - 0.05)), m.hex_rgb(stroke), 8)
        added = m.count_colour(frame, m.hex_rgb(stroke), 8) - before
        after = min((h["start"] - l for l in landings if l <= h["start"] + 0.01), default=None)
        r.check(added > 150 and after is not None and 0.1 <= after <= 0.3, "H1-H5",
                f"highlight {k}: {added} more {stroke} pixels with the box, shows "
                f"{after if after is None else round(after, 2)}s after its zoom lands "
                f"(bar: 3 px box in the product colour {stroke} +-8, 0.1 to 0.3 s)")
    for k, c in enumerate(plan["callouts"]):
        t = (c["start"] + c["end"]) / 2
        frame = m.grab(cut, t)
        save(f"40-pill{k}", t)
        box = m.pill_box(frame)
        centre = box[1] + box[3] / 2 if box else None
        r.check(box is not None and abs(centre - 962) <= 3 and abs(box[3] - 68) <= 2, "C1-C2",
                f"pill {k} {c['text']!r} box {box} (bar: centred at y 962 +-3, 68 +-2 tall)")
        seconds = c["end"] - c["start"]
        clash = [z for z in zooms if c["start"] < z[1] and c["end"] + spec.PILL_EXIT > z[0]]
        r.check(3.0 <= seconds <= 5.0 and not clash, "C8/Z7",
                f"pill {k} on screen {seconds:.1f}s, overlaps zoom: {bool(clash)} (bar: 3 to 5 s, never over a zoom)")
        if c["kind"] == "statement":
            words = len(c["text"].split())
            r.check(words <= 6, "C4", f"statement pill {k}: {words} words (bar: <= 6)")
            if pill_text and box:
                ink = m.count_colour(frame, m.hex_rgb(pill_text), 40, box, step=1)
                r.check(ink > 40, "C4", f"statement pill {k} text in the product colour {pill_text}: {ink} pixels "
                        "(bar: brand-derived, readable on white)")


def highlight_motion(h: dict, plan_dir: Path) -> tuple[bool, str]:
    """H8: the take under one box, sampled at the start, middle and end of its time on screen (cut
    time mapped onto the take through the build plan): still, not blank, and inside its scene."""
    where = f"{h['where']} (scene {h['scene']})"
    rect = motion.Rect(*h["rect"])
    take = (plan_dir / h["take"]).resolve()
    last = h["shot_end"] - 1 / 30
    if h["end"] + spec.HIGHLIGHT_OUT > h["shot_end"] + 0.01:
        return False, (f"{where}: box on screen until {h['end'] + spec.HIGHLIGHT_OUT:.2f}s, after its scene ends at "
                       f"{h['shot_end']:.2f}s, so it sits over the next clip. Fix: shorten `dur`")
    times = [min(t, last) for t in (h["start"], (h["start"] + h["end"]) / 2, h["end"])]
    patches = [motion.patch_at(take, rect, tuple(h["take_size"]), h["trim_in"] + (t - h["shot_start"]) * h["speed"])
               for t in times]
    pairs = [(0, 1), (1, 2), (0, 2)]
    changes = {(a, b): motion.changed_fraction(patches[a], patches[b]) for a, b in pairs}
    (a, b), worst = max(changes.items(), key=lambda kv: kv[1])
    fix = f"Fix: {motion.FIX}"
    if worst >= motion.MOVING_FRACTION:
        return False, (f"{where} rect {h['rect']}: the UI under the box moves between {times[a]:.2f}s and "
                       f"{times[b]:.2f}s ({worst:.0%} of the area changes; bar: still, under "
                       f"{motion.MOVING_FRACTION:.0%}). {fix}")
    blank = [(t, s) for t, p in zip(times, patches) if (s := motion.spread(p)) < motion.EMPTY_SPREAD]
    if blank:
        return False, (f"{where} rect {h['rect']}: the box frames an empty area at {blank[0][0]:.2f}s "
                       f"(grey spread {blank[0][1]:.1f}; bar: >= {motion.EMPTY_SPREAD}). {fix}")
    return True, f"{where}: the UI under the box holds still ({worst:.0%} change) at {', '.join(f'{t:.2f}s' for t in times)}"


def check_highlight_motion(r: Report, plan: dict, plan_dir: Path) -> None:
    for k, h in enumerate(plan["highlights"]):
        if "take" not in h:
            r.add("LOOK", "H8", f"highlight {k}: plan has no take mapping (built by an older build-keynote.py); "
                  "rebuild to check the box sits on still UI")
            continue
        try:
            ok, text = highlight_motion(h, plan_dir)
        except (motion.MotionError, OSError) as error:
            r.add("LOOK", "H8", f"highlight {k}: could not read its take ({error}); watch the box by eye")
            continue
        r.check(ok, "H8", f"highlight {k} at {h['start']:.2f}s: {text}")


def check_ending(r: Report, cut: Path, plan: dict, save) -> None:
    end = plan["cards"][-1] if plan["cards"] and plan["cards"][-1]["kind"] == "end" else None
    if not end:
        r.check(False, "X1-X3", "no end card (the last item should be a card; it becomes the end card)")
        return
    save("50-end-card", end["end"] - 0.5)
    if end["outro"] <= 0:
        r.check(False, "X2-X3", "end card has outro 0: no brand sweep or logo lockup")
        return
    sweep_t = end["end"] + spec.SWEEP_SECONDS * 0.5
    save("51-sweep", sweep_t)
    sweep = m.grab(cut, sweep_t)
    ends = brand_colours(plan)[1]
    brand = sum(m.count_colour(sweep, m.hex_rgb(c), 30) for c in ends)
    r.check(brand > 2000, "X2", f"brand sweep: {brand} {ends[0]}/{ends[1]} gradient pixels mid-sweep")
    last = plan["total"] - 0.05
    hold_a, hold_b = m.grab(cut, plan["total"] - 3.0), m.grab(cut, last)
    save("52-last-frame", last)
    still = m.mean_abs_diff(hold_a, hold_b)
    lit = sum(1 for y in range(300, 780, 3) for x in range(200, 1720, 3) if hold_b.luma(x, y) > 150)
    r.check(still < 1.0 and lit > 300, "X3", f"lockup holds the last 3 s (diff {still:.2f}) and is visible "
            f"({lit} light pixels; bar: logo, not black)")


def check_background(r: Report, cut: Path, plan: dict) -> None:
    t = 1.6 if plan["cards"] and plan["cards"][0]["start"] == 0 else 0.0
    frame = m.grab(cut, t)
    worst = 0
    for (x, y), want in BG_SAMPLES.items():
        got = frame.px(x, y)
        worst = max(worst, max(abs(a - b) for a, b in zip(got, m.hex_rgb(want))))
    r.check(worst <= 8, "B3", f"background samples within {worst} levels of the reference (bar: +-4; +-8 allowed "
            "for encode)")


def main() -> int:
    parser = argparse.ArgumentParser(prog="check-cut.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("cut")
    parser.add_argument("--plan")
    parser.add_argument("--frames", help="save sample frames here as PNG")
    parser.add_argument("--json", help="write the results as JSON here")
    args = parser.parse_args()
    cut = Path(args.cut).resolve()
    if not cut.exists():
        sys.exit(f"check-cut: {cut} not found")
    plan_path, plan = find_plan(cut, args.plan)
    frames_dir = Path(args.frames).resolve() if args.frames else None
    if frames_dir:
        frames_dir.mkdir(parents=True, exist_ok=True)

    def save(name: str, t: float) -> None:
        if frames_dir:
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0, t):.3f}", "-i", str(cut), "-frames:v", "1",
                            str(frames_dir / f"{name}-{t:06.2f}s.png")], check=False)

    r = Report()
    print(f"Quality bar checklist for {cut.name} ({plan['total']:.1f}s). Bar: docs/quality-bar.md section 4.")
    info = check_streams(r, cut)
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    check_audio(r, cut, plan, find_voice(cut), has_audio)
    check_opening(r, cut, plan, save)
    check_background(r, cut, plan)
    check_windows(r, cut, plan, save)
    check_overlays(r, cut, plan, save)
    check_highlight_motion(r, plan, plan_path.parent)
    check_ending(r, cut, plan, save)
    r.check(bool(plan.get("fonts")) and all("Inter" in f or "Geist" in f for f in plan.get("fonts", [])), "T1",
            f"painted fonts {plan.get('fonts')} (bar: bundled Inter, or Geist when brand.font is geist)")
    r.add("LOOK", "W2", "app body text cap height >= 18 px and no empty panel over 15% of the window: open the "
          "10-run*-rest frames")
    r.add("LOOK", "K1-K2", "cursor is the pointing hand (default) or the arrow (developer tools), present and never "
          "a dot or a recorder-style click circle: open the rest and zoom frames")
    r.add("LOOK", "X1", "end-card words appear just before they are spoken: watch the last 13 s with sound")
    for warning in plan.get("warnings", []):
        r.add("WARN", "plan", warning)
    if args.json:
        Path(args.json).write_text(json.dumps(r.rows, indent=2) + "\n")
    passed = sum(1 for row in r.rows if row["status"] == "PASS")
    print(f"\n{passed} pass, {r.failed} fail, {sum(1 for x in r.rows if x['status'] == 'LOOK')} to look at"
          + (f"; frames in {frames_dir}" if frames_dir else ""))
    return 1 if r.failed else 0


if __name__ == "__main__":
    sys.exit(main())
