#!/usr/bin/env python3
"""Contact sheet of raw capture frames between two take-relative times, for QA.

Usage: tile-frames.py <frames-dir> <from_s> <to_s> <out.png> [crop=w:h:x:y] [cols=4] [every=1]
Crop is in source-frame pixels (2880x1620 captures). Tiles are 480px wide.
"""
import subprocess
import sys
from pathlib import Path

frames_dir, t_from, t_to, out = Path(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
opts = dict(a.split("=", 1) for a in sys.argv[5:])
cols, every = int(opts.get("cols", 4)), int(opts.get("every", 1))

stamps = [float(t) for t in (frames_dir / "ts.txt").read_text().split()]
t0 = min(stamps)
picked = sorted((t - t0, i) for i, t in enumerate(stamps) if t_from <= t - t0 <= t_to)[::every][:48]
if not picked:
    sys.exit("no frames in range")

inputs, chains = [], []
for k, (_, i) in enumerate(picked):
    inputs += ["-protocol_whitelist", "file,pipe", "-i", str(frames_dir / f"f{i:05d}.jpg")]  # local files only
    crop = f"crop={opts['crop']}," if "crop" in opts else ""
    chains.append(f"[{k}]{crop}scale=480:-2[c{k}]")

probe = subprocess.run(
    ["ffprobe", "-protocol_whitelist", "file,pipe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(frames_dir / f"f{picked[0][1]:05d}.jpg")],
    capture_output=True, text=True, check=True).stdout.strip().split(",")
w, h = (int(v) for v in (opts["crop"].split(":")[:2] if "crop" in opts else probe))
tile_h = int(480 * h / w) // 2 * 2
layout = "|".join(f"{(k % cols) * 480}_{(k // cols) * tile_h}" for k in range(len(picked)))
graph = ";".join(chains) + ";" + "".join(f"[c{k}]" for k in range(len(picked)))
graph += f"xstack=inputs={len(picked)}:layout={layout}:fill=black"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, out], check=True)
print(f"{len(picked)} frames {picked[0][0]:.2f}s..{picked[-1][0]:.2f}s -> {out}")
