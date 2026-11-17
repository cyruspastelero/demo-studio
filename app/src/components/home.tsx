import { Check, Copy, ExternalLink, FileText, Film, FolderOpen, PencilRuler, Play, RefreshCw, Search } from 'lucide-react';
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
          <p className="demo-flag">{overview.attention.length} thing{overview.attention.length === 1 ? '' : 's'} to check</p>
        )}

        {overview.next && (
          <div className="demo-next">
            <span className="demo-next-label eyebrow quiet">Ask Claude</span>
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
      <div className="panel-bar"><span>Getting started</span><span>{workspace.hasPlaybook ? 3 : 4} steps</span></div>
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
      <p className="home-start-note">New demos appear here as soon as Claude scaffolds them. The examples below are filled-in plans you can open.</p>
    </section>
  );
}

const DOCS = [
  { label: 'Read me', href: 'https://github.com/Cyvid7-Darus10/demo-studio#readme' },
  { label: 'Local editor', href: 'https://github.com/Cyvid7-Darus10/demo-studio#local-editor' },
  { label: 'Roadmap', href: 'https://github.com/Cyvid7-Darus10/demo-studio/blob/main/docs/ROADMAP.md' },
];

type Section = 'overview' | 'demos' | 'examples';

interface NavItem { id: Section; label: string; count?: number }

function Sidebar({ items, active, onGo, root, onRefresh }: {
  items: NavItem[]; active: Section; onGo: (id: Section) => void; root: string; onRefresh: () => void;
}) {
  return (
    <aside className="side" aria-label="Sections">
      <span className="home-brand"><span className="mark" aria-hidden />demo-studio</span>
      <nav className="side-nav">
        <p className="side-label">Workspace</p>
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`} aria-current={active === item.id ? 'page' : undefined}
                onClick={(e) => { e.preventDefault(); onGo(item.id); }}>
                <span>{item.label}</span>
                {item.count !== undefined && <span className="nav-count">{item.count}</span>}
              </a>
            </li>
          ))}
        </ul>
        <p className="side-label">Docs</p>
        <ul>
          {DOCS.map((doc) => (
            <li key={doc.href}>
              <a href={doc.href} target="_blank" rel="noreferrer"><span>{doc.label}</span><ExternalLink size={13} aria-hidden /></a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="side-foot">
        <p className="side-label">Folder</p>
        <p className="side-root home-root" title="Where demos are looked up ($DEMO_ROOT, default ./demos)">{root}</p>
        <button className="side-util" onClick={onRefresh}><RefreshCw size={14} />Refresh</button>
      </div>
    </aside>
  );
}

function Stats({ demos }: { demos: DemoEntry[] }) {
  const finished = demos.filter((d) => !d.overview.next || d.status?.status === 'Delivered').length;
  const inProgress = demos.length - finished;
  const attention = demos.filter((d) => d.overview.attention.length > 0).length;
  const videos = demos.reduce((sum, d) => sum + d.overview.videos.length, 0);
  const tiles = [
    { label: 'Demos', value: demos.length, note: `${finished} finished` },
    { label: 'In progress', value: inProgress, note: inProgress === 1 ? 'demo still has a next step' : 'demos still have a next step' },
    { label: 'Needs attention', value: attention, note: attention ? 'see the list below' : 'nothing to check', flag: attention > 0 },
    { label: 'Videos', value: videos, note: 'cuts and reels on disk' },
  ];
  return (
    <dl className="stats" data-testid="stats">
      {tiles.map((t) => (
        <div key={t.label} className={`stat${t.flag ? ' flag' : ''}`}>
          <dt className="eyebrow quiet">{t.label}</dt>
          <dd><span className="stat-value">{t.value}</span><span className="stat-note">{t.note}</span></dd>
        </div>
      ))}
    </dl>
  );
}

function Attention({ demos, onReveal }: { demos: DemoEntry[]; onReveal: (demo: DemoEntry) => void }) {
  const rows = demos.flatMap((demo) => demo.overview.attention.map((line) => ({ demo, line })));
  if (rows.length === 0) return null;
  return (
    <section className="attention" aria-labelledby="attention-h">
      <div className="attention-bar">
        <h2 id="attention-h" className="eyebrow quiet">Needs attention</h2>
        <span className="eyebrow quiet">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
      </div>
      <ul>
        {rows.map(({ demo, line }) => (
          <li key={`${demo.path}:${line}`}>
            <span className="attention-line">{line}</span>
            <span className="attention-demo">{demo.title ?? demo.name}</span>
            <button className="btn" onClick={() => onReveal(demo)}><FolderOpen size={14} />Show folder</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Home({ session, onOpen, onRefresh }: {
  session: HomeSession; onOpen: (path: string) => void; onRefresh: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Section>('overview');
  const { demos, workspace } = session;
  const mine = useMemo(() => demos.filter((d) => d.group !== 'Examples'), [demos]);
  const examples = useMemo(() => demos.filter((d) => d.group === 'Examples'), [demos]);
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? mine.filter((d) => `${d.name} ${d.title ?? ''} ${statusOf(d)}`.toLowerCase().includes(needle))
    : mine;
  const nav: NavItem[] = [
    { id: 'overview', label: 'Overview' },
    ...(mine.length ? [{ id: 'demos' as Section, label: 'Demos', count: mine.length }] : []),
    ...(examples.length ? [{ id: 'examples' as Section, label: 'Examples', count: examples.length }] : []),
  ];
  const go = (id: Section) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };
  const revealDemo = (demo: DemoEntry) => {
    api.revealInDemo(demo.path, null, 'reveal').catch((e: Error) => setError(`Could not open ${demo.name}: ${e.message}`));
  };
  const filterBox = mine.length >= FILTER_FROM && (
    <label className="home-filter">
      <Search size={14} />
      <span className="sr-only">Filter demos</span>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter demos" />
    </label>
  );

  return (
    <main className="home">
      <Sidebar items={nav} active={active} onGo={go} root={workspace.root} onRefresh={onRefresh} />
      <div className="home-col">
        <header className="home-bar">
          <span className="home-brand"><span className="mark" aria-hidden />demo-studio</span>
          <span className="home-root mono" title="Where demos are looked up ($DEMO_ROOT, default ./demos)">{workspace.root}</span>
          <span className="home-bar-space" />
          <button className="icon-btn" onClick={onRefresh} aria-label="Refresh" title="Refresh"><RefreshCw size={15} /></button>
        </header>

        <div className="home-inner">
          {error && <p className="note bad" role="alert">{error}</p>}

          <section id="overview" className="home-section">
            <div className="home-heading">
              <p className="eyebrow quiet">Overview</p>
              <h1>{mine.length ? 'Your demos' : 'Make your first demo'}</h1>
              <p className="home-summary">
                {mine.length
                  ? 'Where every demo in this folder stands, and what to ask Claude next.'
                  : 'Nothing in this folder yet. A few steps take you from an empty folder to a planned demo.'}
              </p>
            </div>
            {mine.length > 0 ? (
              <>
                <Stats demos={mine} />
                <Attention demos={mine} onReveal={revealDemo} />
              </>
            ) : <GettingStarted session={session} />}
          </section>

          {mine.length > 0 && (
            <section id="demos" className="home-section">
              <div className="section-bar">
                <h2>Demos</h2>
                {filterBox}
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
            <section id="examples" className="home-section">
              <div className="section-bar">
                <h2>Examples</h2>
                <p className="section-note">Filled-in plans you can open and try the editor on.</p>
              </div>
              <div className="demo-grid">
                {examples.map((demo) => <DemoCard key={demo.path} demo={demo} onOpen={onOpen} onError={setError} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
