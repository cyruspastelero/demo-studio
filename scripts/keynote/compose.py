"""ffmpeg composites the cut: drifting background, one window layer per run (clips cropped, scaled,
rounded and placed on the window card, then scaled and moved per frame), and the overlay frames on
top. It renders a lossless intermediate once, then encodes it in two passes to the bar (E1 to E7)."""
from __future__ import annotations

from pathlib import Path
from typing import Sequence

import demolib as lib

from . import spec
from .model import Plan, Run
from .window import CANVAS_H, CANVAS_W, WindowFrame


def piecewise(values: Sequence[int], start_frame: int) -> str:
    """An ffmpeg expression in t that returns values[i] on frame start_frame + i (balanced if-tree).
    Callers wrap it in single quotes, where the filtergraph parser takes commas literally."""
    pieces: list[tuple[int, int]] = []          # (first frame, value)
    for i, value in enumerate(values):
        if not pieces or pieces[-1][1] != value:
            pieces.append((start_frame + i, value))

    def tree(lo: int, hi: int) -> str:
        if lo == hi:
            return str(pieces[lo][1])
        mid = (lo + hi + 1) // 2
        threshold = (pieces[mid][0] - 0.5) / spec.FPS
        return f"if(lt(t,{threshold:.4f}),{tree(lo, mid - 1)},{tree(mid, hi)})"

    return tree(0, len(pieces) - 1)


def shot_chain(label_in: str, shot, out: str) -> str:
    crop = shot.crop
    w, h, x, y = (int(round(v)) for v in (crop.w, crop.h, crop.x, crop.y))
    return (f"[{label_in}]setpts=(PTS-STARTPTS)/{shot.speed},fps={spec.FPS},crop={w}:{h}:{x}:{y},"
            f"scale={int(spec.WINDOW_REST.w)}:{int(spec.WINDOW_REST.h)}:flags=lanczos,setsar=1,format=rgb24,"
            f"tpad=stop_mode=clone:stop={spec.FPS * 2},trim=end_frame={shot.frames},setpts=PTS-STARTPTS[{out}]")


def render_run_content(n: int, run: Run, plan: Plan, out: Path) -> None:
    """Stage 1: the run's clips, cropped and scaled to the rest window, cut together, as lossless RGB."""
    inputs, parts = [], []
    for k, shot_index in enumerate(run.shots):
        shot = plan.shots[shot_index]
        inputs += ["-ss", f"{shot.trim_in:.3f}", "-t", f"{shot.trim_out - shot.trim_in:.3f}", "-i", shot.source]
        parts.append(shot_chain(f"{k}:v", shot, f"s{k}"))
    labels = "".join(f"[s{k}]" for k in range(len(run.shots)))
    graph = ";".join(parts) + f";{labels}concat=n={len(run.shots)}:v=1:a=0,trim=end_frame={run.frames}[out]"
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", graph, "-map", "[out]",
                      "-c:v", "libx264rgb", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "rgb24", out],
                     f"window-run{n}", run.frames)


def run_layer(n: int, run: Run, frames: list[WindowFrame], total: int, inputs: tuple[int, int, int]) -> str:
    """Window layer L{n} on the cut's clock: rounded content on the window card, transparent before the
    run starts, scaled per frame. inputs = (content, mask, card) input indexes."""
    content, mask, card = inputs
    w = piecewise([f.canvas_w for f in frames], run.start)
    h = piecewise([f.canvas_h for f in frames], run.start)
    chain = [f"[{mask}:v]alphaextract[r{n}m]",
             f"[{content}:v]format=rgba,trim=end_frame={run.frames},setpts=PTS-STARTPTS[r{n}c]",
             f"[r{n}c][r{n}m]alphamerge,pad={CANVAS_W}:{CANVAS_H}:{spec.CANVAS_PAD_SIDE}:{spec.CANVAS_PAD_TOP}:"
             f"color=black@0[r{n}p]",
             f"[{card}:v]format=rgba[r{n}k]",
             f"[r{n}k][r{n}p]overlay=0:0:format=auto:shortest=1,format=rgba,"
             f"tpad=start={run.start}:color=black@0,trim=end_frame={min(total, run.end)},"
             f"scale=w='{w}':h='{h}':eval=frame:flags=bicubic"]
    if run.fade_out:
        fade_start = (run.end - spec.EXIT_FRAMES) / spec.FPS
        chain[-1] += f",fade=t=out:st={fade_start:.4f}:d={spec.EXIT_FRAMES / spec.FPS:.4f}:alpha=1"
    chain[-1] += f"[L{n}]"
    return ";\n".join(chain)


