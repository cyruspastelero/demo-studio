"""Finding and loading look templates (docs/templates.md).

A template is a folder `<id>/` holding template.json, README.md, source.json and preview/01..06.png.
Search order, first match wins:
  1. workspace templates: `<demos root>/_templates/<id>/`, where the demos root is the demo's own
     parent folder, then $DEMO_ROOT, then ./demos, then <repo>/demos (a clone of the plugin)
  2. built-ins: `<repo>/look-templates/<id>/`
A symlinked template folder (or a symlinked template.json) is refused: a template shared by someone
else must not be able to point the engine at files outside its folder."""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path

import demolib as lib

from . import look as looks

ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
REPO = Path(__file__).resolve().parent.parent.parent
BUILT_IN = REPO / "look-templates"
LIST_COMMAND = f"python3 -I {REPO / 'scripts' / 'templates.py'} list"


class TemplateError(ValueError):
    """A template that cannot be found or used: says why and what to run."""


@dataclass(frozen=True)
class Template:
    id: str
    folder: Path
    where: str              # "workspace" or "built-in"
    data: dict

    @property
    def name(self) -> str:
        return self.data.get("name", self.id)

    @property
    def description(self) -> str:
        return self.data.get("description", "")

    @property
    def look(self) -> dict:
        return self.data.get("look", {})


def workspace_roots(demo_dir: Path | None = None, cwd: Path | None = None) -> list[Path]:
    """The `_templates` folders to search before the built-ins, in order, without duplicates."""
    candidates = []
    if demo_dir is not None:
        candidates.append(Path(demo_dir).parent / "_templates")
    if os.environ.get("DEMO_ROOT"):
        candidates.append(Path(os.environ["DEMO_ROOT"]) / "_templates")
    candidates.append(Path(cwd or Path.cwd()) / "demos" / "_templates")
    candidates.append(REPO / "demos" / "_templates")
    out: list[Path] = []
    for path in candidates:
        key = path.resolve() if path.exists() else path.absolute()
        if key not in [p.resolve() if p.exists() else p.absolute() for p in out]:
            out.append(path)
    return out


def search_path(demo_dir: Path | None = None, cwd: Path | None = None) -> list[tuple[str, Path]]:
    return [*(("workspace", p) for p in workspace_roots(demo_dir, cwd)), ("built-in", BUILT_IN)]


def check_id(value: object) -> str:
    if not isinstance(value, str) or not ID.match(value):
        raise TemplateError(f"template id {value!r} is not valid: use 3 to 64 lowercase letters, digits and dashes, "
                            "starting with a letter or digit (copied looks are <slug>-<6 hex>)")
    return value


def read_folder(folder: Path, template_id: str, where: str) -> Template:
    if folder.is_symlink():
        raise TemplateError(f"template folder {folder} is a symlink; refusing it. Copy the folder in instead "
                            "(cp -R), so the template cannot point outside itself")
    path = folder / "template.json"
    if path.is_symlink() or not path.is_file():
        raise TemplateError(f"{path} is missing or a symlink; a template folder needs its own template.json")
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        raise TemplateError(f"{path} is not valid JSON: {error}") from None
    errors = lib.validate(data, "template")
    if errors:
        raise TemplateError(f"{path} does not match schemas/template.schema.json:\n  " + "\n  ".join(errors))
    if data["id"] != template_id:
        raise TemplateError(f"{path}: id {data['id']!r} does not match its folder name {template_id!r}")
    extra = looks.problems(looks.effective(data["look"]))
    if extra:
        raise TemplateError(f"{path}: the look cannot be drawn:\n  " + "\n  ".join(extra))
    return Template(template_id, folder, where, data)


def available(demo_dir: Path | None = None, cwd: Path | None = None) -> list[tuple[str, str, Path]]:
    """(id, where, folder) of every template folder on the search path; the first of an id wins."""
    seen, out = set(), []
    for where, root in search_path(demo_dir, cwd):
        if not root.is_dir() or root.is_symlink():
            continue
        for folder in sorted(root.iterdir()):
            if folder.is_dir() and ID.match(folder.name) and folder.name not in seen:
                seen.add(folder.name)
                out.append((folder.name, where, folder))
    return out


def find(template_id: object, demo_dir: Path | None = None, cwd: Path | None = None) -> Template:
    """The template named `template_id`: workspace first, then built-in."""
    template_id = check_id(template_id)
    for where, root in search_path(demo_dir, cwd):
        if root.is_symlink():
            raise TemplateError(f"{root} is a symlink; refusing to read templates through it")
        folder = root / template_id
        if folder.is_symlink() or folder.is_dir():
            return read_folder(folder, template_id, where)
    ids = ", ".join(i for i, _, _ in available(demo_dir, cwd)) or "none"
    searched = "\n  ".join(str(root / template_id) for _, root in search_path(demo_dir, cwd))
    raise TemplateError(f"template {template_id!r} not found. Searched:\n  {searched}\n"
                        f"Available ids: {ids}\nList them with: {LIST_COMMAND}")
