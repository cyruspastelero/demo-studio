#!/usr/bin/env python3
"""Keynote-style cut from demo.json: footage in a floating rounded window on a soft background,
eased zooms onto key UI, statement captions, dissolves through the background colour, title cards.

Usage (from the demo dir): build-keynote.py demo.json [item ...]
  item = scene id or card-<name>; only those parts are rebuilt, the rest reuse existing renders.
Needs: recordings/raw/<stem>-t<take>.mp4 and the PNGs from mk-assets.py in
recordings/exports/.keynote/. Output: recordings/exports/<slug>-keynote-cut.mp4 (1920x1080, 30fps)
and <slug>-keynote-cut.timing.json next to it (where each item starts; narrate.py reads it).
demo.json is checked against schemas/demo.schema.json first. Prints PROGRESS and OUTPUT lines.
"""
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()

PLUGIN_ASSETS = Path(__file__).resolve().parent.parent / "assets"
FPS = 30
FADE = 0.4
BG_HEX = "0xF3F3F6"
WIN_X, WIN_Y, WIN_W, WIN_H = 160, 44, 1600, 900
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p",
       "-r", str(FPS), "-video_track_timescale", "30000", "-an"]


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"ffmpeg failed: {' '.join(map(str, cmd[:8]))}...\n{result.stderr[-1500:]}")


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def fades(d):
    return (f"fade=in:st=0:d={FADE}:color={BG_HEX},"
            f"fade=out:st={max(0, d - FADE):.3f}:d={FADE}:color={BG_HEX}")


def zoom_filter(zoom, d):
    z, cx, cy, t0, dur = zoom if zoom else (1.05, 960, 540, 0.0, d)
    progress = f"clip((on/{FPS}-{t0})/{dur},0,1)"
    zexpr = f"1+({z}-1)*({progress})*({progress})*(3-2*({progress}))"  # smoothstep ease
    # work at 2x so the pan does not step in whole pixels
    x = f"min(max({cx * 2}-iw/zoom/2,0),iw-iw/zoom)"
    y = f"min(max({cy * 2}-ih/zoom/2,0),ih-ih/zoom)"
    return (f"scale=3840:2160:flags=lanczos,"
            f"zoompan=z='{zexpr}':x='{x}':y='{y}':d=1:s=1920x1080:fps={FPS}")


def build_card(assets, item, out):
    d = item.get("duration", 2.4)
    push = f"zoompan=z='1+0.03*on/{int(d * FPS)}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps={FPS}"
    run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-t", str(d),
         "-i", str(assets / f"card-{item['card']}.png"),
         "-vf", f"scale=3840:2160:flags=lanczos,{push},{fades(d)}", *ENC, str(out)])


def build_clip(rec, assets, item, out):
    src = rec / "raw" / f"{item['stem']}-t{item.get('take', 1)}.mp4"
    if not src.exists():
        sys.exit(f"build-keynote: missing {src}")
    ts, te = (item.get("trim") or [None, None])
    speed = item.get("speed", 1)
    rng = (["-ss", str(ts)] if ts is not None else []) + (["-to", str(te)] if te is not None else [])
    raw_d = (te if te is not None else duration(src)) - (ts or 0)
    d = raw_d / speed
    cap = assets / f"cap-{item['scene']}.png"
    cap_in = ["-loop", "1", "-framerate", str(FPS), "-i", str(cap)] if cap.exists() else [
        "-f", "lavfi", "-i", "color=c=black@0.0:s=1920x1080,format=rgba"]
    fc = (
        f"[1:v]setpts=PTS/{speed},fps={FPS},{zoom_filter(item.get('zoom'), d)},"
        f"scale={WIN_W}:{WIN_H}:flags=lanczos,format=rgba[w0];"
        f"[3:v]format=gray,scale={WIN_W}:{WIN_H}[m];[w0][m]alphamerge[w];"
        f"[4:v]format=rgba,fade=in:st=0.25:d=0.5:alpha=1[c];"
        f"[0:v][2:v]overlay[b1];[b1][w]overlay={WIN_X}:{WIN_Y}:shortest=1[b2];"
        f"[b2][c]overlay,format=yuv420p,{fades(d)}[out]"
    )
    run(["ffmpeg", "-y", "-loglevel", "error",
         "-loop", "1", "-framerate", str(FPS), "-i", str(PLUGIN_ASSETS / "bg.png"),
         *rng, "-i", str(src),
         "-loop", "1", "-framerate", str(FPS), "-i", str(PLUGIN_ASSETS / "shadow.png"),
         "-loop", "1", "-framerate", str(FPS), "-i", str(PLUGIN_ASSETS / "mask.png"),
         *cap_in,
         "-filter_complex", fc, "-map", "[out]", "-t", f"{d:.3f}", *ENC, str(out)])


def item_key(item):
    return f"card-{item['card']}" if "card" in item else item["scene"]


def write_timing(final, cfg, parts):
    """Writes where each sequence item starts in the cut, measured from the rendered parts."""
    items, clock = [], 0.0
    for index, (item, part) in enumerate(zip(cfg["sequence"], parts)):
        length = duration(part)
        items.append({"index": index, "key": item_key(item), "start": round(clock, 3),
                      "duration": round(length, 3)})
        clock += length
    timing = final.with_suffix(".timing.json")
    timing.write_text(json.dumps({"video": final.name, "total": round(duration(final), 3),
                                  "items": items}, indent=2) + "\n")
    return timing


def main():
    if not shutil.which("ffmpeg"):
        sys.exit("build-keynote: ffmpeg not found")
    cfg_path = Path(sys.argv[1] if len(sys.argv) > 1 else "demo.json").resolve()
    cfg = lib.load_config(cfg_path, "demo", "build-keynote")
    only = set(sys.argv[2:])
    rec = cfg_path.parent / "recordings"
    assets = rec / "exports/.keynote"
    parts_dir = assets / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    parts = []
    total = len(cfg["sequence"])
    for i, item in enumerate(cfg["sequence"]):
        key = item_key(item)
        out = parts_dir / f"{i:02d}-{key}.mp4"
        parts.append(out)
        if only and key not in only and out.exists():
            lib.progress("parts", i + 1, total)
            continue
        if "card" in item:
            build_card(assets, item, out)
        else:
            build_clip(rec, assets, item, out)
        print(f"built {out.name} ({duration(out):.1f}s)", flush=True)
        lib.progress("parts", i + 1, total)

    lst = parts_dir / "list.txt"
    lst.write_text(lib.concat_list(parts))
    slug = re.sub(r"[^a-z0-9]+", "-", cfg.get("title", "demo").lower()).strip("-") or "demo"
    final = rec / "exports" / f"{slug}-keynote-cut.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-c", "copy", "-movflags", "+faststart", str(final)])
    timing = write_timing(final, cfg, parts)
    print(f"{final} ({duration(final):.1f}s)\ntiming: {timing}")
    lib.output(final)


if __name__ == "__main__":
    main()
