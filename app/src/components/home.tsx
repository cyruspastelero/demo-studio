import { AlertCircle, Check, Copy, FileText, Film, FolderOpen, Moon, PencilRuler, Play, RefreshCw, Search, Sun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, demoThumbUrl, type DemoEntry, type HomeSession } from '../api';

const COPIED_MS = 1600;
const FILTER_FROM = 7;  // a filter box only earns its space once the list is long

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    }).catch(() => window.prompt('Copy this:', text));
  };
  return (
    <button className="icon-btn" onClick={copy} aria-label={copied ? 'Copied' : label} title={copied ? 'Copied' : label}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Command({ text }: { text: string }) {
  return (
    <div className="home-command">
      <code>{text}</code>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

function statusOf(demo: DemoEntry): string {
  if (demo.status) return demo.status.status;
  const { stages, next } = demo.overview;
  if (!next) return 'Finished';
  return stages.some((s) => s.done) ? `Next: ${next.label.toLowerCase()}` : 'Not started';
}

function summaryLine(demo: DemoEntry): string {
  const { scenes, takes, videos } = demo.overview;
  const parts = [];
  if (scenes) parts.push(`${scenes} scene${scenes === 1 ? '' : 's'}`);
  if (takes.total) parts.push(`${takes.keep} of ${takes.total} takes kept`);
  if (videos.length) parts.push(`${videos.length} video${videos.length === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'No takes logged yet';
}

function Menu({ label, icon, children }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={wrap}>
      <button className="btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>{icon}{label}</button>
      {open && <div className="menu home-menu" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function DemoCard({ demo, onOpen, onError }: { demo: DemoEntry; onOpen: (path: string) => void; onError: (message: string) => void }) {
  const { overview } = demo;
  const [posterFailed, setPosterFailed] = useState(false);
  const lead = overview.videos[0];
  const reveal = (path: string | null, action: 'reveal' | 'open') => {
    api.revealInDemo(demo.path, path, action).catch((e: Error) => onError(`Could not open ${path ?? demo.name}: ${e.message}`));
  };
  const nextIndex = overview.stages.findIndex((s) => !s.done);
  return (
    <article className="demo-card" data-testid="demo-card" data-demo={demo.name}>
      <button className="demo-poster" disabled={!lead} onClick={() => lead && reveal(lead.rel, 'open')}
        aria-label={lead ? `Play the ${lead.label.toLowerCase()} of ${demo.title ?? demo.name}` : 'No video yet'}>
        {overview.poster && !posterFailed
          ? <img src={demoThumbUrl(demo.path, overview.poster)} alt="" loading="lazy" onError={() => setPosterFailed(true)} />
          : <span className="demo-poster-empty"><Film size={22} /><span>{lead ? lead.label : 'No video yet'}</span></span>}
        {lead && <span className="demo-poster-play"><Play size={14} fill="currentColor" />{lead.label}</span>}
      </button>

      <div className="demo-body">
        <header className="demo-head">
          <h3>{demo.title ?? demo.name}</h3>
          <span className="demo-status" title={demo.status?.note || undefined}>{statusOf(demo)}</span>
        </header>
        <p className="demo-meta">{demo.title && demo.title !== demo.name ? `${demo.name} · ` : ''}{summaryLine(demo)}</p>

        <ol className="stage-track" aria-label="Stages">
          {overview.stages.map((stage, index) => (
            <li key={stage.key} className={stage.done ? 'done' : index === nextIndex ? 'next' : ''}
              aria-current={index === nextIndex ? 'step' : undefined}>
              <span className="stage-bar" />
              <span className="stage-label">{stage.label}<span className="sr-only">{stage.done ? ' (done)' : index === nextIndex ? ' (next)' : ''}</span></span>
            </li>
          ))}
        </ol>

        {overview.attention.length > 0 && (
          <ul className="demo-attention">
            {overview.attention.map((line) => <li key={line}><AlertCircle size={13} />{line}</li>)}
          </ul>
        )}

        {overview.next && (
          <div className="demo-next">
            <span className="demo-next-label">Ask Claude</span>
            <span className="demo-next-prompt">{overview.next.prompt}</span>
            <CopyButton text={overview.next.prompt} label="Copy the prompt" />
          </div>
        )}

        <footer className="demo-actions">
          <button className="btn primary" disabled={!demo.canEdit} onClick={() => onOpen(demo.path)} data-testid="demo-item"
            title={demo.canEdit ? undefined : 'This demo has no handoff.json or demo.json to edit yet'}>
            <PencilRuler size={14} />Open editor
          </button>
          {overview.videos.length > 1 && (
            <Menu label="Videos" icon={<Play size={14} />}>
              {(close) => overview.videos.map((video) => (
                <button key={video.rel} role="menuitem" onClick={() => { close(); reveal(video.rel, 'open'); }}>
                  <Play size={14} /><span>{video.label}</span><small>{video.rel}</small>
                </button>
              ))}
            </Menu>
          )}
          {overview.docs.length > 0 && (
            <Menu label="Docs" icon={<FileText size={14} />}>
              {(close) => overview.docs.map((doc) => (
                <button key={doc.rel} role="menuitem" onClick={() => { close(); reveal(doc.rel, 'open'); }}>
                  <FileText size={14} /><span>{doc.name}</span>
                </button>
              ))}
            </Menu>
          )}
          <button className="btn" onClick={() => reveal(null, 'reveal')}><FolderOpen size={14} />Show folder</button>
        </footer>
      </div>
    </article>
  );
}

function GettingStarted({ session }: { session: HomeSession }) {
  const { workspace, repo } = session;
  return (
    <section className="home-start" data-testid="getting-started">
      <h2>Make your first demo</h2>
      <ol>
        <li>
          <strong>Check your setup.</strong> It lists anything missing with the command that fixes it.
          <Command text={`bash "${repo}/scripts/doctor.sh"`} />
        </li>
        {!workspace.hasPlaybook && (
          <li>
            <strong>Set up a demos folder.</strong> Adds the playbook, an index and a drift check. Nothing is overwritten.
            <Command text={`bash "${repo}/scripts/new-workspace.sh" "${workspace.root}"`} />
          </li>
        )}
        <li>
          <strong>Log in to a sandbox account</strong> in the browser that Playwright MCP opens, not your everyday browser.
        </li>
        <li>
          <strong>Ask Claude for the demo.</strong> Start Claude Code in the demos folder and say what the demo should show.
          <Command text="Make a demo of <product>. Goal: <what the viewer should be able to do>. Audience: <who watches>." />
        </li>
      </ol>
      <p className="muted">New demos appear here as soon as Claude scaffolds them. The example below is a filled-in plan you can open.</p>
    </section>
  );
}

export function Home({ session, theme, onTheme, onOpen, onRefresh }: {
  session: HomeSession; theme: 'dark' | 'light'; onTheme: () => void; onOpen: (path: string) => void; onRefresh: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { demos, workspace } = session;
  const mine = useMemo(() => demos.filter((d) => d.group !== 'Examples'), [demos]);
  const examples = useMemo(() => demos.filter((d) => d.group === 'Examples'), [demos]);
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? mine.filter((d) => `${d.name} ${d.title ?? ''} ${statusOf(d)}`.toLowerCase().includes(needle))
    : mine;
  const needAttention = mine.filter((d) => d.overview.attention.length > 0).length;
  const finished = mine.filter((d) => !d.overview.next || d.status?.status === 'Delivered').length;

  return (
    <main className="home">
      <header className="home-bar">
        <span className="home-brand"><Film size={16} />demo-studio</span>
        <span className="home-root mono" title="Where demos are looked up ($DEMO_ROOT, default ./demos)">{workspace.root}</span>
        <span className="home-bar-space" />
        {mine.length >= FILTER_FROM && (
          <label className="home-filter">
            <Search size={14} />
            <span className="sr-only">Filter demos</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter demos" />
          </label>
        )}
        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh" title="Refresh"><RefreshCw size={15} /></button>
        <button className="icon-btn" onClick={onTheme} aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <div className="home-inner">
        {error && <p className="note bad" role="alert">{error}</p>}

        {mine.length === 0 ? <GettingStarted session={session} /> : (
          <section>
            <div className="home-heading">
              <h1>Your demos</h1>
              <p className="muted">
                {mine.length} demo{mine.length === 1 ? '' : 's'} · {finished} finished
                {needAttention > 0 && ` · ${needAttention} need${needAttention === 1 ? 's' : ''} attention`}
              </p>
            </div>
            {!workspace.hasPlaybook && (
              <p className="note">
                This folder has no playbook yet. Add one, with an index and a drift check, by running:
                <Command text={`bash "${session.repo}/scripts/new-workspace.sh" "${workspace.root}"`} />
              </p>
            )}
            <div className="demo-grid">
              {shown.map((demo) => <DemoCard key={demo.path} demo={demo} onOpen={onOpen} onError={setError} />)}
            </div>
            {shown.length === 0 && <p className="muted">No demo matches "{filter}".</p>}
          </section>
        )}

        {examples.length > 0 && (
          <section>
            <div className="home-heading"><h2>Examples</h2></div>
            <div className="demo-grid">
              {examples.map((demo) => <DemoCard key={demo.path} demo={demo} onOpen={onOpen} onError={setError} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
