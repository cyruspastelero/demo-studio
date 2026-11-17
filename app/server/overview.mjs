// What the home screen shows for each demo: which stages are done, what needs attention, the
// videos and documents it has, and the next thing to ask Claude for. Read-only, files only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseCsv } from './media.mjs';

export const STATUSES = ['Planning', 'Prepping', 'Recording', 'Review', 'With editor', 'Delivered', 'Archived'];
const REVIEWED = ['keep', 'alt', 'reject'];
const CLOSED_THROWAWAY = ['deleted', 'kept', 'keep'];
const VIDEO = /\.(mp4|mov)$/i;
const DOCS = ['README.md', 'BRIEF.md', 'RUN-SHEET.md', 'SHOT-LIST.md', 'VOICEOVER.md', 'PREP.md', 'THROWAWAYS.md'];
const INDEX_ROW = /^\|\s*\[([^\]]+)\]\(/;
const PLACEHOLDER_TITLES = ['Product name', 'Product name, short'];  // what templates/ ships with
// The stage a demo has at least reached when its index row says so, for demos whose files moved.
const STAGE_FOR_STATUS = {
  Prepping: 'plan', Recording: 'prep', Review: 'record', 'With editor': 'handoff', Delivered: 'final', Archived: 'final',
};

export function isPlaceholderTitle(title) {
  return typeof title !== 'string' || !title.trim() || PLACEHOLDER_TITLES.includes(title.trim());
}

// Folder names come from whoever made the demo. One goes into a prompt the user pastes into Claude,
// so only a plain name is used (in backticks); anything else (spaces, quotes, newlines, words that
// read as instructions) gets a generic prompt instead.
export const SAFE_DEMO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function demoSubject(name) {
  return typeof name === 'string' && SAFE_DEMO_NAME.test(name) ? `the \`${name}\` demo` : 'the demo in this folder';
}

const STAGES = [
  { key: 'plan', label: 'Plan', prompt: (it) => `Plan ${it}: brief, run sheet, shot list and voiceover draft.` },
  { key: 'prep', label: 'Prep', prompt: (it) => `Prep ${it}: accounts, seed data, then the smoke run and the test sweep.` },
  { key: 'record', label: 'Record', prompt: (it) => `Record the scenes for ${it}.` },
  { key: 'review', label: 'Review', prompt: (it) => `Mark the takes for ${it} and build the review reel.` },
  { key: 'edit', label: 'Edit', prompt: (it) => `Cut the promo and the how-to for ${it}.` },
  { key: 'handoff', label: 'Handoff', prompt: (it) => `Build the editor handoff for ${it}.` },
  { key: 'final', label: 'Final', prompt: (it) => `Save the finished videos for ${it} to final/ and wrap it up.` },
];

export function stagePrompt(stage, name) {
  const found = STAGES.find((s) => s.key === stage);
  return found ? found.prompt(demoSubject(name)) : null;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;  // a missing file is normal here: every signal is optional
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;  // a broken config shows as "not planned yet"; the editor reports the parse error
  }
}

function filesIn(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.') && pattern.test(name))
    .map((name) => ({ file: join(dir, name), stat: statOrNull(join(dir, name)) }))
    .filter(({ stat }) => stat?.isFile())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .map(({ file }) => file);
}

// A broken link, or a file deleted while the folder is read, must not break the whole home screen.
function statOrNull(file) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}

function takeCounts(demo) {
  const text = readText(join(demo, 'recordings', 'takes.csv'));
  const rows = text ? parseCsv(text) : [];
  const status = (row) => String(row.status ?? '').trim().toLowerCase();
  const count = (value) => rows.filter((row) => status(row) === value).length;
  return {
    total: rows.length, keep: count('keep'), alt: count('alt'), reject: count('reject'),
    unreviewed: rows.filter((row) => !REVIEWED.includes(status(row))).length,
  };
}

// Data rows of every markdown table: the row above a divider is a header, whatever its wording.
function tableRows(text) {
  const rows = [];
  let previous = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) { previous = null; continue; }
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.every((cell) => cell && /^[-: ]+$/.test(cell))) {
      if (previous && rows[rows.length - 1] === previous) rows.pop();
      previous = null;
      continue;
    }
    rows.push(cells);
    previous = cells;
  }
  return rows;
}

function openThrowaways(demo) {
  const text = readText(join(demo, 'THROWAWAYS.md'));
  if (!text) return 0;
  return tableRows(text).filter((cells) => cells.length > 1 && cells.some(Boolean)
    && !CLOSED_THROWAWAY.some((prefix) => cells[cells.length - 1].toLowerCase().startsWith(prefix))).length;
}

function prepTicked(demo) {
  const text = readText(join(demo, 'PREP.md'));
  if (!text) return false;
  return /- \[[xX]\]/.test(text) && !/- \[ \]/.test(text);
}

