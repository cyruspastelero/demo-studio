import { ChevronDown, ChevronRight, ExternalLink, FolderSearch, Square, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { api, type CheckRow, type CheckStatus, type OutputFile, type RenderState } from '../api';
import { CHECK_LABEL, summarizeChecks, summaryText } from '../lib/checks';
import { mediaUrl } from '../lib/player';

const STATUS: Record<RenderState['status'], string> = {
  running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
};

function CheckRows({ rows, status }: { rows: CheckRow[]; status: CheckStatus }) {
  return (
    <div className="check-group">
      <div className="check-label">{CHECK_LABEL[status]}</div>
      <ul>
        {rows.map((r, i) => (
          <li key={`${r.item}-${i}`} className={`check-row ${status.toLowerCase()}`}>
            <span className="check-id mono">{r.item}</span>
            <span>{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// What the server's checkers found in a finished video: one line, then the rows on request.
function ChecksView({ file, checking }: { file: OutputFile; checking: boolean }) {
  const [open, setOpen] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const id = useId();
  const results = file.checks ?? [];
  const summary = summarizeChecks(results);
  const level = summary.fail ? 'fail' : summary.look ? 'look' : 'pass';
  if (!results.length && !file.note) {
    return checking ? <div className="checks-line" role="status" data-testid="render-checks">Checking…</div> : null;
  }
  return (
    <div className="checks" data-testid="render-checks">
      {results.length > 0 && (
        <>
          <button className="checks-toggle" data-level={level} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{summaryText(summary)}</span>
          </button>
          {open && (
            <div id={id} className="checks-rows">
              {(['FAIL', 'LOOK'] as const).map((st) => {
                const rows = summary.shown.filter((r) => r.status === st);
                return rows.length > 0 && <CheckRows key={st} rows={rows} status={st} />;
              })}
              {summary.passing.length > 0 && (
                <button className="checks-more" aria-expanded={showPass} onClick={() => setShowPass(!showPass)}>
                  {showPass ? 'Hide passing' : `Show ${summary.passing.length} passing`}
                </button>
              )}
              {showPass && <CheckRows rows={summary.passing} status="PASS" />}
            </div>
          )}
        </>
      )}
      {file.note && <div className="field-note">{file.note}</div>}
    </div>
  );
}

function OutputView({ file, checking, onError }: { file: OutputFile; checking: boolean; onError: (m: string) => void }) {
  const ext = file.path.split('.').pop()?.toLowerCase();
  const act = (action: 'reveal' | 'open') => api.reveal(file.path, action).catch((e: Error) => onError(e.message));
  return (
    <div className="output" data-testid="render-output">
      {file.rel && (ext === 'mp4' || ext === 'mov') && <video src={mediaUrl(file.rel)} controls muted playsInline preload="metadata" />}
      {file.rel && ext === 'png' && <img src={mediaUrl(file.rel)} alt={file.rel} />}
      <div className="path">{file.rel ?? file.path}</div>
      <div className="actions">
        <button className="btn" onClick={() => act('reveal')}><FolderSearch size={14} />Reveal in Finder</button>
        {!file.isDir && <button className="btn" onClick={() => act('open')}><ExternalLink size={14} />Open</button>}
      </div>
      {ext === 'mp4' && <ChecksView file={file} checking={checking} />}
    </div>
  );
}

export function RenderDrawer({ job, onClose, onError }: { job: RenderState; onClose: () => void; onError: (m: string) => void }) {
  const log = useRef<HTMLPreElement>(null);
  // The log is capped, so its length stops changing on a long render; the last line still does.
  const lastLine = job.log[job.log.length - 1];
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job.log.length, lastLine]);
  const p = job.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : null;
  const files = job.outputFiles ?? [];
  // A render can print dozens of outputs (every title card); show the last few.
  const shown = files.slice(-6);
  return (
    <aside className="drawer" aria-label="Render" data-testid="render-drawer" data-status={job.status}>
      <div className="panel-head">
        <span className="drawer-title">{job.label}</span>
        <span className={`drawer-status ${job.status}`} data-testid="render-status">{STATUS[job.status]}</span>
        <span className="spacer" />
        <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="drawer-body">
        <div className={`progress${job.status === 'running' && pct === null ? ' indeterminate' : ''}`} role="progressbar"
          aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100} data-testid="render-progress">
          <div style={{ width: job.status === 'done' ? '100%' : pct === null ? undefined : `${pct}%` }} />
        </div>
        <div className="drawer-stage mono" data-testid="render-stage">
          {job.checking ? 'Checking…' : p ? `${p.stage} ${p.done}/${p.total}` : job.status === 'running' ? 'Starting' : ''}
          {job.error ? ` ${job.error}` : ''}
        </div>
        {job.status === 'running' && (
          <div><button className="btn danger" onClick={() => api.cancel().catch((e: Error) => onError(e.message))}><Square size={13} />Cancel</button></div>
        )}
        {shown.length > 0 && (
          <div className="outputs">
            {files.length > shown.length && <div className="field-note">{files.length} files written; the last {shown.length} are shown.</div>}
            {shown.map((f) => <OutputView key={f.path} file={f} checking={!!job.checking} onError={onError} />)}
          </div>
        )}
        <pre className="log mono" ref={log} data-testid="render-log">
          {job.log.map((l, i) => <div key={i} className={l.stream === 'err' ? 'err' : ''}>{l.line}</div>)}
        </pre>
      </div>
    </aside>
  );
}
