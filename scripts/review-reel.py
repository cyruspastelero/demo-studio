#!/usr/bin/env python3
"""Review reel: every keeper take joined uncut in story order, for the first review with the user.

Keepers are the takes.csv rows with status `keep` (the newest one wins when a scene has several).
Story order is the scene order in demo.json when given, otherwise the scene stems sorted (01, 02, 03b...).
Scenes without a keeper are listed, not silently skipped.

Usage (from the demo dir): review-reel.py [recordings-dir] [--config demo.json] [--out file.mp4]
Default output: recordings/exports/review-reel.mp4 (+ reel.txt, the concat list).
Prints PROGRESS and OUTPUT lines.
"""
from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path


def load_demolib():
    spec = importlib.util.spec_from_file_location("demolib", Path(__file__).resolve().parent / "demolib.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lib = load_demolib()


def parse_args(argv: list[str]) -> tuple[Path, Path | None, Path | None]:
    rec, config, out = Path("recordings"), None, None
    it = iter(argv)
    for arg in it:
        if arg == "--config":
            config = Path(next(it, ""))
        elif arg == "--out":
            out = Path(next(it, ""))
        elif arg.startswith("--"):
            sys.exit(f"review-reel: unknown option {arg}")
        else:
            rec = Path(arg)
    return rec.resolve(), config.resolve() if config else None, out.resolve() if out else None


def keepers(rec: Path) -> dict[str, Path]:
    log = rec / "takes.csv"
    if not log.exists():
        sys.exit(f"review-reel: {log} not found")
    found: dict[str, tuple[int, Path]] = {}
    with open(log, newline="") as fh:
        for row in csv.DictReader(fh):
            if (row.get("status") or "").strip().lower() != "keep":
                continue
            path = lib.config_path(rec, row.get("file"), f"takes.csv file for scene {row.get('scene')!r}", "review-reel")
            if not path.exists():
                sys.exit(f"review-reel: keeper {row['file']} is in takes.csv but not on disk")
            take = int(row.get("take") or 0)
            if row["scene"] not in found or take > found[row["scene"]][0]:
                found[row["scene"]] = (take, path)
    return {scene: path for scene, (_, path) in found.items()}


def story_order(scenes: list[str], config: Path | None) -> tuple[list[str], list[str]]:
    if not config:
        return sorted(scenes), []
    cfg = lib.load_config(config, "demo", "review-reel")
    stems = [item["stem"] for item in cfg["sequence"] if "stem" in item]
    ordered = [s for s in dict.fromkeys(stems) if s in scenes]
    missing = [s for s in dict.fromkeys(stems) if s not in scenes]
    extra = sorted(s for s in scenes if s not in stems)
    return ordered + extra, missing


def main() -> None:
    rec, config, out = parse_args(sys.argv[1:])
    lib.require("ffmpeg", "ffprobe")
    takes = keepers(rec)
    if not takes:
        sys.exit("review-reel: no takes marked keep in takes.csv")
    order, missing = story_order(list(takes), config)
    if missing:
        print(f"review-reel: WARN no keeper for {', '.join(missing)}", file=sys.stderr, flush=True)
    out = out or rec / "exports" / "review-reel.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    listing = out.parent / "reel.txt"
    listing.write_text(lib.concat_list(takes[s] for s in order))
    # Raw takes share one encoding (encode-take.sh), so a stream copy joins them losslessly.
    lib.progress("reel", 0, 1)
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listing,
             "-c", "copy", "-movflags", "+faststart", out])
    lib.progress("reel", 1, 1)
    print(f"{out} ({lib.duration(out):.1f}s, {len(order)} takes: {', '.join(order)})", flush=True)
    lib.output(out)


if __name__ == "__main__":
    main()
