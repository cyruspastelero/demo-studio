---
name: demo-organize
description: Keep every demo in the demos folder organised the same way. Runs the drift report, moves misplaced videos, handoffs and zips into the standard layout (final/ and recordings/), fixes the index and README paths, logs every move, and asks once before anything is deleted. Use at the start or end of a session, when the home screen shows things that need attention, when the user says "organise my demos" or "clean up", or after demos were made with another tool.
---

# Demo organize

Every demo folder has the same shape, so the home screen, the editor and every skill can find
things. This skill puts files where they belong. It moves and links; it never deletes without the
user's go-ahead in this session.

Start every shell command with this line (it finds the plugin, in a clone or an installed plugin):

```bash
P="${CLAUDE_PLUGIN_ROOT:-$(d=$PWD; while [ "$d" != / ] && [ ! -f "$d/.claude-plugin/plugin.json" ]; do d=$(dirname "$d"); done; [ -f "$d/.claude-plugin/plugin.json" ] && echo "$d" || ls -d ~/.claude/plugins/cache/*/demo-studio/*/ | tail -1)}"
```

`<root>` below is the demos folder: `$DEMO_ROOT`, else `./demos` (in a clone of this repo that is
`<repo>/demos`, which git ignores).

## The layout (the target)

```
<root>/
  README.md        the index: one row per demo, status, final cut path
  AGENTS.md        the playbook   CLAUDE.md   check.py   .gitignore
  <name>/
    README.md  BRIEF.md  RUN-SHEET.md  SHOT-LIST.md  VOICEOVER.md  PREP.md  THROWAWAYS.md
    demo.json  handoff.json
    app/  tools/  assets/  voiceover/
    recordings/
      raw/  scenes/  exports/  takes.csv
      editor-handoff/  <name>-editor-handoff.zip
    final/         every delivered video (moved here, or linked when it lives elsewhere)
```

## Step 1: make sure the workspace exists

```bash
[ -f <root>/check.py ] || bash "$P/scripts/new-workspace.sh" <root>
```

Expected: nothing, or a list of files it added. It never overwrites a file.

## Step 2: run the drift report

```bash
cmp -s "$P/starter/check.py" <root>/check.py || /bin/cp -f "$P/starter/check.py" <root>/check.py
python3 -I <root>/check.py
```

Each demo prints `ok <name>` or `!! <name>` with its issues. Sort every issue into the tables in
Steps 3 and 4.

## Step 3: fix the layout yourself (no questions)

Keep a log as you go: one line per change in `<root>/REORG-<YYYY-MM-DD>.md`.

| Issue | Do this |
| --- | --- |
| `video at the demo root, move it into final/: X` | `mkdir -p <name>/final && mv -n <name>/X <name>/final/X` |
| `editor-handoff/ at the demo root` | `mkdir -p <name>/recordings && mv -n <name>/editor-handoff <name>/recordings/` |
| `handoff zip at the demo root` | `mv -n <name>/X <name>/recordings/<name>-editor-handoff.zip` |
| `status says delivered but final/ has no video` | Find the delivered cut (`recordings/exports/*-cut*.mp4`, `recordings/editor-handoff/01-final-cut/*`, the index's final path). Link it: `ln -s ../recordings/exports/X.mp4 <name>/final/X.mp4`. Link, never copy (disk). |
| `index final cut does not exist: X` | Point the row at the file's new path, or `none yet` |
| `missing from the README index` | Add a row: name, one line on what it shows, status, final cut path |
| `index row has no folder` | Change the row's first cell to `<name> (folder no longer on disk)` and its status to `Archived` |
| `index status is not one of: ...` | Rewrite it as one of the listed words, then a dated note |
| `README has no '## Status' section` | Add `## Status` with one dated line from what the folder shows |
| `broken link: X` | Look where it pointed (`readlink`). If the target moved, relink it. If it is gone, remove the link (it holds no data) and log it |

After moving, update every path that pointed at the old place:

```bash
grep -rn "<old path>" <root>/README.md <root>/<name>/*.md
```

Use `mv -n` (never overwrite). If a target already exists, stop for that file and report it.

## Step 4: ask once about anything that deletes or closes

Collect these into ONE question with a checkbox per item (the user picks any). Never do them
without a yes in this session.

| Issue | The choice to offer | If yes |
| --- | --- | --- |
| `recordings/frames still present (N GB)` | Delete leftover frames | `/bin/rm -rf <name>/recordings/frames` (takes are already encoded) |
| `editor-handoff folder and its zip both kept` | Delete handoff folders that are in their zip | First prove the zip has every file (below), then `/bin/rm -rf` the folder |
| `N take(s) ... not marked` | Mark the takes | `keep` if a cut uses it (its stem is in `demo.json` or `handoff.json`), else `alt`; add a dated note |
| `N open throwaway(s)` | Close the throwaways | Only if the user says they will not clean the sandbox: set the last cell to `kept: sandbox demo data, closed <date> (was: <old text>)`. Never write `deleted` unless it was really deleted |
| `secrets file outside app/: X` | Move it into `app/` | `mv -n X <name>/app/.env.local`, then check `git check-ignore` covers it. Never print its contents |

Proving a zip holds a folder (run from `<name>/recordings`):

```bash
z=<name>-editor-handoff.zip; find editor-handoff -type f ! -name .DS_Store | while read f; do unzip -Z1 "$z" | grep -qF "${f#editor-handoff/}" || echo "MISSING $f"; done
```

No `MISSING` lines means it is safe to delete the folder.

## Step 5: check again and report

```bash
python3 -I <root>/check.py
```

Tell the user in a few lines: what moved (point at the REORG log), what they chose to delete and
how much space it freed, and anything still listed with the reason it stays.

## Done when

- [ ] `check.py` prints only `ok` lines, or only issues the user chose to keep.
- [ ] Every delivered demo has its videos in `final/` and the index points at them.
- [ ] Every move is in `<root>/REORG-<date>.md`.
- [ ] Nothing was deleted without a yes in this session.
