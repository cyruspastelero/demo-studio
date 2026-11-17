#!/usr/bin/env python3
"""Look templates: list them, show one, or validate one (docs/templates.md).

Usage:
  python3 -I scripts/templates.py list [--json]       every template, workspace first, then built-in
  python3 -I scripts/templates.py show <id> [--json]  where it is, its look merged over the house look
  python3 -I scripts/templates.py validate <id>       schema, folder layout, previews; exit 1 on a problem
Options: --demo-dir DIR (search that demo's workspace, as build-keynote.py does for that demo).
Workspace templates live in <demos root>/_templates/<id>/: $DEMO_ROOT, else the demos workspace that
holds the demo (it has check.py and AGENTS.md), else ./demos; built-ins in <plugin>/look-templates/<id>/.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from keynote import look as looks  # noqa: E402
from keynote.templates import TemplateError, available, find  # noqa: E402

PREVIEWS = [f"{n:02d}.png" for n in range(1, 7)]
PNG = b"\x89PNG\r\n\x1a\n"


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="templates.py", description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=["list", "show", "validate"])
    parser.add_argument("id", nargs="?")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--demo-dir")
    args = parser.parse_args(argv)
    demo_dir = Path(args.demo_dir).resolve() if args.demo_dir else None
    if args.command == "list":
        rows = []
        for template_id, where, folder in available(demo_dir):
            try:
                t = find(template_id, demo_dir)
                rows.append({"id": t.id, "name": t.name, "description": t.description, "where": where,
                             "folder": str(folder)})
            except TemplateError as error:
                rows.append({"id": template_id, "name": "(invalid)", "description": str(error).splitlines()[0],
                             "where": where, "folder": str(folder)})
        if args.json:
            print(json.dumps(rows, indent=2))
        else:
            for row in rows:
                print(f"{row['id']:<28} {row['where']:<9} {row['name']}: {row['description']}")
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