def filter_graph(plan: Plan, windows: dict[int, list[WindowFrame]], run_inputs: list[tuple[int, int, int]]) -> str:
    """Inputs: 0 background keyframes, 1 overlay over the window, 2 overlay under it (title cards),
    then (content, mask, card) per run. Every input starts at t=0 and is finite."""
    total = plan.total_frames
    parts = [f"[0:v]framerate=fps={spec.FPS}:interp_start=0:interp_end=255:scene=100,"
             f"trim=end_frame={total},setpts=PTS-STARTPTS,format=gbrp[bg0]",
             f"[2:v]format=rgba[under]",
             "[bg0][under]overlay=0:0:format=gbrp:eof_action=pass[base]"]
    base = "base"
    for n, run in enumerate(plan.runs):
        frames = windows[n]
        parts.append(run_layer(n, run, frames, total, run_inputs[n]))
        x = piecewise([f.canvas_x for f in frames], run.start)
        y = piecewise([f.canvas_y for f in frames], run.start)
        parts.append(f"[{base}][L{n}]overlay=x='{x}':y='{y}':eval=frame:eof_action=pass:format=gbrp[b{n}]")
        base = f"b{n}"
    parts.append("[1:v]format=rgba[over]")
    parts.append(f"[{base}][over]overlay=0:0:format=gbrp:eof_action=pass,trim=end_frame={total},"
                 "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
                 "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv[out]")
    return ";\n".join(parts) + "\n"


def composite(plan: Plan, windows: dict[int, list[WindowFrame]], work: Path, bg_dir: Path,
              overlays: tuple[Path, Path], out: Path) -> None:
    under_dir, over_dir = overlays
    rate = str(spec.FPS)
    # Fully opaque frames (the outro) come out of Chrome as RGB PNGs, the rest as RGBA. Without
    # -reinit_filter 0 that format change rebuilds the whole graph mid-cut and resets every trim.
    still = ["-reinit_filter", "0"]
    inputs = [*still, "-framerate", str(int(1 / spec.BG_KEYFRAME_SECONDS)), "-i", bg_dir / "k%04d.png",
              *still, "-framerate", rate, "-i", over_dir / "f%05d.png",
              *still, "-framerate", rate, "-i", under_dir / "f%05d.png"]
    run_inputs = []
    for n, run in enumerate(plan.runs):
        content = work / f"run{n}.mkv"
        render_run_content(n, run, plan, content)
        seconds = f"{run.frames / spec.FPS:.4f}"
        base = 3 + 3 * n
        inputs += ["-i", content,
                   "-loop", "1", "-framerate", rate, "-t", seconds, "-i", work / "png-static" / "window-mask.png",
                   "-loop", "1", "-framerate", rate, "-t", seconds, "-i", work / "png-static" / "window-card.png"]
        run_inputs.append((base, base + 1, base + 2))
    script = work / "composite.ffgraph"
    script.write_text(filter_graph(plan, windows, run_inputs))
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-/filter_complex", script,
                      "-map", "[out]", "-frames:v", plan.total_frames, "-c:v", "libx264", "-preset", "ultrafast",
                      "-qp", "0", "-pix_fmt", "yuv420p", out], "composite", plan.total_frames)
    for n in range(len(plan.runs)):
        (work / f"run{n}.mkv").unlink(missing_ok=True)


def encode(intermediate: Path, out: Path, work: Path, frames: int) -> None:
    """Two-pass H.264 High to the bar: >= 3.5 Mbps, BT.709 tags, 2 s GOP, faststart, 30 fps CFR."""
    log = work / "x264-2pass"
    common = ["-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-level:v", spec.X264_LEVEL,
              "-b:v", spec.VIDEO_BITRATE, "-maxrate", spec.VIDEO_MAXRATE, "-bufsize", spec.VIDEO_BUFSIZE,
              "-g", spec.GOP, "-keyint_min", spec.GOP, "-sc_threshold", "0", "-pix_fmt", "yuv420p",
              "-r", spec.FPS, "-fps_mode", "cfr", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-colorspace", "bt709", "-color_range", "tv", "-passlogfile", log, "-an"]
    common = ["-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv", *common]
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", "-i", intermediate, *common, "-pass", "1",
                      "-f", "null", "-"], "encode-pass1", frames)
    lib.run_progress(["ffmpeg", "-y", "-loglevel", "error", "-i", intermediate, *common, "-pass", "2",
                      "-video_track_timescale", "30000", "-movflags", "+faststart", out], "encode-pass2", frames)
    for leftover in work.glob("x264-2pass*"):
        leftover.unlink()
