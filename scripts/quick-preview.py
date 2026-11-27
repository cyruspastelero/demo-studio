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
sys.path.insert(0, str(HERE))  # the keynote package sits next to this file
from keynote.model import PlanError, confine_take  # noqa: E402


def handoff_segments(cfg: dict, cfg_path: Path, key: str) -> list[dict]:
    handoff = load("build_handoff", "build-handoff.py")
    videos = {v.key: v for v in handoff.build_videos(cfg)}
    if key not in videos:
        sys.exit(f"quick-preview: no video '{key}' in handoff.json (have {', '.join(videos)})")
    paths = handoff.config_paths(cfg_path, cfg)  # every path confined to the demo folder
    texts = {item["name"]: item for item in handoff.text_overlay_items(videos[key])}
    segments = []
    for number, shot in enumerate(videos[key].shots, start=1):
        if shot.is_card:
            seg = {"card": handoff.shot_input(shot, paths), "length": shot.end}
        else:
            seg = {"source": handoff.shot_input(shot, paths), "in": shot.start, "out": shot.end, "speed": shot.speed}
        segments.append({**seg, "text": texts.get(f"{number:02d}")})
    return segments


def text_overlays(segments: list[dict], root: Path, work: Path) -> dict[str, Path]:
    """The on-screen text of each segment as a PNG drawn exactly as the studio editor shows it."""
    handoff = load("build_handoff", "build-handoff.py")
    return handoff.render_text_overlays([s["text"] for s in segments if s.get("text")], root, work / "text")


def demo_segments(cfg: dict, root: Path) -> list[dict]:
    rec = root / "recordings"
    segments = []
    for item in cfg["sequence"]:
        if "card" in item:
            segments.append({"card": rec / "exports/.keynote" / f"card-{item['card']}.png",
                             "length": item.get("duration", KEYNOTE_CARD)})
            continue
        src = rec / "raw" / f"{item['stem']}-t{item.get('take', 1)}.mp4"
        if src.exists():  # a missing take is reported when its segment renders
            try:
                src = confine_take(src, rec / "raw", f"scene {item['scene']}")
            except PlanError as error:
                sys.exit(f"quick-preview: {error}")
        start, end = item.get("trim") or [None, None]
        segments.append({"source": src, "in": start or 0, "out": end, "speed": item.get("speed", 1)})
    return segments


def render_segment(seg: dict, target: Path, slate: str, text: Path | None = None) -> None:
    if "card" in seg:
        if seg["card"].exists():
            source = ["-loop", "1", "-framerate", str(FPS), "-t", f"{seg['length']}", "-i", seg["card"]]
        else:
            source = ["-f", "lavfi", "-t", f"{seg['length']}", "-i", f"color=c=0x{slate}:s=960x540:r={FPS}"]
        picture = f"scale={SIZE}"
    else:
        if not seg["source"].exists():
            sys.exit(f"quick-preview: missing take {seg['source']}")
        window = ["-ss", f"{seg['in']}"] + (["-to", f"{seg['out']}"] if seg["out"] is not None else [])
        source = [*window, "-i", seg["source"]]
        picture = f"setpts=PTS/{seg['speed']},scale={SIZE},fps={FPS}"
    if text is None:
        lib.run(["ffmpeg", "-y", "-loglevel", "error", *source, "-vf", picture, *ENCODE, target])
        return
    # The 1920x1080 text overlay scales with the frame, so it sits where the editor put it.
    lib.run(["ffmpeg", "-y", "-loglevel", "error", *source, "-i", text, "-filter_complex",
             f"[0:v]{picture}[v];[1:v]scale={SIZE}[t];[v][t]overlay=0:0:shortest=0:eof_action=repeat[out]",
             "-map", "[out]", *ENCODE, "-t", f"{segment_seconds(seg)}", target])


def segment_seconds(seg: dict) -> float:
    if "card" in seg:
        return seg["length"]
    end = seg["out"] if seg["out"] is not None else seg["in"] + lib.duration(seg["source"])
    return (end - seg["in"]) / seg["speed"]


def refuse_linked_recordings(root: Path) -> None:
    """recordings/ and recordings/exports/ must be real folders with no symlinks under them, as
    build-keynote.py asks, so a shared demo folder cannot send the preview outside it."""
    rec = root / "recordings"
    try:
        if rec.is_symlink():
            raise lib.UnsafePath(f"recordings: {rec} is a symlink; refusing to write through it")
        lib.refuse_symlinks_under(rec / "exports", "recordings/exports")
    except lib.UnsafePath as error:
        sys.exit(f"quick-preview: {error}")


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
        refuse_linked_recordings(root)  # cards are read from, and the preview written to, recordings/exports
        key, segments = "KEYNOTE", demo_segments(cfg, root)
    else:
        cfg = lib.load_config(cfg_path, "handoff", "quick-preview")
        key = args[1]
        segments = handoff_segments(cfg, cfg_path, key)
    slate = (cfg.get("brand", {}).get("background") or f"#{SLATE}")[1:]
    if not out_arg:
        refuse_linked_recordings(root)
    out = Path(out_arg).resolve() if out_arg else root / "recordings" / "exports" / f"{key}-quick-preview.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        parts = []
        texts = text_overlays(segments, root, work) if len(args) > 1 else {}
        for number, seg in enumerate(segments, start=1):
            part = work / f"{number:03d}.mp4"
            render_segment(seg, part, slate, texts.get(seg["text"]["name"]) if seg.get("text") else None)
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
