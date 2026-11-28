"""The storyboard page (scripts/storyboard.py): every scene and card in cut order, with the composed
frames the real engine drew, the scene's length, narration line and on-screen text. The same page,
with small inline pictures, is screenshotted into the contact sheet. All text is escaped."""
from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from pathlib import Path
from typing import Callable

from . import spec
from .model import Card, Plan, Shot
from .spec import Rect


@dataclass(frozen=True)
class Frame:
    item: object                   # the Shot or Card it belongs to
    kind: str                      # wide | open | zoom | crop | card | outro
    caption: str
    t: float                       # cut seconds
    png: Path
    marks: tuple[tuple[str, Rect], ...] = field(default=())  # (label, frame px) drawn over the picture


def push_marks(shot: Shot, focus: tuple[float, float] | None) -> tuple[tuple[str, Rect], ...]:
    """On the whole-page frame: the crop it pushes into and the first zoom's target, in frame px
    (the window at rest showing `shot.wide`). Drawn on the page only, never in the video."""
    if not shot.wide:
        return ()
    rest, wide = spec.WINDOW_REST, shot.wide
    k = rest.w / wide.w

    def place(r: Rect) -> Rect:
        return Rect(rest.x + (r.x - wide.x) * k, rest.y + (r.y - wide.y) * k, r.w * k, r.h * k)

    marks = [("crop", place(shot.crop))]
    if focus:
        sx = shot.crop.x + (focus[0] - rest.x) / shot.scale
        sy = shot.crop.y + (focus[1] - rest.y) / shot.scale
        marks.append(("target", place(Rect(sx - 12, sy - 12, 24, 24))))
    return tuple(marks)


CSS = """
:root { color-scheme: light dark; --bg: #F6F5F3; --card: #FFFFFF; --ink: #1A1A1A; --muted: #5E5E5E;
  --line: #E2E0DC; --mark: #E8622A; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --card: #202020; --ink: #EDEDED; --muted: #A3A3A3;
  --line: #333333; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 1240px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 0; }
.meta, .muted { color: var(--muted); } .meta span + span::before { content: " · "; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -1px; }
.legend { margin: 12px 0 0; font-size: 14px; }
.warn { margin: 16px 0 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 10px; font-size: 14px; }
.warn ul { margin: 4px 0 0; padding-left: 20px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin-top: 18px; }
.head { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 10px 0 14px; font-size: 15px; }
dt { color: var(--muted); } dd { margin: 0; }
.frames { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
figure { margin: 0; } figcaption { font-size: 14px; color: var(--muted); margin-top: 6px; }
.shot { position: relative; aspect-ratio: 16 / 9; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
.shot img { display: block; width: 100%; height: 100%; }
.mark { position: absolute; border: 2px dashed var(--mark); border-radius: 4px; }
.mark.target { border-style: solid; border-radius: 50%; background: rgba(232, 98, 42, 0.25); }
body.sheet main { max-width: 1600px; padding: 24px; }
body.sheet section { display: grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 12px; margin-top: 10px; }
body.sheet dl { gap: 2px 8px; margin: 6px 0 0; font-size: 13px; }
body.sheet .frames { grid-template-columns: repeat(2, 1fr); }
"""


def seconds_of(item) -> float:
    frames = item.frames + (item.outro_frames if isinstance(item, Card) else 0)
    return frames / spec.FPS


def on_screen(entry: dict) -> list[str]:
    texts = []
    for c in entry.get("callouts", []):
        kind = c.get("kind", "statement")
        texts.append(f"{c['text']}, {c.get('role', '')}".strip(", ") if kind == "person" else c["text"])
    if "callouts" not in entry and entry.get("caption"):
        texts.append(entry["caption"])
    return texts


def figure(frame: Frame, src: Callable[[Path], str]) -> str:
    marks = "".join(
        f'<div class="mark {escape(label)}" style="left:{r.x / spec.FRAME_W:.2%};top:{r.y / spec.FRAME_H:.2%};'
        f'width:{r.w / spec.FRAME_W:.2%};height:{r.h / spec.FRAME_H:.2%}"></div>' for label, r in frame.marks)
    return (f'<figure><div class="shot"><img src="{escape(src(frame.png))}" alt="{escape(frame.caption)}">{marks}</div>'
            f"<figcaption>{escape(frame.caption)} ({frame.t:.1f} s into the cut)</figcaption></figure>")


def item_section(item, entry: dict, frames: list[Frame], source: str, src: Callable[[Path], str]) -> str:
    rows = [("Length", f"{seconds_of(item):.1f} s")]
    if isinstance(item, Card):
        name = {"hero": "Title card", "section": "Section card", "end": "End card"}[item.kind]
        heading = f"{name}: {item.title}"
        if item.subtitle:
            rows.append(("Subtitle", item.subtitle))
    else:
        heading = f"Scene {item.key}"
        texts = on_screen(entry)
        rows.append(("On screen", " / ".join(texts) if texts else "no pill"))
        rows.append(("Picture", source))
        crop = ", ".join(f"{v:.0f}" for v in item.crop)
        rows.append(("Framing", f"crop [{crop}] of the {item.source_size[0]}x{item.source_size[1]} take"
                     + (", opens on the whole page first" if item.wide else "")))
    rows.insert(1, ("Narration", entry.get("voiceover", "").strip() or "none"))
    details = "".join(f"<dt>{escape(k)}</dt><dd>{escape(v)}</dd>" for k, v in rows)
    pictures = "".join(figure(f, src) for f in frames)
    return (f'<section><div><div class="head"><h2>{escape(heading)}</h2></div><dl>{details}</dl></div>'
            f'<div class="frames">{pictures}</div></section>')


def page(cfg: dict, plan: Plan, frames: list[Frame], sources: dict[str, str], look: dict,
         src: Callable[[Path], str], sheet: bool = False) -> str:
    """The storyboard as one HTML page. `src` turns a frame PNG into an img src (a relative path for
    index.html, a small data: URI for the contact sheet)."""
    fonts = look["font"] if look["title_font"] == look["font"] else f"{look['font']}, titles {look['title_font']}"
    meta = [f"{len([i for i in plan.items if isinstance(i, Shot)])} scenes", f"about {look['seconds']:.0f} s",
            f"look {look['template']}", f"font {fonts}"]
    if look.get("painted"):
        meta.append(f"painted {', '.join(look['painted'])}")
    swatch = f'<span><i class="swatch" style="background:{escape(look["accent"][:7])}"></i> accent {escape(look["accent"][:7])}</span>'
    warnings = "".join(f"<li>{escape(w)}</li>" for w in plan.warnings)
    body = [f"<h1>{escape(look['title'])}: storyboard</h1>",
            '<div class="meta">' + "".join(f"<span>{escape(m)}</span>" for m in meta) + swatch + "</div>",
            '<p class="legend muted">Every picture is drawn by the same engine as the final cut. Dashed box: '
            "the crop a scene pushes into. Dot: its zoom target. Neither is in the video.</p>"]
    if warnings and not sheet:
        body.append(f'<div class="warn"><strong>Plan warnings</strong><ul>{warnings}</ul></div>')
    for item in plan.items:
        own = [f for f in frames if f.item is item]
        entry = cfg["sequence"][item.index]
        body.append(item_section(item, entry, own, sources.get(item.key, ""), src))
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f"<title>{escape(look['title'])} storyboard</title><style>{CSS}</style></head>"
            f'<body class="{"sheet" if sheet else ""}"><main>{"".join(body)}</main></body></html>\n')
