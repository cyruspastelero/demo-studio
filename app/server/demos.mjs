import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { demoOverview, indexStatuses, isPlaceholderTitle, workspaceInfo } from './overview.mjs';

// The editor can open a folder only when it has a config to edit.
export function isDemoFolder(dir) {
  return existsSync(join(dir, 'handoff.json')) || existsSync(join(dir, 'demo.json'));
}

// The home screen also lists demos made before the configs existed, or by hand.
function looksLikeDemo(dir, inIndex) {
  if (isDemoFolder(dir)) return true;
  if (!existsSync(join(dir, 'README.md'))) return false;
  return inIndex || existsSync(join(dir, 'recordings')) || existsSync(join(dir, 'SHOT-LIST.md'));
}

function titleOf(dir) {
  for (const name of ['handoff.json', 'demo.json']) {
    try {
      const title = JSON.parse(readFileSync(join(dir, name), 'utf8')).title;
      if (!isPlaceholderTitle(title)) return title;
    } catch { /* missing or broken; the folder name stands in */ }
  }
  return null;
}

function scan(root, group) {
  if (!existsSync(root)) return [];
  const statuses = indexStatuses(root);
  return readdirSync(root)
    .filter((name) => !name.startsWith('.'))
    .map((name) => join(root, name))
    .filter((dir) => statSync(dir).isDirectory() && looksLikeDemo(dir, dir.split('/').pop() in statuses))
    .map((dir) => {
      const name = dir.split('/').pop();
      return {
        path: dir,
        name,
        title: titleOf(dir),
        group,
        hasHandoff: existsSync(join(dir, 'handoff.json')),
        hasDemo: existsSync(join(dir, 'demo.json')),
        canEdit: isDemoFolder(dir),
        modified: statSync(dir).mtimeMs,
        status: statuses[name] ?? null,
        overview: demoOverview(dir, statuses[name]?.status ?? null),
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

// What scripts/new-workspace.sh puts in a demos workspace (scripts/keynote/templates.py checks the same).
export const WORKSPACE_MARKERS = ['check.py', 'AGENTS.md'];

export function isWorkspace(dir) {
  return WORKSPACE_MARKERS.every((name) => {
    try {
      return statSync(join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

// Where demos live: $DEMO_ROOT if set, else ./demos, else the current folder when the command was
// run from inside a demos workspace (it has the starter kit's check.py or demo folders of its own).
// Look templates are searched only in <this>/_templates and the built-ins; build-keynote.py uses the
// same root (scripts/keynote/templates.py demo_root), or the workspace that holds the demo it builds.
export function demoRoot(cwd, env = process.env) {
  if (env.DEMO_ROOT) return resolve(cwd, env.DEMO_ROOT);
  const nested = resolve(cwd, 'demos');
  if (existsSync(nested)) return nested;
  const here = resolve(cwd);
  const hasDemos = existsSync(here) && readdirSync(here).some((name) => !name.startsWith('.')
    && statSync(join(here, name)).isDirectory() && isDemoFolder(join(here, name)));
  return isWorkspace(here) || hasDemos ? here : nested;
}

// Demos under $DEMO_ROOT (default ./demos where the command ran) and the repo's examples.
export function listDemos({ cwd, repo }) {
  return [...scan(demoRoot(cwd), 'Your demos'), ...scan(join(repo, 'examples'), 'Examples')];
}

export function workspace({ cwd }) {
  return workspaceInfo(demoRoot(cwd));
}
