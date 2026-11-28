#!/usr/bin/env python3
"""Storyboard: what the keynote cut will look like, before anything is recorded or cut.

It builds the cut from demo.json with the real engine (the same plan, look, template, window, padding,
corner radius, pills, captions, titles in the chosen font and colours, cards and end card) and keeps
a few composed frames per scene: (a) the whole page it opens on and (b) the zoom (or the crop) the
scene pushes into. A scene's picture is its raw take when every take exists; else a still of the
take's frame, the scout screenshot recordings/scout/<stem>.png (or .jpg/.webp), or a plain
placeholder when there is neither. Each scene is as long as its `trim`, or about as long as its
voiceover when it has no trim yet.

Usage (from the demo dir): storyboard.py [demo.json]
Output: storyboard/index.html (one page, scenes in order), storyboard/storyboard.png (contact
sheet), storyboard/frames/*.png.
Then: storyboard.py --serve [demo.json] serves that page on 127.0.0.1 (a free port, printed as
OUTPUT http://...) until stopped. Each scene and card has a comment box; what the user types is
saved as it is typed to storyboard/comments.json ({item key: text, "overall": text, "updated": iso}).
Open the URL for the user and wait for approval or changes.
Needs ffmpeg and node with playwright-core and Chrome. Prints PROGRESS and OUTPUT lines.
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import demolib as lib  # noqa: E402
from keynote import spec  # noqa: E402
from keynote.brand import check_font_files, load_brand  # noqa: E402
from keynote.compose import composite  # noqa: E402
from keynote.model import Card, PlanError, Shot, is_tight  # noqa: E402
from keynote.render import title_family  # noqa: E402
from keynote.storyboard_comments import make_server  # noqa: E402
from keynote.storyboard_page import Frame, page, push_marks  # noqa: E402
from keynote.timeline import build_plan  # noqa: E402
from keynote.voice_sync import measure_line  # noqa: E402

TOOL = "storyboard"
PICTURES = (".png", ".jpg", ".jpeg", ".webp")
WORDS_PER_SECOND = 2.5   # a scene with no trim yet lasts about as long as its voiceover
MIN_SCENE = 4.0          # ... and at least this long
PLACEHOLDER = "F3F3F6"


def fail(message: str) -> None:
    sys.exit(f"{TOOL}: {message}")


def load_build_keynote():
    """build-keynote.py as a module (its file name has a dash), for its look and render steps."""
    module_spec = importlib.util.spec_from_file_location("build_keynote", HERE / "build-keynote.py")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def take_path(demo_dir: Path, item: dict) -> Path:
    return demo_dir / "recordings" / "raw" / f"{item['stem']}-t{item.get('take', 1)}.mp4"


def scene_seconds(item: dict) -> float:
    """How long the scene's take must be: up to its trim's out point, else about its voiceover."""
    trim = item.get("trim") or [None, None]
    if trim[1] is not None:
        return float(trim[1])
    spoken = len(item.get("voiceover", "").split()) / WORDS_PER_SECOND + 1.0
    return float(trim[0] or 0) + max(MIN_SCENE, spoken) * float(item.get("speed", 1))


def scout_picture(demo_dir: Path, stem: str) -> Path | None:
    for ext in PICTURES:
        path = demo_dir / "recordings" / "scout" / f"{stem}{ext}"
        if path.is_file():
            return lib.ensure_inside(demo_dir, path, f"scout picture {path.name}")
    return None


def still_take(picture: Path | None, frame_at: float | None, seconds: float, size: tuple[int, int], out: Path) -> None:
    """A still take: one picture (a take frame, a scout screenshot or a plain placeholder) held for
    `seconds`, at the take size, top aligned and padded white (a page shorter than the window)."""
    w, h = size
    fit = f"scale={w}:-2:flags=lanczos,crop={w}:'min(ih,{h})':0:0,pad={w}:{h}:0:0:color=white,setsar=1,format=yuv420p"
    if picture is None:
        source = ["-f", "lavfi", "-i", f"color=c=0x{PLACEHOLDER}:s={w}x{h}:r={spec.FPS}"]
    elif frame_at is not None:
        source = ["-ss", f"{frame_at:.3f}", "-i", picture]
    else:
        source = ["-i", picture]
    lib.run(["ffmpeg", "-y", "-loglevel", "error", *source, "-frames:v", "1", "-vf", fit, out.with_suffix(".png")])
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(spec.FPS), "-i",
             out.with_suffix(".png"), "-t", f"{seconds:.3f}", "-c:v", "libx264", "-preset", "ultrafast",
             "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(spec.FPS), out])
    out.with_suffix(".png").unlink()


def prepare_takes(cfg: dict, demo_dir: Path, work: Path) -> tuple[Path, dict[str, str]]:
    """(raw folder the plan reads, scene key -> where its picture came from). Every take recorded:
    the real recordings/raw. Otherwise still takes in the work folder, one per stem and take."""
    scenes = [i for i in cfg["sequence"] if "scene" in i]
    if scenes and all(take_path(demo_dir, i).is_file() for i in scenes):
        return demo_dir / "recordings" / "raw", {i["scene"]: "the raw take" for i in scenes}
    raw = work / "recordings" / "raw"
    raw.mkdir(parents=True)
    sources, made = {}, {}
    for item in scenes:
        name = f"{item['stem']}-t{item.get('take', 1)}.mp4"
        made.setdefault(name, []).append(item)
    for name, items in made.items():
        first = items[0]
        seconds = max(scene_seconds(i) for i in items) + 0.5
        take, scout = take_path(demo_dir, first), scout_picture(demo_dir, first["stem"])
        if take.is_file():
            picture, where = lib.ensure_inside(demo_dir, take, f"take {name}"), "a still of the raw take"
            at, size = float((first.get("trim") or [0])[0] or 0), lib.probe_size(picture)
        else:
            picture, at, size = scout, None, (1920, 1080)
            where = f"the scout screenshot {scout.relative_to(demo_dir.resolve())}" if scout else "no picture yet (placeholder)"
        still_take(picture, at, seconds, size, raw / name)
        for item in items:
            sources[item["scene"]] = where
    return raw, sources


def clamp_local(shot: Shot, t: float) -> float:
    return min(max(t, 0.0), (shot.frames - 1) / spec.FPS)


def first_zoom(plan, shot: Shot):
    """(run start s, zoom) of the first zoom that starts inside this shot, or None."""
    for run in plan.runs:
        base = run.start / spec.FPS
        for zoom in run.zooms:
            if shot.start <= run.start + zoom.at * spec.FPS < shot.start + shot.frames:
                return base, zoom
    return None


def scene_frames(plan, shot: Shot, first_in_run: bool) -> list[tuple]:
    """[(kind, caption, cut seconds, marks)]: the frame the scene opens on, then its zoom or its crop."""
    start = shot.start / spec.FPS
    settle_lead = spec.ENTRY_SECONDS + 0.15 if first_in_run else 0.15
    found = first_zoom(plan, shot)
    if shot.wide:
        opening = ("wide", f"Opens on the whole page, {shot.push_at - (spec.ENTRY_SECONDS if first_in_run else 0):.1f} s",
                   start + clamp_local(shot, shot.push_at - 0.15), push_marks(shot, found[1].focus if found else None))
    else:
        caption = ("Continues the scene before, on its crop" if shot.continues
                   else "Opens straight on a tight crop: see the W9 warning" if is_tight(shot.crop, shot.source_size)
                   else "Opens on its crop")
        opening = ("open", caption, start + clamp_local(shot, settle_lead), ())
    if found:
        base, zoom = found
        at = min(zoom.landed + spec.HIGHLIGHT_DELAY + spec.HIGHLIGHT_IN + 0.1, zoom.out_start - 0.05)
        return [opening, ("zoom", f"Zoom {zoom.scale:g}x at {base + zoom.at - start:.1f} s, held {zoom.hold:.1f} s",
                          base + at, ())]
    settled = shot.settled + 0.3 if shot.wide else settle_lead
    pills = [c for c in plan.callouts if start + settled <= c.start + 0.9 < c.end and c.start < start + shot.frames / spec.FPS]
    at = pills[0].start + 0.9 - start if pills else settled
    if not shot.wide and not pills:
        return [opening]
    return [opening, ("crop", "Pushed in to the crop" if shot.wide else "With its pill", start + clamp_local(shot, at), ())]


def card_frames(card: Card) -> list[tuple]:
    start = card.start / spec.FPS
    shown = start + min(card.frames - 1, card.frames * 0.85) / spec.FPS
    frames = [("card", {"hero": "Title card", "section": "Section card", "end": "End card"}[card.kind], shown, ())]
    if card.outro_frames:
        frames.append(("outro", "Logo outro", (card.start + card.frames + card.outro_frames - 2) / spec.FPS, ()))
    return frames


def wanted_frames(plan) -> list[tuple]:
    """[(item, kind, caption, cut seconds, marks)] in cut order."""
    out, previous = [], None
    for item in plan.items:
        if isinstance(item, Card):
            out += [(item, *f) for f in card_frames(item)]
        else:
            out += [(item, *f) for f in scene_frames(plan, item, not isinstance(previous, Shot))]
        previous = item
    return out


def grab(video: Path, wanted: list, folder: Path) -> list[Path]:
    """One PNG per wanted frame, in a single pass over the composited cut."""
    numbers = sorted({round(w[3] * spec.FPS) for w in wanted})
    expression = "+".join(f"eq(n\\,{n})" for n in numbers)
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-vf", f"select='{expression}'",
             "-fps_mode", "passthrough", folder / "grab-%03d.png"])
    grabbed = {n: folder / f"grab-{i + 1:03d}.png" for i, n in enumerate(numbers)}
    out = []
    for k, (item, kind, _, t, _) in enumerate(wanted):
        target = folder / f"{k + 1:02d}-{item.key}-{kind}.png"
        source = grabbed[round(t * spec.FPS)]
        target.write_bytes(source.read_bytes())
        out.append(target)
    for path in grabbed.values():
        path.unlink(missing_ok=True)
    return out


def thumbnail_uri(png: Path, work: Path) -> str:
    small = work / f"{png.stem}.jpg"
    lib.run(["ffmpeg", "-y", "-loglevel", "error", "-i", png, "-vf", "scale=640:-2", "-q:v", "4", small])
    data = base64.b64encode(small.read_bytes()).decode()
    small.unlink()
    return f"data:image/jpeg;base64,{data}"


def contact_sheet(html: str, out: Path, work: Path) -> None:
    job = work / "sheet.html"
    job.write_text(html)
    result = subprocess.run(["node", str(HERE / "storyboard-sheet.mjs"), str(job), str(out)],
                            capture_output=True, text=True)
    if result.returncode:
        fail(f"storyboard-sheet.mjs failed:\n{result.stderr[-1500:]}\nCheck Chrome with: bash {HERE / 'doctor.sh'}")


def serve(out_dir: Path) -> None:
    """Serves the built storyboard on 127.0.0.1 and saves the user's comments until stopped."""
    if not (out_dir / "index.html").is_file():
        fail(f"no storyboard yet in {out_dir}; build it first: python3 -I {Path(__file__).resolve()}")
    try:
        lib.refuse_symlinks_under(out_dir, "storyboard")
    except lib.UnsafePath as error:
        fail(str(error))
    server = make_server(out_dir)
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"storyboard: serving {out_dir} at {url}\nComments save to {out_dir / 'comments.json'}. "
          f"Stop with Ctrl-C.", flush=True)
    lib.output(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(prog="storyboard.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("config", nargs="?", default="demo.json")
    parser.add_argument("--serve", action="store_true",
                        help="serve the built storyboard on 127.0.0.1 and save comments to storyboard/comments.json")
    args = parser.parse_args()
    if args.serve:
        return serve(Path(args.config).resolve().parent / "storyboard")
    lib.require("ffmpeg", "ffprobe", "node")
    cfg_path = Path(args.config).resolve()
    cfg = lib.load_config(cfg_path, "demo", TOOL)
    demo_dir = cfg_path.parent
    out_dir, work = demo_dir / "storyboard", demo_dir / "storyboard" / ".work"
    try:
        lib.refuse_symlinks_under(out_dir, "storyboard")
        lib.refuse_symlinks_under(demo_dir / "recordings" / "voice-cache", "recordings/voice-cache")
    except lib.UnsafePath as error:
        fail(str(error))
    if work.exists():
        lib.safe_rmtree(demo_dir, work, "storyboard/.work")
    if (out_dir / "frames").exists():
        lib.safe_rmtree(demo_dir, out_dir / "frames", "storyboard/frames")
    (out_dir / "frames").mkdir(parents=True)
    work.mkdir()
    keynote = load_build_keynote()
    template_id, _, brand_cfg = keynote.resolve_look(cfg, demo_dir)
    try:
        brand = load_brand(brand_cfg)
        check_font_files(brand, demo_dir)
        raw, sources = prepare_takes(cfg, demo_dir, work)
        plan = build_plan(cfg, raw, keynote.probe, lambda text, number: measure_line(demo_dir, cfg, text, number))
    except (PlanError, lib.UnsafePath) as error:
        fail(f"{error}\nFix {cfg_path.name}, then run: python3 -I {Path(__file__).resolve()} {args.config}")
    for warning in plan.warnings:
        print(f"WARN {warning}", flush=True)
    render = work / "keynote"
    render.mkdir()
    bg_dir, overlays, windows, fonts, _ = keynote.render_graphics(plan, brand, cfg, demo_dir, render)
    video = work / "composite.mkv"
    composite(plan, windows, render, bg_dir, overlays, video)
    wanted = wanted_frames(plan)
    pngs = grab(video, wanted, out_dir / "frames")
    video.unlink()
    frames = [Frame(item, kind, caption, t, png, marks) for (item, kind, caption, t, marks), png in zip(wanted, pngs)]
    look = {"template": template_id or "house", "font": brand.font, "title_font": title_family(brand),
            "painted": fonts, "accent": brand.accent, "seconds": plan.seconds, "title": cfg["title"],
            "built": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    index = out_dir / "index.html"
    index.write_text(page(cfg, plan, frames, sources, look, lambda png: f"frames/{png.name}"))
    sheet = out_dir / "storyboard.png"
    contact_sheet(page(cfg, plan, frames, sources, look, lambda png: thumbnail_uri(png, work), sheet=True), sheet, work)
    lib.safe_rmtree(demo_dir, work, "storyboard/.work")
    print(f"storyboard: {len([i for i in plan.items if isinstance(i, Shot)])} scene(s), {plan.seconds:.1f}s, "
          f"{len(frames)} frame(s)\n{index}\n{sheet}\n"
          f"Show it with comments: python3 -I {Path(__file__).resolve()} --serve {args.config}")
    lib.output(index)


if __name__ == "__main__":
    main()
