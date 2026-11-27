import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCommand, checkTargets, normalizeRows, oneLine } from './checks.mjs';

export const KILL_GRACE_MS = 2000;
// check-cut.py decodes about 60 frames and the audio; video-gate.py takes a few seconds. Past this a checker is stuck.
export const CHECK_TIMEOUT_MS = 180000;
const LOG_LIMIT = 2000;
const VIDEO_KEY = /^[A-Z][A-Z0-9-]*$/;

const hasSay = () => process.platform === 'darwin' && spawnSync('which', ['say']).status === 0;

// The only commands the server runs. Each returns [command, args]; never a shell string.
export function renderCommand(kind, { repo, folder, video }) {
  const script = (name) => join(repo, 'scripts', name);
  const has = (name) => existsSync(join(folder, name));
  const need = (name) => {
    if (!has(name)) throw new Error(`this demo has no ${name}`);
  };
  switch (kind) {
    case 'handoff':
      need('handoff.json');
      return ['python3', ['-I', script('build-handoff.py'), 'handoff.json', ...(hasSay() ? [] : ['--no-say'])]];
    case 'keynote':
      need('demo.json');
      return ['python3', ['-I', script('build-keynote.py'), 'demo.json']];
    case 'reel':
      if (!has(join('recordings', 'takes.csv'))) throw new Error('this demo has no recordings/takes.csv');
      return ['python3', ['-I', script('review-reel.py'), 'recordings', ...(has('demo.json') ? ['--config', 'demo.json'] : [])]];
    case 'social':
      need('handoff.json');
      return ['python3', ['-I', script('social-cut.py'), 'handoff.json']];
    case 'cards':
      need('handoff.json');
      return [process.execPath, [script('title-cards.mjs'), 'handoff.json']];
    case 'quick':
      if (video === 'KEYNOTE') {
        need('demo.json');
        return ['python3', ['-I', script('quick-preview.py'), 'demo.json']];
      }
      need('handoff.json');
      if (!VIDEO_KEY.test(video ?? '')) throw new Error('quick preview needs a video key');
      return ['python3', ['-I', script('quick-preview.py'), 'handoff.json', video]];
    default:
      throw new Error(`unknown render ${kind}`);
  }
}

export const RENDER_LABELS = {
  handoff: 'Editor handoff', keynote: 'Keynote cut', reel: 'Review reel', social: 'Social versions',
  cards: 'Title cards', quick: 'Quick preview',
};

// One render at a time. Lines are parsed for PROGRESS and OUTPUT and pushed to listeners.
export class RenderRunner {
  constructor(emit, { checkTimeoutMs = CHECK_TIMEOUT_MS } = {}) {
    this.emit = emit;
    this.job = null;
    this.checkTimeoutMs = checkTimeoutMs;
  }

  state() {
    if (!this.job) return null;
    const { child: _child, exited: _exited, hasExited: _hasExited, ...rest } = this.job;
    return rest;
  }

  // Resolves once the current render's process has exited (at once when there is none).
  exited() {
    return this.job?.exited ?? Promise.resolve();
  }

