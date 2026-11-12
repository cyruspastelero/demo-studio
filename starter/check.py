"""Report drift across a demos workspace. Run from the workspace: `python3 -I check.py`.

Checks every demo folder against the playbook in AGENTS.md: the index row, its status and
final-cut paths, the README Status section, takes left unreviewed, open throwaways, leftover
frames, secrets files outside app/, handoff folders kept next to their zip, and free disk.
Exits 1 when anything needs attention. Standard library only.
DEMO_MIN_FREE_GB sets the free disk needed to record (default 10).
"""

import csv
import glob
import os
import re
import shutil
import sys
from pathlib import Path

DEFAULT_MIN_FREE_GB = 10
STATUSES = ("Planning", "Prepping", "Recording", "Review", "With editor", "Delivered", "Archived")
REVIEWED_TAKE_STATUSES = {"keep", "alt", "reject"}
CLOSED_THROWAWAY_PREFIXES = ("deleted", "kept", "keep")
THROWAWAY_HEADER_CELLS = {"what", "created"}
INDEX_ROW = re.compile(r"^\|\s*\[([^\]]+)\]\(")
SKIPPED_DIRS = {"node_modules", ".git", ".next", ".venv"}


def read_index(root: Path) -> dict[str, dict]:
    """Map demo name -> {"status": str, "final": [paths]} from the README index table."""
    index_file = root / "README.md"
    if not index_file.exists():
        return {}
    rows = {}
    for line in index_file.read_text().splitlines():
        match = INDEX_ROW.match(line)
        if not match:
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows[match.group(1)] = {
            "status": cells[-2] if len(cells) >= 3 else "",
            "final": re.findall(r"`([^`]+)`", cells[-1]),
        }
    return rows


def dir_size_gb(path: Path) -> float:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / 1e9


def unreviewed_takes(demo: Path) -> int:
    takes = demo / "recordings" / "takes.csv"
    if not takes.exists():
        return 0
    with takes.open(newline="") as handle:
        return sum(
            1 for row in csv.DictReader(handle)
            if (row.get("status") or "").strip().lower() not in REVIEWED_TAKE_STATUSES
        )


def open_throwaways(demo: Path) -> int:
    path = demo / "THROWAWAYS.md"
    if not path.exists():
        return 0
    count = 0
    for line in path.read_text().splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        is_table_row = line.startswith("|") and len(cells) > 1
        is_divider = set(cells[0]) <= set("-: ")
        is_header = cells[0].lower() in THROWAWAY_HEADER_CELLS
        if is_table_row and not is_divider and not is_header:
            if not cells[-1].lower().startswith(CLOSED_THROWAWAY_PREFIXES):
                count += 1
    return count


def stray_env_files(demo: Path) -> list[str]:
    """Secrets files anywhere but the demo's app/ folder (.env.example is fine)."""
    stray = []
    for path in demo.rglob(".env*"):
        relative = path.relative_to(demo)
        if not path.is_file() or path.name.endswith(".example"):
            continue
        if relative.parts[0] == "app" or SKIPPED_DIRS & set(relative.parts):
            continue
        stray.append(str(relative))
    return sorted(stray)


def duplicated_handoffs(demo: Path) -> list[Path]:
    """Handoff folders that still sit next to the zip built from them."""
    found = []
    for folder in list(demo.glob("editor-handoff")) + list(demo.glob("recordings/editor-handoff")):
        if folder.is_dir() and list(folder.parent.glob("*editor-handoff.zip")):
            found.append(folder)
    return found


def check_demo(root: Path, demo: Path, index: dict[str, dict]) -> list[str]:
    issues = []
    row = index.get(demo.name)
    if row is None:
        issues.append("missing from the README index")
    else:
        if not row["status"].startswith(STATUSES):
            issues.append(f"index status is not one of: {', '.join(STATUSES)}")
        for pattern in row["final"]:
            if not glob.glob(str(root / pattern)):
                issues.append(f"index final cut does not exist: {pattern}")
    readme = demo / "README.md"
    if "## Status" not in readme.read_text():
        issues.append("README has no '## Status' section")
    frames = demo / "recordings" / "frames"
    if frames.is_dir() and any(frames.iterdir()):
        issues.append(f"recordings/frames still present ({dir_size_gb(frames):.1f} GB)")
    if count := unreviewed_takes(demo):
        issues.append(f"{count} take(s) in takes.csv not marked keep/alt/reject")
    if count := open_throwaways(demo):
        issues.append(f"{count} open throwaway(s) (not 'deleted <date>' or 'kept: <reason>')")
    for path in stray_env_files(demo):
        issues.append(f"secrets file outside app/: {path}")
    for folder in duplicated_handoffs(demo):
        issues.append(
            f"editor-handoff folder and its zip both kept ({dir_size_gb(folder):.1f} GB could be freed "
            "once the zip is sent)"
        )
    return issues


def check_workspace(root: Path) -> dict[str, list[str]]:
    """Map every demo (folder or index row) to the list of things that need attention."""
    index = read_index(root)
    demos = sorted(
        path for path in root.iterdir()
        if path.is_dir() and not path.name.startswith(".") and (path / "README.md").exists()
    )
    report = {demo.name: check_demo(root, demo, index) for demo in demos}
    for name in sorted(set(index) - set(report)):
        report[name] = ["index row has no folder"]
    return report


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).resolve().parent
    if not root.is_dir():
        print(f"check: workspace folder not found: {root}", file=sys.stderr)
        return 2
    report = check_workspace(root)
    for name in sorted(report):
        print(f"{'!!' if report[name] else 'ok'} {name}")
        for issue in report[name]:
            print(f"     - {issue}")
    try:
        min_free_gb = float(os.environ.get("DEMO_MIN_FREE_GB", DEFAULT_MIN_FREE_GB))
    except ValueError:
        print("check: DEMO_MIN_FREE_GB must be a number", file=sys.stderr)
        return 2
    free_gb = shutil.disk_usage(root).free / 1e9
    low_disk = free_gb < min_free_gb
    print(f"{'!!' if low_disk else 'ok'} disk: {free_gb:.0f} GB free (need {min_free_gb:g} GB to record)")
    return 1 if low_disk or any(report.values()) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
