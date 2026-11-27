#!/usr/bin/env python3
"""Look templates: list them, show one, or validate one (docs/templates.md).

Usage:
  python3 -I scripts/templates.py list [--json]       every template, workspace first, then built-in
  python3 -I scripts/templates.py show <id> [--json]  where it is, its look merged over the house look
  python3 -I scripts/templates.py validate <id>       schema, folder layout, previews; exit 1 on a problem
  python3 -I scripts/templates.py suggest --traits "dark ui, fintech" [--kind look|motion] [--json]
                                                      the template whose best_for tags match the product
                                                      best, and a line to tell the user why
Options: --demo-dir DIR (search that demo's workspace, as build-keynote.py does for that demo).
Workspace templates live in <demos root>/_templates/<id>/: $DEMO_ROOT, else the demos workspace that
holds the demo (it has check.py and AGENTS.md), else ./demos; built-ins in <plugin>/look-templates/<id>/.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from keynote import look as looks  # noqa: E402
from keynote.templates import REPO, TemplateError, available, demo_root, find  # noqa: E402

PREVIEWS = [f"{n:02d}.png" for n in range(1, 7)]
PNG = b"\x89PNG\r\n\x1a\n"
DEFAULT = {"look": "house", "motion": "airy"}
MOTION_BUILT_IN = REPO / "motion-templates"


def png_size(path: Path) -> tuple[int, int] | None:
    head = path.read_bytes()[:24]
    if not head.startswith(PNG):
        return None
    return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")


def folder_problems(folder: Path) -> list[str]:
    """Layout rules: README.md and source.json present, six 1280x720 previews, nothing symlinked, no
    video or audio inside (a template holds measurements, never the reference itself)."""
    out = []
    for name in ("README.md", "source.json"):
        if not (folder / name).is_file():
            out.append(f"missing {name}")
    for name in PREVIEWS:
        path = folder / "preview" / name
        if not path.is_file():
            out.append(f"missing preview/{name}")
        elif png_size(path) != (1280, 720):
            out.append(f"preview/{name} is {png_size(path) or 'not a PNG'}, needs 1280x720 PNG")
    for path in folder.rglob("*"):
        if path.is_symlink():
            out.append(f"{path.relative_to(folder)} is a symlink")
        elif path.suffix.lower() in {".mp4", ".mov", ".m4a", ".mp3", ".wav", ".webm", ".mkv", ".aac"}:
            out.append(f"{path.relative_to(folder)}: no video or audio in a template folder")
    source = folder / "source.json"
    if source.is_file():
        try:
            data = json.loads(source.read_text())
            allowed = {"file", "duration", "sha256", "created", "width", "height", "fps", "tool", "_comment"}
            extra = sorted(set(data) - allowed)
            if extra:
                out.append(f"source.json has fields beyond provenance: {', '.join(extra)}")
        except json.JSONDecodeError as error:
            out.append(f"source.json is not valid JSON: {error}")
    return out


def words(text: str) -> set[str]:
    """Lowercase words with a plural s dropped, so "developer tools" meets the tag "developer tool"."""
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in re.split(r"[^a-z0-9]+", text.lower()) if w}


def candidates(kind: str, demo_dir: Path | None, cwd: Path | None) -> list[dict]:
    """Every usable template of a kind as {id, name, where, best_for}; broken ones are skipped."""
    if kind == "look":
        out = []
        for template_id, where, _ in available(demo_dir, cwd):
            try:
                t = find(template_id, demo_dir, cwd)
            except TemplateError:
                continue
            out.append({"id": t.id, "name": t.name, "where": where, "best_for": t.data.get("best_for", [])})
        return out
    root = demo_root(demo_dir, cwd)
    dirs = [("workspace", Path(os.environ["MOTION_TEMPLATES_DIR"])) if os.environ.get("MOTION_TEMPLATES_DIR") else None,
            ("workspace", root / "_motion-templates") if root else None, ("built-in", MOTION_BUILT_IN)]
    out, seen = [], set()
    for where, folder in filter(None, dirs):
        for path in sorted(folder.glob("*/style.json")) if folder.is_dir() else []:
            if path.parent.name in seen or path.is_symlink():
                continue
            try:
                data = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            seen.add(path.parent.name)
            out.append({"id": path.parent.name, "name": data.get("name", path.parent.name), "where": where,
                        "best_for": data.get("best_for", [])})
    return out


def suggest(kind: str, traits: str, demo_dir: Path | None = None, cwd: Path | None = None) -> dict:
    """The best match for the traits: most tags matched (a tag matches when all its words are in the
    traits), then workspace before built-in, then the default, then by id. Nothing matched: the default."""
    have = words(traits)
    rows = []
    for c in candidates(kind, demo_dir, cwd):
        matched = [tag for tag in c["best_for"] if tag != "default" and words(tag) <= have]
        rows.append({**c, "matched": matched})
    rank = lambda r: (-len(r["matched"]), r["where"] != "workspace", r["id"] != DEFAULT[kind], r["id"])  # noqa: E731
    rows.sort(key=rank)
    pick = rows[0] if rows and rows[0]["matched"] else next(r for r in rows if r["id"] == DEFAULT[kind])
    what, say = ("Look", "use template") if kind == "look" else ("Ad style", "use style")
    reason = (f"picked because the product is: {', '.join(pick['matched'])}" if pick["matched"]
              else "the default, since no other template's tags matched this product")
    others = ", ".join(r["id"] for r in rows if r["id"] != pick["id"]) or "none yet"
    label = pick["id"] if pick["name"] == pick["id"] else f"{pick['name']} ({pick['id']})"
    pick["tell_user"] = (f"{what}: {label}, {reason}. "
                         f"To change it, say \"{say} <id>\" (others: {others}).")
    pick["ranking"] = [{"id": r["id"], "where": r["where"], "matched": r["matched"]} for r in rows]
    return pick


def print_suggestion(pick: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(pick, indent=2))
        return
    for row in pick["ranking"]:
        print(f"  {row['id']:<28} {row['where']:<9} matched: {', '.join(row['matched']) or '-'}")
    print(f"pick {pick['id']} ({pick['where']}): matched {', '.join(pick['matched']) or 'nothing, so the default'}")
    print(f"tell the user: {pick['tell_user']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="templates.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=["list", "show", "validate", "suggest"])
    parser.add_argument("id", nargs="?")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--demo-dir")
    parser.add_argument("--traits", help="suggest: the product's look traits (UI tone, category, audience)")
    parser.add_argument("--kind", choices=["look", "motion"], default="look",
                        help="suggest: a look template for keynote cuts, or a motion style for launch ads")
    args = parser.parse_args(argv)
    demo_dir = Path(args.demo_dir).resolve() if args.demo_dir else None
    if args.command == "suggest":
        if not args.traits:
            parser.error('suggest needs --traits, for example --traits "dark ui, fintech, for CFOs"')
        print_suggestion(suggest(args.kind, args.traits, demo_dir), args.json)
        return 0
    if args.command == "list":
        rows = []
        for template_id, where, folder in available(demo_dir):
            try:
                t = find(template_id, demo_dir)
                rows.append({"id": t.id, "name": t.name, "description": t.description, "where": where,
                             "folder": str(folder), "best_for": t.data.get("best_for", [])})
            except TemplateError as error:
                rows.append({"id": template_id, "name": "(invalid)", "description": str(error).splitlines()[0],
                             "where": where, "folder": str(folder)})
        if args.json:
            print(json.dumps(rows, indent=2))
        else:
            for row in rows:
                tags = f" [for: {', '.join(row['best_for'])}]" if row.get("best_for") else ""
                print(f"{row['id']:<28} {row['where']:<9} {row['name']}: {row['description']}{tags}")
            print(f"{len(rows)} template(s). Use one: set \"template\": \"<id>\" in demo.json.")
        return 0
    if not args.id:
        parser.error(f"{args.command} needs a template id")
    try:
        t = find(args.id, demo_dir)
    except TemplateError as error:
        print(f"templates: {error}", file=sys.stderr)
        return 1
    if args.command == "show":
        info = {"id": t.id, "name": t.name, "description": t.description, "where": t.where,
                "folder": str(t.folder), "look": looks.effective(t.look)}
        if args.json:
            print(json.dumps(info, indent=2))
        else:
            print(f"{t.id} ({t.where}) {t.folder}\n{t.name}: {t.description}\neffective look:")
            print(json.dumps(info["look"], indent=2))
        return 0
    problems = folder_problems(t.folder)
    for problem in problems:
        print(f"FAIL {problem}")
    print(f"{'ok' if not problems else 'FAIL'} {t.id}: schema valid"
          + (", folder complete" if not problems else f", {len(problems)} folder problem(s)"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
