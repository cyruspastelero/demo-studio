import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const KILL_GRACE_MS = 2000;
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
  constructor(emit) {
    this.emit = emit;
    this.job = null;
  }

  state() {
    if (!this.job) return null;
    const { child: _child, ...rest } = this.job;
    return rest;
  }

  start(kind, ctx) {
    if (this.job?.status === 'running') throw Object.assign(new Error('a render is already running'), { status: 409 });
    const [cmd, args] = renderCommand(kind, ctx);
    // Templates are looked up in the same demos root the home screen lists them from.
    const env = ctx.demoRoot ? { ...process.env, DEMO_ROOT: ctx.demoRoot } : process.env;
    const child = spawn(cmd, args, { cwd: ctx.folder, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    this.job = {
      id: Date.now(), kind, label: RENDER_LABELS[kind] + (ctx.video ? ` (${ctx.video})` : ''), status: 'running',
      progress: null, outputs: [], log: [], startedAt: Date.now(), child,
    };
    const job = this.job;
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
    child.on('error', (error) => this.finish(job, 'failed', `could not start ${cmd}: ${error.message}`));
    child.on('close', (code, signal) => {
      if (job.status !== 'running') return;
      this.finish(job, code === 0 ? 'done' : 'failed', code === 0 ? null : `exited with ${signal ?? `code ${code}`}`);
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
    this.emit('render-line', { id: job.id, stream, line, progress: job.progress, outputs: job.outputs });
  }

  finish(job, status, error) {
    job.status = status;
    job.error = error;
    job.endedAt = Date.now();
    this.emit('render', this.state());
  }

  cancel() {
    const job = this.job;
    if (!job || job.status !== 'running') return false;
    job.status = 'cancelled';
    // The script was started in its own process group, so this reaches ffmpeg and Chrome too.
    const signal = (sig) => {
      try { process.kill(-job.child.pid, sig); } catch { /* group already gone */ }
    };
    signal('SIGTERM');
    setTimeout(() => signal('SIGKILL'), KILL_GRACE_MS).unref();
    job.endedAt = Date.now();
    this.emit('render', this.state());
    return true;
  }
}
