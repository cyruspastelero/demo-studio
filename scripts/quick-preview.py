#!/usr/bin/env python3
"""Quick preview: one video at 960x540 with ultrafast settings, to check cuts, speed changes and
title cards quickly. Not for delivery; the real renders are build-handoff.py and build-keynote.py.

Usage (from the demo dir):
  quick-preview.py handoff.json VIDEO_KEY [--out file.mp4]
  quick-preview.py demo.json [--out file.mp4]
Default output: recordings/exports/<KEY>-quick-preview.mp4 (KEYNOTE for demo.json).
A card without a rendered PNG shows as a plain slate in the brand background colour.
Prints PROGRESS and OUTPUT lines.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FPS = 30
SIZE = "960:540"
ENCODE = ["-r", str(FPS), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", "-an"]
SLATE = "F6F6F8"
KEYNOTE_CARD = 2.4  # build-keynote.py default card length


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # dataclasses look their module up here
    spec.loader.exec_module(module)
    return module


lib = load("demolib", "demolib.py")


def handoff_segments(cfg: dict, cfg_path: Path, key: str) -> list[dict]:
    handoff = load("build_handoff", "build-handoff.py")
    videos = {v.key: v for v in handoff.build_videos(cfg)}
    if key not in videos:
        sys.exit(f"quick-preview: no video '{key}' in handoff.json (have {', '.join(videos)})")
    paths = handoff.config_paths(cfg_path, cfg)  # every path confined to the demo folder
    segments = []
    for shot in videos[key].shots:
        if shot.is_card:
            segments.append({"card": handoff.shot_input(shot, paths), "length": shot.end})
        else:
            segments.append({"source": handoff.shot_input(shot, paths), "in": shot.start, "out": shot.end, "speed": shot.speed})
    return segments


def demo_segments(cfg: dict, root: Path) -> list[dict]:
    rec = root / "recordings"
    segments = []
    for item in cfg["sequence"]:
        if "card" in item:
            segments.append({"card": rec / "exports/.keynote" / f"card-{item['card']}.png",
                             "length": item.get("duration", KEYNOTE_CARD)})
            continue
        src = rec / "raw" / f"{item['stem']}-t{item.get('take', 1)}.mp4"
        start, end = item.get("trim") or [None, None]
        segments.append({"source": src, "in": start or 0, "out": end, "speed": item.get("speed", 1)})
    return segments


def render_segment(seg: dict, target: Path, slate: str) -> None:
    if "card" in seg:
        if seg["card"].exists():
            source = ["-loop", "1", "-framerate", str(FPS), "-t", f"{seg['length']}", "-i", seg["card"]]
        else:
            source = ["-f", "lavfi", "-t", f"{seg['length']}", "-i", f"color=c=0x{slate}:s=960x540:r={FPS}"]
        lib.run(["ffmpeg", "-y", "-loglevel", "error", *source, "-vf", f"scale={SIZE}", *ENCODE, target])
        return
    if not seg["source"].exists():
        sys.exit(f"quick-preview: missing take {seg['source']}")
    window = ["-ss", f"{seg['in']}"] + (["-to", f"{seg['out']}"] if seg["out"] is not None else [])
    lib.run(["ffmpeg", "-y", "-loglevel", "error", *window, "-i", seg["source"],
             "-vf", f"setpts=PTS/{seg['speed']},scale={SIZE},fps={FPS}", *ENCODE, target])


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_arg = None
    if "--out" in sys.argv:
        index = sys.argv.index("--out")
        out_arg = sys.argv[index + 1] if index + 1 < len(sys.argv) else sys.exit("quick-preview: --out needs a file")
        args = [a for a in args if a != out_arg]
    if not args:
        sys.exit(__doc__)
    cfg_path = Path(args[0]).resolve()
    root = cfg_path.parent
    lib.require("ffmpeg", "ffprobe")
    if len(args) == 1:
        if cfg_path.name != "demo.json":
            sys.exit("quick-preview: for handoff.json, name the video key too, for example PROMO")
        cfg = lib.load_config(cfg_path, "demo", "quick-preview")
        key, segments = "KEYNOTE", demo_segments(cfg, root)
    else:
        cfg = lib.load_config(cfg_path, "handoff", "quick-preview")
        key = args[1]
        segments = handoff_segments(cfg, cfg_path, key)
    slate = (cfg.get("brand", {}).get("background") or f"#{SLATE}")[1:]
    out = Path(out_arg).resolve() if out_arg else root / "recordings" / "exports" / f"{key}-quick-preview.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        parts = []
        for number, seg in enumerate(segments, start=1):
            part = work / f"{number:03d}.mp4"
            render_segment(seg, part, slate)
            parts.append(part)
            lib.progress("quick-preview", number, len(segments) + 1)
        listing = work / "list.txt"
        listing.write_text(lib.concat_list(parts))
        lib.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
                 "-c", "copy", "-movflags", "+faststart", out])
        lib.progress("quick-preview", len(segments) + 1, len(segments) + 1)
    print(f"{out} ({lib.duration(out):.1f}s, {len(segments)} segments)", flush=True)
    lib.output(out)


if __name__ == "__main__":
    main()
