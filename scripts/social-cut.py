#!/usr/bin/env python3
"""Vertical social versions of a 16:9 cut: 4:5 (1080x1350) or 9:16 (1080x1920).

The footage sits in a rounded window with a soft shadow below a caption band, over a blurred
copy of the footage or a flat brand colour. `fit=contain` shows the whole frame; `fit=crop`
fills a taller window around focus_x/focus_y (use it when the UI must read on a phone).

Usage:
  social-cut.py handoff.json                 every entry in handoff.json "social"
  social-cut.py <in.mp4> <out.mp4> [--aspect 4:5|9:16] [--fill blur|color] [--color #F3F3F6]
                [--fit contain|crop] [--focus-x 0.5] [--focus-y 0.5] [--zoom 1] [--radius 26]
                [--captions captions.json]   (a JSON list of {start, end, text | png})

Caption text is drawn with ffmpeg drawtext when the build has it; otherwise render the caption
PNGs first with `node title-cards.mjs handoff.json --social`.
Prints PROGRESS and OUTPUT lines.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()
TOOL = "social-cut"
VIDEO_KEY = re.compile(r"^[A-Z][A-Z0-9-]*$")
FPS = 30
SHADOW_PAD = 40
# aspect -> (width, height, caption band, side margin, bottom margin)
LAYOUTS = {"4:5": (1080, 1350, 250, 40, 70), "9:16": (1080, 1920, 420, 40, 260)}
DEFAULTS = {"fill": "blur", "color": "#F3F3F6", "fit": "contain", "focus_x": 0.5, "focus_y": 0.5,
            "zoom": 1.0, "radius": 26, "captions": []}


def even(n: float) -> int:
    return int(n) // 2 * 2


def window_geometry(entry: dict, src_w: int, src_h: int) -> dict:
    width, height, band, side, bottom = LAYOUTS[entry["aspect"]]
    win_w = width - 2 * side
    room = height - band - bottom
    aspect = win_w / room if entry["fit"] == "crop" else src_w / src_h
    win_h = min(room, even(win_w / aspect))
    crop_h = src_h / entry["zoom"]
    crop_w = min(src_w, crop_h * aspect)
    crop_h = crop_w / aspect
    crop_x = min(max(entry["focus_x"] * src_w - crop_w / 2, 0), src_w - crop_w)
    crop_y = min(max(entry["focus_y"] * src_h - crop_h / 2, 0), src_h - crop_h)
    return {"W": width, "H": height, "band": band, "win_w": even(win_w), "win_h": even(win_h),
            "x": side, "y": band + (room - even(win_h)) // 2,
            "crop": f"{even(crop_w)}:{even(crop_h)}:{int(crop_x)}:{int(crop_y)}"}


def make_mask_and_shadow(geo: dict, radius: int, work: Path) -> tuple[Path, Path]:
    w, h, r = geo["win_w"], geo["win_h"], max(radius, 0)
    mask = work / "mask.png"
    inside = f"lte(hypot(X-clip(X\\,{r}\\,W-1-{r})\\,Y-clip(Y\\,{r}\\,H-1-{r}))\\,{r})" if r else "1"
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}",
             "-frames:v", "1", "-vf", f"format=gray,geq=lum='255*{inside}'", mask])
    shadow = work / "shadow.png"
    sw, sh = w + 2 * SHADOW_PAD, h + 2 * SHADOW_PAD
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=black:s={sw}x{sh}", "-i", mask,
             "-frames:v", "1", "-filter_complex",
             f"[1:v]format=gray,pad={sw}:{sh}:{SHADOW_PAD}:{SHADOW_PAD}:black,boxblur=22:3[a];"
             f"[0:v][a]alphamerge,colorchannelmixer=aa=0.22", shadow])
    return mask, shadow


def caption_inputs(entry: dict, geo: dict, work: Path, base: Path) -> tuple[list, list[str]]:
    """Returns extra ffmpeg inputs and filter steps that draw the captions in the band."""
    inputs, steps = [], []
    drawtext = None
    for i, cap in enumerate(entry["captions"]):
        enable = f"enable='between(t,{cap['start']},{cap['end']})'"
        if cap.get("png"):
            png = (base / cap["png"]).resolve()
            if not png.exists():
                sys.exit(f"social-cut: caption image not found: {png}")
            inputs += ["-loop", "1", "-framerate", str(FPS), "-i", str(png)]
            steps.append(("png", f"overlay=x=(main_w-overlay_w)/2:y=({geo['band']}-overlay_h)/2:{enable}"))
            continue
        if drawtext is None:
            drawtext = lib.has_filter("drawtext")
        if not drawtext:
            sys.exit("social-cut: this ffmpeg has no drawtext filter, so caption text needs PNGs. Render them with:\n"
                     "  node \"$CLAUDE_PLUGIN_ROOT/scripts/title-cards.mjs\" handoff.json --social")
        text_file = work / f"caption-{i}.txt"
        text_file.write_text(cap["text"])
        steps.append(("text", f"drawtext=textfile='{text_file}':fontsize=60:fontcolor=0x1D1D1F:"
                              f"x=(w-text_w)/2:y=({geo['band']}-text_h)/2:{enable}"))
    return inputs, steps


def render(entry: dict, src: Path, out: Path, base: Path) -> None:
    lib.require("ffmpeg", "ffprobe")
    if not src.exists():
        sys.exit(f"social-cut: input not found: {src}")
    src_w, src_h = lib.probe_size(src)
    seconds = lib.duration(src)
    geo = window_geometry(entry, src_w, src_h)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        mask, shadow = make_mask_and_shadow(geo, entry["radius"], work)
        if entry["fill"] == "color":
            bg_input = ["-f", "lavfi", "-i", f"color=c=0x{entry['color'][1:]}:s={geo['W']}x{geo['H']}:r={FPS}"]
            bg = "[3:v]format=yuv420p[bg]"
        else:
            bg_input = ["-f", "lavfi", "-i", f"color=c=black:s=16x16:r={FPS}"]  # placeholder keeps input numbering
            # the brightness lift is a light veil so dark caption text stays readable over busy footage
            bg = (f"[0:v]scale={geo['W'] // 4}:{geo['H'] // 4}:force_original_aspect_ratio=increase,"
                  f"crop={geo['W'] // 4}:{geo['H'] // 4},boxblur=18:2,eq=brightness=0.2:saturation=0.55,"
                  f"scale={geo['W']}:{geo['H']}:flags=bicubic[bg]")
        cap_inputs, cap_steps = caption_inputs(entry, geo, work, base)
        graph = [
            bg,
            f"[0:v]fps={FPS},crop={geo['crop']},scale={geo['win_w']}:{geo['win_h']}:flags=lanczos,format=rgba[w0]",
            f"[1:v]format=gray,scale={geo['win_w']}:{geo['win_h']}[m]",
            "[w0][m]alphamerge[w]",
            f"[bg][2:v]overlay={geo['x'] - SHADOW_PAD}:{geo['y'] - SHADOW_PAD + 14}[b0]",
            f"[b0][w]overlay={geo['x']}:{geo['y']}[c0]",
        ]
        label, next_input = "c0", 4
        for i, (kind, step) in enumerate(cap_steps):
            if kind == "png":
                graph.append(f"[{label}][{next_input}:v]{step}[c{i + 1}]")
                next_input += 1
            else:
                graph.append(f"[{label}]{step}[c{i + 1}]")
            label = f"c{i + 1}"
        graph.append(f"[{label}]format=yuv420p[out]")
        audio = ["-map", "0:a", "-c:a", "aac", "-b:a", "192k"] if lib.has_audio(src) else ["-an"]
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src,
               "-loop", "1", "-framerate", str(FPS), "-i", mask,
               "-loop", "1", "-framerate", str(FPS), "-i", shadow,
               *bg_input, *cap_inputs,
               "-filter_complex", ";".join(graph), "-map", "[out]", *audio, "-t", f"{seconds:.3f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS),
               "-movflags", "+faststart", out]
        lib.run_progress(cmd, f"social-{entry['aspect'].replace(':', 'x')}", int(seconds * FPS))
    lib.output(out)


def with_defaults(entry: dict) -> dict:
    return {**DEFAULTS, **entry}


def from_handoff(cfg_path: Path) -> None:
    cfg = lib.load_config(cfg_path, "handoff", "social-cut")
    root = cfg_path.parent.resolve()
    out_dir = lib.config_path(root, cfg.get("paths", {}).get("out", "recordings/editor-handoff"), "paths.out", TOOL)
    entries = cfg.get("social", [])
    if not entries:
        sys.exit("social-cut: handoff.json has no \"social\" entries")
    for done, raw in enumerate(entries, start=1):
        entry = with_defaults(raw)
        aspect = entry["aspect"].replace(":", "x")
        where = f"social[{done - 1}]"
        if entry.get("input"):
            src = lib.config_path(root, entry["input"], f"{where}.input", TOOL)
            name = Path(entry["input"]).stem
        elif entry.get("video"):
            if not VIDEO_KEY.match(entry["video"]):
                sys.exit(f"{TOOL}: {where}.video must be a video key like PROMO, got {entry['video']!r}")
            found = sorted(out_dir.glob(f"{entry['video']}_*/00_ROUGH-ASSEMBLY.mp4"))
            if not found:
                sys.exit(f"social-cut: no rough assembly for {entry['video']}; run build-handoff.py first")
            src, name = found[0], entry["video"]
        else:
            sys.exit(f"social-cut: social[{done - 1}] needs \"video\" or \"input\"")
        rendered = out_dir / "assets" / "social-captions"
        captions = []
        for i, cap in enumerate(entry["captions"]):
            if "png" in cap:
                cap = {**cap, "png": str(lib.config_path(root, cap["png"], f"{where}.captions[{i}].png", TOOL))}
            png = rendered / f"{name}-{aspect}-{i + 1}.png"
            captions.append({**cap, "png": str(png)} if "text" in cap and "png" not in cap and png.exists() else cap)
        out = (lib.config_path(root, entry["output"], f"{where}.output", TOOL) if entry.get("output")
               else out_dir / "social" / f"{name}_{aspect}.mp4")
        render({**entry, "captions": captions}, src, out, root)
        lib.progress("social", done, len(entries))


def parse_cli(argv: list[str]) -> tuple[Path, Path, dict]:
    if len(argv) < 2:
        sys.exit(__doc__)
    src, out, rest = Path(argv[0]).resolve(), Path(argv[1]).resolve(), argv[2:]
    if len(rest) % 2:
        sys.exit("social-cut: every option needs a value")
    entry = {"aspect": "4:5"}
    numbers = {"--focus-x": "focus_x", "--focus-y": "focus_y", "--zoom": "zoom"}
    for flag, value in zip(rest[::2], rest[1::2]):
        if flag in numbers:
            entry[numbers[flag]] = float(value)
        elif flag == "--radius":
            entry["radius"] = int(value)
        elif flag == "--captions":
            entry["captions"] = json.loads(Path(value).read_text())
        elif flag in ("--aspect", "--fill", "--color", "--fit"):
            entry[flag[2:]] = value
        else:
            sys.exit(f"social-cut: unknown option {flag}")
    errors = lib.validate(entry, "handoff", "social")
    if errors:
        sys.exit("social-cut: " + "; ".join(errors))
    return src, out, with_defaults(entry)


def main() -> None:
    argv = sys.argv[1:]
    if len(argv) == 1 and argv[0].endswith(".json"):
        from_handoff(Path(argv[0]).resolve())
        return
    src, out, entry = parse_cli(argv)
    render(entry, src, out, Path.cwd())


if __name__ == "__main__":
    main()
