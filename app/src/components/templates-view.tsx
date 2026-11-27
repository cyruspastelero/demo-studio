import { Check, Copy, ExternalLink, ImageOff, LayoutTemplate } from 'lucide-react';
import { serverUrl } from '../lib/static-demo';
import { useState } from 'react';
import { adStylePrompt, plainText, TEMPLATE_COPIER, templatePrompt } from '../lib/prompts';
import { originLabel, sourceLine, type AdStyle, type LookTemplate } from '../lib/templates';
import { CopyPrompt, PromptText, type Copier } from './library';

const STEPS = [
  'Copy the prompt.',
  'Paste it into your coding agent and change the path to your video.',
  'The new template appears here, ready to use.',
];

// Always at the top of the view: how to make a template from a video.
function NewTemplate({ copy }: { copy: Copier }) {
  return (
    <section className="tpl-new" aria-labelledby="tpl-new-h" data-testid="new-template">
      <div className="tpl-new-main">
        <p className="eyebrow quiet">New template</p>
        <h2 id="tpl-new-h">Copy the look of a video you like</h2>
        <p className="tpl-new-what">{TEMPLATE_COPIER.what}</p>
        <div className="tpl-new-prompt">
          <PromptText text={TEMPLATE_COPIER.text} />
          <CopyPrompt text={TEMPLATE_COPIER.text} copy={copy} primary testId="copy-copier"
            label={`Copy prompt: ${plainText(TEMPLATE_COPIER.text)}`} />
        </div>
      </div>
      <ol className="tpl-steps" aria-label="How it works">
        {STEPS.map((step) => <li key={step}>{step}</li>)}
      </ol>
    </section>
  );
}

// The frames of any template: a look's six or an ad style's ten.
interface Framed { name: string; previews: string[]; colours?: { background: string | null } }