function hasFiles(dir) {
  return existsSync(dir) && statSync(dir).isDirectory() && readdirSync(dir).length > 0;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function demoOverview(demo, indexStatus = null) {
  const name = demo.split('/').pop();
  const rel = (file) => relative(demo, file);
  const config = readJson(join(demo, 'demo.json'));
  const scenes = Array.isArray(config?.sequence) ? config.sequence.filter((part) => part && part.scene).length : 0;
  const takes = takeCounts(demo);
  const exportsDir = join(demo, 'recordings', 'exports');
  const reels = filesIn(exportsDir, /^review-reel.*\.(mp4|mov)$/i);
  const cuts = filesIn(exportsDir, VIDEO).filter((file) => !reels.includes(file));
  const handoffDirs = [join(demo, 'recordings', 'editor-handoff'), join(demo, 'editor-handoff')];
  // Rough assemblies are numbered 00_ in each video's folder of the handoff.
  const assemblies = handoffDirs.flatMap((dir) => (existsSync(dir) ? readdirSync(dir) : [])
    .flatMap((sub) => (statOrNull(join(dir, sub))?.isDirectory() ? filesIn(join(dir, sub), /^00_.*\.(mp4|mov)$/i) : [])));
  const loose = filesIn(demo, VIDEO);
  const zips = [...filesIn(join(demo, 'recordings'), /editor-handoff\.zip$/), ...filesIn(demo, /editor-handoff\.zip$/)];
  const finals = filesIn(join(demo, 'final'), VIDEO);
  const raw = filesIn(join(demo, 'recordings', 'raw'), VIDEO);

  const done = {
    plan: config ? scenes > 0 && !isPlaceholderTitle(config.title) : existsSync(join(demo, 'SHOT-LIST.md')),
    prep: prepTicked(demo),
    record: raw.length > 0,
    review: takes.total > 0 && takes.unreviewed === 0 && takes.keep > 0,
    edit: cuts.length > 0 || assemblies.length > 0,
    handoff: zips.length > 0,
    final: finals.length > 0,
  };
  // A later stage being done means the earlier ones happened, even if their file signal is gone.
  const fromFiles = STAGES.reduce((last, stage, index) => (done[stage.key] ? index : last), -1);
  const lastDone = Math.max(fromFiles, STAGES.findIndex((stage) => stage.key === STAGE_FOR_STATUS[indexStatus]));
  const stages = STAGES.map((stage, index) => ({ key: stage.key, label: stage.label, done: index <= lastDone }));
  const nextStage = STAGES[lastDone + 1];

  const attention = [];
  if (takes.unreviewed) attention.push(`${plural(takes.unreviewed, 'take')} not marked keep, alt or reject`);
  const open = openThrowaways(demo);
  if (open) attention.push(`${plural(open, 'throwaway')} not cleaned up`);
  // Frames are needed until the takes are cut; after that they are only using disk.
  if (lastDone >= STAGES.findIndex((stage) => stage.key === 'edit') && hasFiles(join(demo, 'recordings', 'frames'))) {
    attention.push('Recorded frames still on disk');
  }

  const video = (label) => (file) => ({ label, rel: rel(file) });
  const videos = [...finals.map(video('Final')), ...cuts.map(video('Cut')), ...assemblies.map(video('Rough assembly')),
    ...reels.map(video('Review reel')), ...loose.map(video('Video'))];
  const firstTake = [...raw].sort()[0];
  return {
    stages,
    next: nextStage ? { stage: nextStage.key, label: nextStage.label, prompt: nextStage.prompt(demoSubject(name)) } : null,
    scenes,
    takes,
    attention,
    videos,
    // The picture on the card: the best video there is, else the first recorded take.
    poster: videos[0]?.rel ?? (firstTake ? rel(firstTake) : null),
    docs: DOCS.filter((doc) => existsSync(join(demo, doc)) && statSync(join(demo, doc)).isFile()).map((doc) => ({ name: doc.replace(/\.md$/, ''), rel: doc })),
    folders: { handoff: handoffDirs.filter((dir) => existsSync(dir)).map(rel)[0] ?? null },
  };
}

// Demo name -> the status word and note from the workspace README index table.
export function indexStatuses(root) {
  const text = readText(join(root, 'README.md'));
  if (!text) return {};
  const rows = {};
  for (const line of text.split('\n')) {
    const match = INDEX_ROW.exec(line);
    if (!match) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    const cell = cells.length >= 3 ? cells[cells.length - 2] : '';
    const status = STATUSES.find((word) => cell.startsWith(word));
    if (status) rows[match[1]] = { status, note: cell.slice(status.length).trim() };
  }
  return rows;
}

export function workspaceInfo(root) {
  const exists = existsSync(root) && statSync(root).isDirectory();
  return {
    root,
    exists,
    hasPlaybook: exists && existsSync(join(root, 'AGENTS.md')),
    hasIndex: exists && existsSync(join(root, 'README.md')),
    hasCheck: exists && existsSync(join(root, 'check.py')),
  };
}
