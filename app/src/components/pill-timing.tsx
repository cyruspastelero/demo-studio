import { useId } from 'react';
import type { Edit } from '../lib/edits';
import { isDemoCard } from '../lib/timeline';
import type { DemoDoc, DemoSceneItem, Timeline, WordCue } from '../lib/types';
import { cueFromChoice, cueVoice, estimateLanding, isWordCue, normWord, offeredWords, resolveCue, type OfferedWord } from '../lib/word-cue';
import { NumberField } from './fields';

interface Props {
  doc: DemoDoc;
  scene: number;
  timeline: Timeline;
  onEdit: (edit: Edit) => void;
}

const tenth = (n: number) => Math.round(n * 10) / 10;

function problem(cue: WordCue, reason: 'no-voiceover' | 'missing-word' | 'nth-too-high'): string {
  const fix = 'The build will stop. Pick another word, or switch to a time.';
  if (reason === 'no-voiceover') return 'This pill is timed to a word, but the scene has no voiceover line. The build will stop. Add the line, or switch to a time.';
  if (reason === 'nth-too-high') return `The voiceover no longer says '${cue.word}' ${cue.nth} times. ${fix}`;
  return `The word '${cue.word}' is no longer in the voiceover. ${fix}`;
}

// The word the user sees chosen: the offered entry the cue points at, if there is one.
function chosen(cue: WordCue, offered: OfferedWord[]): number {
  const word = normWord(cue.word);
  return offered.findIndex((w) => w.word === word && w.nth === (cue.nth ?? 1));
}

// When the first pill of a demo.json scene appears: at a time, or on a word of the scene's voiceover.
export function PillTiming({ doc, scene, timeline, onEdit }: Props) {
  const labelId = useId();
  const item = doc.sequence[scene];
  const callout = item && !isDemoCard(item) ? (item as DemoSceneItem).callouts?.[0] : undefined;
  if (!callout) return null;
  const voiceover = timeline.scenes[scene]?.voiceover ?? '';
  const offered = offeredWords(voiceover);
  const { at } = callout;
  const set = (next: number | WordCue) => onEdit({ op: 'cue', scene, at: next });
  const estimate = (fraction: number, offset?: number) =>
    estimateLanding({ fraction, text: voiceover, ...cueVoice(doc), offset });
  const landing = (cue: WordCue) => {
    const found = resolveCue(cue, voiceover);
    return found.ok ? estimate(found.fraction, cue.offset) : undefined;
  };

  const toTime = () => set(tenth(Math.max(0, isWordCue(at) ? landing(at) ?? 0 : at)));
  const toWord = () => {
    // Start from the word nearest the current time, so the pill barely moves.
    const time = isWordCue(at) ? 0 : at;
    const gap = (w: OfferedWord) => Math.abs(estimate(w.fraction) - time);
    const near = offered.reduce((best, w) => (gap(w) < gap(best) ? w : best), offered[0]);
    set(cueFromChoice(near.display, near.nth, 0));
  };

  const cue = isWordCue(at) ? at : undefined;
  const found = cue ? resolveCue(cue, voiceover) : undefined;
  const lands = cue ? landing(cue) : undefined;
  return (
    <div className="field" data-testid="pill-timing">
      <span id={labelId}>Pill timing</span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        <button aria-pressed={!cue} onClick={toTime} data-testid="pill-mode-time">At a time</button>
        <button aria-pressed={Boolean(cue)} onClick={toWord} disabled={!cue && !offered.length} data-testid="pill-mode-word">On a spoken word</button>
      </div>
      {!cue && !offered.length && <small className="field-note">Add a voiceover line to time the pill to a word.</small>}
      {typeof at === 'number' && (
        <NumberField label="Starts at (seconds into the scene)" value={at} min={0} step={0.1} onCommit={set} testId="pill-at" />
      )}
      {cue && (
        <>
          <label className="field">
            <span>Word in the voiceover</span>
            <select data-testid="pill-word" value={String(chosen(cue, offered))}
              onChange={(e) => { const w = offered[Number(e.target.value)]; set(cueFromChoice(w.display, w.nth, cue.offset ?? 0)); }}>
              {chosen(cue, offered) < 0 && <option value="-1" disabled>Pick a word</option>}
              {offered.map((w, i) => <option key={`${w.word}-${w.nth}-${i}`} value={String(i)}>{w.label}</option>)}
            </select>
          </label>
          <NumberField label="Offset (seconds)" value={cue.offset ?? 0} min={-5} max={5} step={0.1} testId="pill-offset"
            hint="Negative moves it earlier." onCommit={(v) => set(cueFromChoice(cue.word, cue.nth ?? 1, v))} />
          {lands !== undefined && (
            <small className="field-note" data-testid="pill-estimate" aria-live="polite">
              Lands about {lands.toFixed(1)} s in. Estimated; the build measures the real line.
            </small>
          )}
          {found && !found.ok && <div className="note bad" role="alert" data-testid="pill-problem">{problem(cue, found.reason)}</div>}
        </>
      )}
    </div>
  );
}