function PreviewStrip({ template }: { template: Framed }) {
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const { previews, name } = template;
  if (previews.length === 0 || failed.has(shown)) {
    return (
      <div className="tpl-preview tpl-preview-empty" style={{ background: template.colours?.background ?? undefined }}>
        <span><ImageOff size={18} aria-hidden />No preview yet</span>
      </div>
    );
  }
  const next = () => setShown((shown + 1) % previews.length);
  const markFailed = () => setFailed(new Set([...failed, shown]));
  return (
    <div className="tpl-strip">
      <button className="tpl-preview" onClick={next} disabled={previews.length < 2}
        aria-label={previews.length > 1 ? `${name}: frame ${shown + 1} of ${previews.length}. Show the next frame` : `${name}: preview frame`}>
        <img src={serverUrl(previews[shown])} alt="" onError={markFailed} />
        {previews.length > 1 && <span className="tpl-frame mono" aria-hidden>{shown + 1}/{previews.length}</span>}
      </button>
      {previews.length > 1 && (
        <div className="tpl-thumbs">
          {previews.map((url, i) => (
            <button key={url} className="tpl-thumb" aria-pressed={i === shown} onClick={() => setShown(i)}
              aria-label={`Show frame ${i + 1}`}>
              <img src={serverUrl(url)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyId({ id, copy }: { id: string; copy: Copier }) {
  const [done, setDone] = useState(false);
  const onClick = () => copy(id).then((ok) => {
    setDone(ok);
    if (ok) window.setTimeout(() => setDone(false), 1600);
  });
  return (
    <button className="icon-btn" onClick={onClick} aria-label={`Copy template id ${id}`} title="Copy id" data-testid="copy-id">
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Swatch({ colour, label }: { colour: string | null; label: string }) {
  if (!colour) return null;
  return (
    <span className="tpl-swatch">
      <span className="tpl-chip" style={{ background: colour }} aria-hidden />
      <span>{label}</span>
      <span className="mono">{colour}</span>
    </span>
  );
}

function TemplateCard({ template, copy }: { template: LookTemplate; copy: Copier }) {
  const source = sourceLine(template);
  const { accent, background } = template.colours;
  return (
    <article className="tpl-card" data-testid="template-card" data-template={template.id} data-origin={template.origin}>
      <PreviewStrip template={template} />
      <div className="tpl-body">
        <header className="demo-head">
          <h3>{template.name}</h3>
          <span className={`demo-status tpl-origin ${template.origin}`}>{originLabel(template.origin)}</span>
        </header>
        <div className="tpl-id">
          <code className="mono">{template.id}</code>
          <CopyId id={template.id} copy={copy} />
        </div>
        {template.description && <p className="tpl-desc">{template.description}</p>}
        {source && <p className="tpl-source">{source}</p>}
        {(accent || background) && (
          <div className="tpl-swatches" aria-label="Colours">
            <Swatch colour={accent} label="Accent" />
            <Swatch colour={background} label="Background" />
          </div>
        )}
        <footer className="demo-actions">
          <CopyPrompt text={templatePrompt(template.id)} copy={copy} primary testId="use-template"
            label={`Copy a prompt that makes a demo with template ${template.id}`}>Use</CopyPrompt>
        </footer>
      </div>
    </article>
  );
}

function AdStyleCard({ style, copy }: { style: AdStyle; copy: Copier }) {
  return (
    <article className="tpl-card" data-testid="ad-style-card" data-style={style.id}>
      <PreviewStrip template={style} />
      <div className="tpl-body">
        <header className="demo-head">
          <h3>{style.name}</h3>
          <span className="demo-status tpl-origin built-in">Launch ad</span>
        </header>
        <div className="tpl-id">
          <code className="mono">{style.id}</code>
          <CopyId id={style.id} copy={copy} />
        </div>
        {style.description && <p className="tpl-desc">{style.description}</p>}
        {style.bestFor.length > 0 && (
          <ul className="tpl-tags" aria-label="Suits">{style.bestFor.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
        <footer className="demo-actions">
          <CopyPrompt text={adStylePrompt(style.id)} copy={copy} primary testId="use-ad-style"
            label={`Copy a prompt that makes a launch ad in the ${style.id} style`}>Use</CopyPrompt>
          {style.sample && (
            <a className="btn" href={style.sample.url} target="_blank" rel="noreferrer" data-testid="ad-style-sample"
              title={`Watch the ${style.sample.label}, made with this style`}><ExternalLink size={14} />Watch the sample</a>
          )}
        </footer>
      </div>
    </article>
  );
}

export function TemplatesView({ templates, adStyles, error, copy }: {
  templates: LookTemplate[] | null; adStyles: AdStyle[] | null; error: string | null; copy: Copier;
}) {
  const mine = templates?.filter((t) => t.origin === 'workspace').length ?? 0;
  return (
    <section id="templates" className="home-section" data-testid="templates-view">
      <div className="home-heading">
        <p className="eyebrow quiet">Templates</p>
        <h1>Looks you can reuse</h1>
        <p className="home-summary">
          A template keeps the colours, type and pacing of a video, so every demo you make with it looks the same.
          Yours are in <code className="mono">_templates/</code> in your demos folder.
        </p>
      </div>
      <NewTemplate copy={copy} />
      {error && <p className="note bad" role="alert">Could not list the templates: {error}</p>}
      {templates && templates.length > 0 && (
        <>
          <div className="section-bar tpl-list-bar">
            <h2>Demo video looks</h2>
            <p className="section-note">{mine} yours, {templates.length - mine} built in. Click a picture to see the next frame.</p>
          </div>
          <div className="demo-grid">
            {templates.map((t) => <TemplateCard key={`${t.origin}:${t.id}`} template={t} copy={copy} />)}
          </div>
        </>
      )}
      {adStyles && adStyles.length > 0 && (
        <>
          <div className="section-bar tpl-list-bar" id="ad-styles">
            <h2>Launch-ad styles</h2>
            <p className="section-note">Short music-driven ads cut from a demo's real footage, like the Switchyard launch ad. Click a picture for the next frame.</p>
          </div>
          <div className="demo-grid">
            {adStyles.map((s) => <AdStyleCard key={s.id} style={s} copy={copy} />)}
          </div>
        </>
      )}
      {templates && templates.length === 0 && !error && (
        <div className="tpl-empty" data-testid="templates-empty">
          <LayoutTemplate size={18} aria-hidden />
          <div>
            <p className="tpl-empty-title">No templates yet</p>
            <p>Give your agent a video whose look you like with the prompt above. It saves the look here, and you can use it for any demo after that.</p>
          </div>
        </div>
      )}
    </section>
  );
}
