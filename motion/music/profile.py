#!/usr/bin/env python3
"""Profile every track in this music library and rewrite the table in README.md.

For each <name>.mp3: runs demo-studio's analyze-beats (writes <name>.beats.json), measures integrated
loudness, and reads loudness bar by bar to find the drop (first bar at least 4 dB louder than the
intro), dips (bars at least 5 dB quieter than both neighbours) and where the sound ends.
Usage: python3 -I profile.py [path to demo-studio]   (default: this repo)
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STUDIO = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent.parent
START, END = "<!-- tracks:start -->", "<!-- tracks:end -->"


def run(args: list[str]) -> str:
    r = subprocess.run(args, capture_output=True, text=True, cwd=HERE)
    if r.returncode != 0:
        raise RuntimeError(f"{args[0]} failed on {args[-1] if args else ''}: {r.stderr[-400:]}")
    return r.stdout + r.stderr


def bar_levels(mp3: Path, bpm: float, offset: float, duration: float) -> list[tuple[float, float]]:
    """Mean volume (dB) of each 4/4 bar, as (bar start second, dB)."""
    bar = 240 / bpm
    out, t = [], offset
    while t + bar <= duration + 0.01:
        text = run(["ffmpeg", "-v", "info", "-ss", f"{t:.3f}", "-t", f"{bar:.3f}", "-i", str(mp3), "-af", "volumedetect", "-f", "null", "-"])
        m = re.search(r"mean_volume: (-?[\d.]+|-inf)", text)
        out.append((t, float(m.group(1)) if m and m.group(1) != "-inf" else -90.0))
        t += bar
    return out


def profile(mp3: Path) -> dict:
    beats_path = mp3.with_suffix(".beats.json")
    beats = json.loads(run(["node", str(STUDIO / "motion/analyze-beats.mjs"), mp3.name, "--out", beats_path.name]).strip().splitlines()[-1])
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", run(["ffmpeg", "-v", "info", "-i", str(mp3), "-af", "ebur128", "-f", "null", "-"]))[-1])
    bars = bar_levels(mp3, beats["bpm"], beats["offset"], beats["duration"])
    intro = bars[0][1] if bars else -90
    drop = next((t for t, db in bars[1:] if db >= intro + 4), None)
    dips = [bars[i][0] for i in range(1, len(bars) - 1) if bars[i][1] <= min(bars[i - 1][1], bars[i + 1][1]) - 5]
    sound_end = max((t for t, db in bars if db > -40), default=0) + 240 / beats["bpm"]
    return {"bpm": round(beats["bpm"], 2), "offset": round(beats["offset"], 3), "duration": round(beats["duration"], 1),
            "lufs": lufs, "drop": drop, "dips": dips, "end": round(min(sound_end, beats["duration"]), 1)}


def main() -> None:
    notes = json.loads((HERE / "notes.json").read_text()) if (HERE / "notes.json").exists() else {}
    rows = ["| Track | Use | BPM | Length | Drop | Dips | Sound ends | LUFS |", "|---|---|---|---|---|---|---|---|"]
    for mp3 in sorted(HERE.glob("*.mp3")):
        p = profile(mp3)
        fmt = lambda s: f"{s:.1f}s" if s is not None else "none"
        rows.append(f"| `{mp3.name}` | {notes.get(mp3.stem, '')} | {p['bpm']} | {p['duration']}s | {fmt(p['drop'])} | "
                    f"{', '.join(fmt(d) for d in p['dips']) or 'none'} | {p['end']}s | {p['lufs']} |")
        print(mp3.name, p)
    readme = HERE / "README.md"
    text = readme.read_text()
    readme.write_text(text.split(START)[0] + START + "\n" + "\n".join(rows) + "\n" + END + text.split(END)[1])


if __name__ == "__main__":
    main()
