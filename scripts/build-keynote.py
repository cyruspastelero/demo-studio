#!/usr/bin/env python3
"""Keynote cut from demo.json, built to docs/quality-bar.md: the product in one floating rounded
window cropped to the UI that matters, rising in once and staying put while clips cut inside it;
whole-window zooms (1.15x, ease-in-out sine); red highlight boxes glued to the UI; callout pills
under the window; word-by-word title cards in bundled Inter; a timed end card with a brand sweep
and logo outro; a soft drifting pastel background. Video only: run narrate.py next for voice and music.

Usage (from the demo dir): build-keynote.py [demo.json] [--strict]
  --strict   treat quality-bar warnings (shot too long, pill too long, no accent word, a highlight over
             a take that scrolls under it...) as errors
Needs: recordings/raw/<stem>-t<take>.mp4, ffmpeg, node with playwright-core and Chrome.
Output: recordings/exports/<slug>-keynote-cut.mp4 (1920x1080, 30 fps, H.264 High, BT.709, 2 s GOP)
plus <slug>-keynote-cut.timing.json (narrate.py reads it) and <slug>-keynote-cut.plan.json (where
every window, zoom, pill, box and card is; check-cut.py reads it). Prints PROGRESS and OUTPUT lines.
Rebuilds are incremental: graphics are cached by content in recordings/exports/.keynote/png/.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # demolib, keynote/ and narration/ sit next to this file

import demolib as lib  # noqa: E402
from keynote import spec  # noqa: E402
from keynote.brand import background_keyframes, load_brand  # noqa: E402
from keynote.compose import composite, encode  # noqa: E402
from keynote.model import Card, PlanError  # noqa: E402
from keynote.motion import highlight_warnings  # noqa: E402
from keynote.overlay import OverlayTimeline, pill_state, title_card_state  # noqa: E402
from keynote.render import Renderer, RenderError, check_fonts, image_uri, window_statics  # noqa: E402
from keynote.timeline import build_plan  # noqa: E402
from keynote.voice_sync import sync_end_card  # noqa: E402
from keynote.window import run_frames  # noqa: E402

TOOL = "build-keynote"


def fail(message: str) -> None:
    sys.exit(f"{TOOL}: {message}")


def probe(path: Path) -> tuple[float, tuple[int, int]]:
    return lib.duration(path), lib.probe_size(path)


def collect_images(cfg: dict, demo_dir: Path, plan) -> dict[str, str]:
    images = {}
    try:
        if cfg.get("logo"):
            images["logo"] = image_uri(demo_dir, cfg["logo"], "logo")
        dark = cfg.get("brand", {}).get("logo_on_dark")
        if dark:
            images["logo-dark"] = image_uri(demo_dir, dark, "brand.logo_on_dark")
        for callout in plan.callouts:
            if callout.avatar and callout.avatar not in images:
                images[callout.avatar] = image_uri(demo_dir, callout.avatar, "callouts[].avatar")
    except lib.UnsafePath as error:
        fail(f"{error}. Put the image inside the demo folder and use a relative path.")
    return images


def font_probe(plan) -> dict:
    from keynote.model import Callout
    card = next((c for c in plan.cards), None)
    state = {"pill": pill_state(Callout(0, 3, "statement", "Probe text"), 1.0)}
    if card:
        state["card"] = title_card_state(card, 5.0, 99.0, 0.4)
    return state


def render_graphics(plan, brand, cfg, demo_dir: Path, work: Path) -> tuple[Path, tuple[Path, Path], dict, list[str]]:
    images = collect_images(cfg, demo_dir, plan)
    renderer = Renderer(work, brand, images, has_logo="logo" in images)
    windows = {n: run_frames(run) for n, run in enumerate(plan.runs)}
    by_frame = {run.start + i: f for n, run in enumerate(plan.runs) for i, f in enumerate(windows[n])}
    end_card = plan.cards[-1] if plan.cards and plan.cards[-1].kind == "end" else None
    timeline = OverlayTimeline(plan, by_frame, cfg["title"], sync_end_card(end_card, demo_dir, cfg),
                               has_logo="logo" in images)
    bg_keys = [renderer.add({"background": state}) for state in background_keyframes(brand, plan.seconds)]
    statics = {s["name"]: renderer.add(s["state"], tuple(s["size"])) for s in window_statics()}
    layers = [timeline.layers(f) for f in range(plan.total_frames)]
    under_keys = [renderer.add(under) for under, _ in layers]
    over_keys = [renderer.add(over) for _, over in layers]
    print(f"overlay: {len(set(under_keys) | set(over_keys))} unique frame(s) for {plan.total_frames} frames",
          flush=True)
    try:
        fonts = renderer.run(font_probe(plan))
    except RenderError as error:
        fail(str(error))
    check_fonts(fonts, brand)
    bg_dir = renderer.link_sequence("seq-bg", bg_keys, "k%04d.png")
    under_dir = renderer.link_sequence("seq-under", under_keys, "f%05d.png")
    over_dir = renderer.link_sequence("seq-over", over_keys, "f%05d.png")
    static_dir = renderer.link_sequence("png-static", list(statics.values()), "static-%d.png")
    for i, name in enumerate(statics):
        (static_dir / f"static-{i}.png").rename(static_dir / name)
    renderer.prune(set(bg_keys) | set(under_keys) | set(over_keys) | set(statics.values()))
    return bg_dir, (under_dir, over_dir), windows, fonts


def highlight_sidecar(plan, folder: Path) -> list[dict]:
    """Each box with its rect and how its cut time maps onto the raw take (check-cut.py H8)."""
    out = []
    for h in plan.highlights:
        shot = plan.shots[h.shot]
        out.append({"start": round(h.start, 3), "end": round(h.end, 3), "rect": list(h.rect), "where": h.where,
                    "scene": shot.key, "take": os.path.relpath(shot.source, folder),
                    "take_size": list(shot.source_size), "shot_start": round(shot.start / spec.FPS, 3),
                    "shot_end": round((shot.start + shot.frames) / spec.FPS, 3), "trim_in": shot.trim_in,
                    "speed": shot.speed})
    return out


def write_sidecars(final: Path, cfg: dict, plan, fonts: list[str], brand) -> Path:
    """timing.json (narrate.py) and plan.json (check-cut.py)."""
    items = []
    for n, item in enumerate(plan.items):
        frames = item.frames + (item.outro_frames if isinstance(item, Card) else 0)
        items.append({"index": n, "key": item.key, "start": round(item.start / spec.FPS, 3),
                      "duration": round(frames / spec.FPS, 3)})
    timing = final.with_suffix(".timing.json")
    timing.write_text(json.dumps({"video": final.name, "total": round(plan.seconds, 3),
                                  "outro": round(plan.outro_frames / spec.FPS, 3), "items": items}, indent=2) + "\n")
    runs = []
    for run in plan.runs:
        base = run.start / spec.FPS
        runs.append({"start": round(base, 3), "end": round(run.end / spec.FPS, 3),
                     "zooms": [{"start": round(base + z.at, 3), "landed": round(base + z.landed, 3),
                                "out": round(base + z.out_start, 3), "end": round(base + z.end, 3),
                                "scale": z.scale} for z in run.zooms],
                     "cuts": [round(plan.shots[s].start / spec.FPS, 3) for s in run.shots[1:]]})
    sidecar = {"video": final.name, "total": round(plan.seconds, 3), "runs": runs,
               "cards": [{"key": c.key, "kind": c.kind, "start": round(c.start / spec.FPS, 3),
                          "end": round((c.start + c.frames) / spec.FPS, 3), "accent": c.accent,
                          "outro": round(c.outro_frames / spec.FPS, 3)} for c in plan.cards],
               "callouts": [{"start": round(c.start, 3), "end": round(c.end, 3), "kind": c.kind, "text": c.text}
                            for c in plan.callouts],
               "highlights": highlight_sidecar(plan, final.parent),
               "brand": {"accent": brand.accent, "sweep": list(brand.sweep), "highlight": brand.highlight,
                         "pill": brand.pill_text},
               "fonts": fonts, "warnings": list(plan.warnings)}
    final.with_suffix(".plan.json").write_text(json.dumps(sidecar, indent=2) + "\n")
    return timing


def card_stills(final: Path, plan, work: Path) -> None:
    """A still of each card at full reveal, for keynote-handoff.py (04-graphics/title-cards)."""
    for card in plan.cards:
        at = (card.start + min(card.frames - 1, card.frames * 0.8)) / spec.FPS
        lib.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{at:.3f}", "-i", final, "-frames:v", "1",
                 work / f"{card.key}.png"])


def main() -> None:
    parser = argparse.ArgumentParser(prog="build-keynote.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("config", nargs="?", default="demo.json")
    parser.add_argument("items", nargs="*", help=argparse.SUPPRESS)  # old per-item rebuild; caching replaces it
    parser.add_argument("--strict", action="store_true", help="fail on quality-bar warnings")
    parser.add_argument("--keep-work", action="store_true", help="keep the frame sequences and intermediate (debugging)")
    args = parser.parse_args()
    lib.require("ffmpeg", "ffprobe", "node")
    cfg_path = Path(args.config).resolve()
    cfg = lib.load_config(cfg_path, "demo", TOOL)
    demo_dir = cfg_path.parent
    rec = demo_dir / "recordings"
    try:
        brand = load_brand(cfg.get("brand"))
        plan = build_plan(cfg, rec / "raw", probe)
    except PlanError as error:
        fail(f"{error}\nFix {cfg_path.name}, then run: python3 -I {Path(__file__).resolve()} {args.config}")
    plan = dataclasses.replace(plan, warnings=plan.warnings + tuple(highlight_warnings(plan)))
    for warning in plan.warnings:
        print(f"WARN {warning}", flush=True)
    if args.strict and plan.warnings:
        fail(f"{len(plan.warnings)} quality-bar warning(s) above; fix them or run without --strict")
    work = rec / "exports" / ".keynote"
    work.mkdir(parents=True, exist_ok=True)
    try:
        lib.refuse_symlinks_under(rec / "exports", "recordings/exports")
    except lib.UnsafePath as error:
        fail(str(error))
    bg_dir, overlays, windows, fonts = render_graphics(plan, brand, cfg, demo_dir, work)
    final = rec / "exports" / f"{lib.slugify(cfg['title'])}-keynote-cut.mp4"
    intermediate = work / "composite.mkv"
    composite(plan, windows, work, bg_dir, overlays, intermediate)
    encode(intermediate, final, work, plan.total_frames)
    if not args.keep_work:
        intermediate.unlink(missing_ok=True)
        for folder in ("seq-bg", "seq-under", "seq-over"):
            lib.safe_rmtree(work, work / folder, f".keynote/{folder}")
    timing = write_sidecars(final, cfg, plan, fonts, brand)
    card_stills(final, plan, work)
    print(f"{final} ({lib.duration(final):.1f}s)\ntiming: {timing}\n"
          f"Next: narrate it (voice + music):  python3 -I {Path(__file__).resolve().parent / 'narrate.py'} "
          f"{args.config}\nThen check it against the bar:  python3 -I "
          f"{Path(__file__).resolve().parent / 'check-cut.py'} {final.with_name(final.stem + '-narrated.mp4')}")
    if shutil.which("say") is None:
        print("(no macOS say here: narrate with --voice files or ElevenLabs)")
    lib.output(final)


if __name__ == "__main__":
    main()
