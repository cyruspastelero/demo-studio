"""Finding and loading look templates (docs/templates.md).

A template is a folder `<id>/` holding template.json, README.md, source.json and preview/01..06.png.
Search order, first match wins:
  1. workspace templates: `<demos root>/_templates/<id>/`. The demos root is $DEMO_ROOT when it is
     set; else, for a build, the workspace that holds the demo (the demo's parent folder, and only
     when it is a demos workspace: it has the starter kit's check.py and AGENTS.md); else, with no
     demo, the same folder the studio lists (./demos, or the current folder when it is a workspace).
  2. built-ins: `<repo>/look-templates/<id>/`
A `_templates` folder next to a demo that sits anywhere else (Downloads, an unzipped share) is never
searched. app/server/demos.mjs demoRoot() follows the same rule. A symlinked template folder (or a
symlinked template.json) is refused: a template shared by someone else must not be able to point the
engine at files outside its folder."""
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


WORKSPACE_MARKERS = ("check.py", "AGENTS.md")  # what scripts/new-workspace.sh puts in a demos workspace


def is_workspace(folder: Path) -> bool:
    return all((Path(folder) / name).is_file() for name in WORKSPACE_MARKERS)



def demo_root(demo_dir: Path | None = None, cwd: Path | None = None, env=None) -> Path | None:
    """The one demos root whose `_templates` is searched (None: built-ins only). Same rule as
    app/server/demos.mjs templatesRoot() when there is no demo."""
    env = os.environ if env is None else env
    here = Path(cwd or Path.cwd()).absolute()
    if env.get("DEMO_ROOT"):
        return (here / env["DEMO_ROOT"]).resolve()
    if demo_dir is not None:
        parent = Path(demo_dir).absolute().parent
        return parent if is_workspace(parent) else None
    # Only a real workspace (check.py + AGENTS.md) supplies templates, never a folder that merely
    # holds demo folders: same rule as app/server/demos.mjs templatesRoot().
    for candidate in (here / "demos", here):
        if is_workspace(candidate):
            return candidate
    return None


def workspace_roots(demo_dir: Path | None = None, cwd: Path | None = None) -> list[Path]:
    """The `_templates` folder to search before the built-ins (none, or exactly one)."""
    root = demo_root(demo_dir, cwd)
    return [] if root is None else [root / "_templates"]


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
