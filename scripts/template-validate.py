#!/usr/bin/env python3
"""Template copier, step 3: render the todo sample in a look template and compare it with the
reference, moment by moment. Optionally saves the template's six previews from that render.

It copies the template and examples/todo-sample (raw takes included) into a scratch folder, sets
`"template": "<id>"` in the copy's demo.json, builds it with build-keynote.py, then pulls six moments
from our cut (title, window at rest, zoom with highlight, pill, end card, dark outro) and, with
--reference, the matching moments of the reference (times from the copier's measurements.json, or
--at). Each pair is tiled side by side, reference left, ours right, into <work>/compare/NN-<moment>.png
for you to Read and compare. Adjust template.json and run again until they match.

Usage: template-validate.py ID [--templates DIR] [--reference VIDEO] [--measurements JSON]
                           [--at name=seconds ...] [--work DIR] [--check] [--save-previews]
  --templates      folder holding <id>/ (default: the normal search, workspace then built-in)
  --check          also run check-cut.py on our (silent) cut against the template's own numbers
  --save-previews  write our six frames as 1280x720 PNGs to <template>/preview/01..06.png
Heavy: one keynote build. Run it through the heavy-job lock on a shared machine.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import demolib as lib  # noqa: E402
from keynote import templates  # noqa: E402

TOOL = "template-validate"
SCRIPTS = Path(__file__).resolve().parent
SAMPLE = SCRIPTS.parent / "examples" / "todo-sample"
MOMENTS = ("hero", "rest", "zoom", "pill", "end_card", "outro")


def fail(message: str) -> None:
    sys.exit(f"{TOOL}: {message}")


def our_moments(plan: dict) -> dict[str, float]:
    """Times in our cut for each moment, from build-keynote.py's plan.json."""
    look = plan.get("look") or {}
    entry = (look.get("transitions") or {}).get("window_in", 0.7)
    run = plan["runs"][0]
    zooms = [(z["start"], z["end"]) for r in plan["runs"] for z in r["zooms"]]
    rest = run["start"] + entry + 0.3
    while any(a - 0.05 <= rest <= b + 0.05 for a, b in zooms) and rest < run["end"]:
        rest += 0.25
    highlight = plan["highlights"][0]["start"] + 0.6 if plan["highlights"] else None
    zoom = highlight or ((zooms[0][0] + zooms[0][1]) / 2 if zooms else rest)
    pill = plan["callouts"][0] if plan["callouts"] else None
    end = plan["cards"][-1]
    return {"hero": 0.95, "rest": round(rest, 2), "zoom": round(zoom, 2),
            "pill": round((pill["start"] + pill["end"]) / 2, 2) if pill else round(rest, 2),
            "end_card": round(end["end"] - 0.5, 2), "outro": round(plan["total"] - 0.5, 2)}


def still(video: Path, t: float, out: Path, size: str) -> None:
    lib.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", video, "-frames:v", "1",
             "-vf", f"scale={size}:flags=bicubic", out])


def side_by_side(reference: Path, t_ref: float, ours: Path, t_ours: float, out: Path) -> None:
    lib.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{max(0.0, t_ref):.3f}", "-i", reference,
             "-ss", f"{max(0.0, t_ours):.3f}", "-i", ours, "-frames:v", "1", "-filter_complex",
             "[0:v]scale=960:540[a];[1:v]scale=960:540[b];[a][b]hstack=inputs=2", out])


def stage(template: templates.Template, work: Path) -> Path:
    """work/demos/_templates/<id> and work/demos/todo-sample (raw takes, no exports), template set."""
    demos = work / "demos"
    target = demos / "_templates" / template.id
    if target.exists():
        lib.safe_rmtree(work, target, f"_templates/{template.id}")
    shutil.copytree(template.folder, target, symlinks=False,
                    ignore=shutil.ignore_patterns("preview"))
    demo = demos / "todo-sample"
    if not demo.exists():
        shutil.copytree(SAMPLE, demo, symlinks=False, ignore=shutil.ignore_patterns("exports", "voice-cache"))
    cfg = json.loads((SAMPLE / "demo.json").read_text())
    cfg["template"] = template.id
    (demo / "demo.json").write_text(json.dumps(cfg, indent=2) + "\n")
    return demo


