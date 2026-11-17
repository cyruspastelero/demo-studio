// Shared pieces of the Prompts and Templates views: the copy toast, prompt text with its parts to
// change highlighted, and a copy button that reports through the toast.
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';
import { plainText, segments } from '../lib/prompts';

const TOAST_MS = 1800;

export type Copier = (text: string) => Promise<boolean>;

// One live region, always in the page, so screen readers announce "Copied" when it changes.
export function useCopyToast(): { copy: Copier; toast: JSX.Element } {
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback<Copier>(async (text) => {
    const ok = await copyText(text);
    window.clearTimeout(timer.current);
    setMessage(ok ? { text: 'Copied', bad: false } : { text: 'Could not copy. Select the text and copy it by hand.', bad: true });
    timer.current = window.setTimeout(() => setMessage(null), TOAST_MS);
    return ok;
  }, []);
  const toast = (
    <div className="toasts" role="status" aria-live="polite" data-testid="copy-toast">
      {message && <div className={`toast${message.bad ? ' error' : ''}`}>{message.text}</div>}
    </div>
  );
  return { copy, toast };
}

export function PromptText({ text }: { text: string }) {
  return (
    <code className="prompt-text">
      {segments(text).map((part, i) => (part.placeholder
        ? <mark key={i} className="prompt-ph" title="Change this part">{part.text}</mark>
        : <span key={i}>{part.text}</span>))}
    </code>
  );
}

// A labelled button: "Copy" turns into "Copied" for a moment. `text` may hold [[ ]] markers.
export function CopyPrompt({ text, copy, label, children = 'Copy', primary = false, testId }: {
  text: string; copy: Copier; label: string; children?: string; primary?: boolean; testId?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onClick = () => {
    copy(plainText(text)).then((ok) => {
      if (!ok) return;
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), TOAST_MS);
    });
  };
  return (
    <button className={`btn${primary ? ' primary' : ''}`} onClick={onClick} aria-label={label} data-testid={testId}>
      {done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Copied' : children}
    </button>
  );
}
