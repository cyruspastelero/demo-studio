#!/usr/bin/env python3
"""Prints an ffmpeg filter_complex that scales a take to 1920x1080 and blurs secret regions.

Usage: blur-filter.py <frames-dir> <css-width>
Reads <frames-dir>/ts.txt (capture timestamps) and optional blur.jsonl lines of
{"x","y","w","h","t"[,"until"]} in CSS px / epoch seconds. Each box is blurred from t
until "until" (or the end of the take).
Output label is [out].
"""
import json
import sys
from pathlib import Path

OUT_W, OUT_H = 1920, 1080
PAD = 6  # css px of margin around each box so glyph edges don't peek out

frames_dir, css_width = Path(sys.argv[1]), float(sys.argv[2])
scale = OUT_W / css_width

chain = [f"[0:v]scale={OUT_W}:{OUT_H}:flags=lanczos[b0]"]
blur_file = frames_dir / "blur.jsonl"
boxes = []
if blur_file.exists():
    boxes = [json.loads(line) for line in blur_file.read_text().splitlines() if line.strip()]
    # Only numbers reach the filter graph; anything else in blur.jsonl stops the encode.
    try:
        boxes = [{k: float(box[k]) for k in ("x", "y", "w", "h", "t")}
                 | ({"until": float(box["until"])} if box.get("until") is not None else {}) for box in boxes]
    except (KeyError, TypeError, ValueError) as error:
        sys.exit(f"blur-filter: bad box in {blur_file}: {error}")

if boxes:
    stamps = [float(t) for t in (frames_dir / "ts.txt").read_text().split()]
    t0 = min(stamps)

def window(start, end):
    return f"between(t,{start:.3f},{end:.3f})" if end is not None else f"gte(t,{start:.3f})"


for i, box in enumerate(boxes):
    x = max(0, int((box["x"] - PAD) * scale))
    y = max(0, int((box["y"] - PAD) * scale))
    w = min(OUT_W - x, int((box["w"] + 2 * PAD) * scale)) // 2 * 2
    h = min(OUT_H - y, int((box["h"] + 2 * PAD) * scale)) // 2 * 2
    start = max(0.0, float(box["t"]) - t0)
    end = float(box["until"]) - t0 if box.get("until") else None
    # boxblur radius must fit inside the (half-size) chroma plane of the crop
    radius = max(1, min(18, min(w, h) // 4 - 1))
    chain.append(
        f"[b{i}]split[m{i}][c{i}];[c{i}]crop={w}:{h}:{x}:{y},boxblur={radius}:4[z{i}];"
        f"[m{i}][z{i}]overlay={x}:{y}:enable='{window(start, end)}'[b{i + 1}]"
    )

chain.append(f"[b{len(boxes)}]null[out]")
print(";".join(chain))