def main() -> None:
    parser = argparse.ArgumentParser(prog="template-validate.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("id")
    parser.add_argument("--templates", help="folder that holds <id>/")
    parser.add_argument("--reference", help="the video the template was measured on")
    parser.add_argument("--measurements", help="the copier's measurements.json (reference moment times)")
    parser.add_argument("--at", action="append", default=[], help="reference time override, e.g. pill=12.3")
    parser.add_argument("--work", help="scratch folder (default a new temp folder)")
    parser.add_argument("--check", action="store_true", help="run check-cut.py on our cut")
    parser.add_argument("--save-previews", action="store_true", help="write preview/01..06.png into the template")
    args = parser.parse_args()
    lib.require("ffmpeg", "ffprobe", "node")
    try:
        if args.templates:
            root = Path(args.templates).expanduser().resolve()
            template = templates.read_folder(root / templates.check_id(args.id), args.id, "given")
        else:
            template = templates.find(args.id)
    except templates.TemplateError as error:
        fail(str(error))
    work = Path(args.work).expanduser().resolve() if args.work else Path(tempfile.mkdtemp(prefix=f"tpl-{args.id}-"))
    work.mkdir(parents=True, exist_ok=True)
    demo = stage(template, work)
    print(f"{TOOL}: building the todo sample in {template.id} under {demo}", flush=True)
    build = subprocess.run([sys.executable, "-I", str(SCRIPTS / "build-keynote.py"), "demo.json"], cwd=demo)
    if build.returncode:
        fail(f"build-keynote.py failed (exit {build.returncode}); fix template.json and run again")
    exports = demo / "recordings" / "exports"
    cut = exports / f"{lib.slugify(json.loads((demo / 'demo.json').read_text())['title'])}-keynote-cut.mp4"
    plan = json.loads(cut.with_suffix(".plan.json").read_text())
    ours = our_moments(plan)
    ref_times: dict[str, float | None] = {}
    if args.measurements:
        ref_times.update(json.loads(Path(args.measurements).read_text()).get("moments", {}))
    for item in args.at:
        key, _, value = item.partition("=")
        if key not in MOMENTS:
            fail(f"--at {item}: moment must be one of {', '.join(MOMENTS)}")
        ref_times[key] = float(value)
    shots = work / "ours"
    shots.mkdir(exist_ok=True)
    compare = work / "compare"
    compare.mkdir(exist_ok=True)
    for n, key in enumerate(MOMENTS, 1):
        still(cut, ours[key], shots / f"{n:02d}-{key}.png", "1280:720")
        ref = ref_times.get(key)
        if args.reference and ref is not None:
            side_by_side(Path(args.reference).expanduser(), ref, cut, ours[key], compare / f"{n:02d}-{key}.png")
            print(f"compare {n:02d} {key}: reference {ref:.2f}s | ours {ours[key]:.2f}s -> {compare / f'{n:02d}-{key}.png'}")
        else:
            print(f"ours    {n:02d} {key}: {ours[key]:.2f}s -> {shots / f'{n:02d}-{key}.png'}"
                  + ("" if not args.reference else " (no reference time: pass --at " + key + "=SECONDS)"))
    if args.check:
        subprocess.run([sys.executable, "-I", str(SCRIPTS / "check-cut.py"), str(cut), "--frames", str(work / "check")])
    if args.save_previews:
        preview = template.folder / "preview"
        if preview.is_symlink():
            fail(f"{preview} is a symlink; refusing to write previews through it")
        preview.mkdir(exist_ok=True)
        for n, key in enumerate(MOMENTS, 1):
            shutil.copyfile(shots / f"{n:02d}-{key}.png", preview / f"{n:02d}.png")
        print(f"previews: 6 frames of the todo sample in {template.id} -> {preview}")
    print(f"cut: {cut}")
    lib.output(compare if args.reference else shots)


if __name__ == "__main__":
    main()