  // Every script and checker starts here: argument list, demo folder as cwd, own process group.
  launch(cmd, args, ctx) {
    // Templates are looked up in the same demos root the home screen lists them from.
    const env = ctx.demoRoot ? { ...process.env, DEMO_ROOT: ctx.demoRoot } : process.env;
    return spawn(cmd, args, { cwd: ctx.folder, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
  }

  start(kind, ctx) {
    if (this.job?.status === 'running') throw Object.assign(new Error('a render is already running'), { status: 409 });
    // A cancelled render's ffmpeg may still hold the output file until its group is gone.
    if (this.job && !this.job.hasExited) {
      throw Object.assign(new Error('the previous render is still stopping'), { status: 409 });
    }
    const [cmd, args] = renderCommand(kind, ctx);
    const child = this.launch(cmd, args, ctx);
    this.job = {
      id: Date.now(), kind, label: RENDER_LABELS[kind] + (ctx.video ? ` (${ctx.video})` : ''), status: 'running',
      progress: null, outputs: [], checking: false, checks: {}, log: [], startedAt: Date.now(), child, hasExited: false,
    };
    const job = this.job;
    let markExited;
    job.exited = new Promise((resolvePromise) => { markExited = resolvePromise; });
    const onExit = () => {
      job.hasExited = true;
      markExited();
    };
    this.emit('render', this.state());
    const onData = (stream) => {
      let buffer = '';
      return (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        lines.forEach((line) => this.line(job, line, stream));
      };
    };
    child.stdout.setEncoding('utf8').on('data', onData('out'));
    child.stderr.setEncoding('utf8').on('data', onData('err'));
    child.on('error', (error) => {
      onExit();
      this.finish(job, 'failed', `could not start ${cmd}: ${error.message}`);
    });
    child.on('close', (code, signal) => {
      job.child = null;
      if (job.status !== 'running' || code !== 0) {
        onExit();
        if (job.status === 'running') this.finish(job, 'failed', `exited with ${signal ?? `code ${code}`}`);
        return;
      }
      // The job stays 'running' while the checks run, so no second render can start.
      this.runChecks(job, ctx)
        .catch((error) => this.line(job, `could not check: ${oneLine(error.message)}`, 'err'))
        .then(() => { if (job.status === 'running') this.finish(job, 'done', null); })
        .finally(onExit);
    });
    return this.state();
  }

  line(job, line, stream) {
    if (!line.trim()) return;
    job.log = [...job.log, { stream, line }].slice(-LOG_LIMIT);
    const progress = /^PROGRESS (\S+) (\d+)\/(\d+)/.exec(line);
    const output = /^OUTPUT (.+)$/.exec(line);
    if (progress) job.progress = { stage: progress[1], done: Number(progress[2]), total: Number(progress[3]) };
    if (output) job.outputs = [...job.outputs, output[1].trim()];
    this.emit('render-line', { id: job.id, stream, line, progress: job.progress, outputs: job.outputs, checks: job.checks });
  }

  finish(job, status, error) {
    job.status = status;
    job.error = error;
    job.endedAt = Date.now();
    this.emit('render', this.state());
  }

  // Runs each finished video through the checkers, one process at a time. A checker that fails is
  // recorded as a note on its output; it never fails the render.
  async runChecks(job, ctx) {
    const targets = checkTargets(job.kind, job.outputs, ctx.folder);
    if (!targets.length) return;
    job.checking = true;
    job.checks = {};
    this.emit('render', this.state());
    for (const { path, tools } of targets) {
      const entry = { checks: [], note: null };
      job.checks = { ...job.checks, [path]: entry };
      for (const tool of tools) {
        if (job.status !== 'running') break;
        try {
          const rows = await this.runCheck(job, tool, path, ctx);
          if (rows) entry.checks = [...entry.checks, { tool, rows }];
        } catch (error) {
          entry.note = `could not check: ${oneLine(error.message)}`;
          this.line(job, `${tool}: ${entry.note}`, 'err');
        }
      }
    }
    job.checking = false;
    if (job.status === 'running') this.emit('render', this.state());
  }

  // Resolves with the validated rows, or null when the job was cancelled meanwhile.
  async runCheck(job, tool, video, ctx) {
    const dir = mkdtempSync(join(tmpdir(), 'studio-check-'));
    const json = join(dir, 'rows.json');
    let timer;
    try {
      const [cmd, args] = checkCommand(tool, { repo: ctx.repo, video, json });
      const child = this.launch(cmd, args, ctx);
      job.child = child;
      let errText = '';
      // A checker that hangs would keep the job running and block the next render.
      let timedOut = false;
      timer = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
      }, this.checkTimeoutMs);
      timer.unref();
      child.stdout.resume();
      child.stderr.setEncoding('utf8').on('data', (chunk) => { errText = (errText + chunk).slice(-2000); });
      const code = await new Promise((resolvePromise, reject) => {
        child.on('error', (error) => reject(new Error(`could not start ${cmd}: ${error.message}`)));
        child.on('close', (exitCode, signal) => resolvePromise(exitCode ?? signal));
      }).finally(() => { job.child = null; });
      if (job.status !== 'running') return null;
      if (timedOut) throw new Error(`${tool} took longer than ${Math.round(this.checkTimeoutMs / 1000)} s and was stopped`);
      // Exit 1 means a row failed; the rows are still written.
      if (code !== 0 && code !== 1) {
        const last = errText.trim().split('\n').pop() ?? '';
        throw new Error(`${tool} exited with ${code}${last ? `: ${last}` : ''}`);
      }
      // A checker that stops early (no plan file, unreadable video) exits 1 too, with its reason on stderr.
      if (!existsSync(json)) throw new Error(errText.trim().split('\n').pop() || `${tool} wrote no results`);
      return normalizeRows(JSON.parse(readFileSync(json, 'utf8')));
    } finally {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  cancel() {
    const job = this.job;
    if (!job || job.status !== 'running') return false;
    job.status = 'cancelled';
    // The process was started in its own process group, so this reaches ffmpeg and Chrome too.
    // During the checks that process is the running checker; between checkers there is none.
    const child = job.child;
    const signal = (sig) => {
      try { if (child) process.kill(-child.pid, sig); } catch { /* group already gone */ }
    };
    signal('SIGTERM');
    setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS).unref();
    job.checking = false;
    job.endedAt = Date.now();
    this.emit('render', this.state());
    return true;
  }
}
