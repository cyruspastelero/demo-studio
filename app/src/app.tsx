import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type Session } from './api';
import { Home } from './components/home';
import { Editor } from './editor';

// The address says where you are: the bare address is the home screen, #edit the open demo. So a
// refresh, or opening the address fresh, lands where it says (the server remembers the last demo).
const EDIT_HASH = '#edit';
const showEditInAddress = () => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${EDIT_HASH}`);
// Home drops ?open too (the static demo's link into the editor), so a refresh stays home.
const showHomeInAddress = () => window.history.replaceState(null, '', window.location.pathname);

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ?open: the static Pages demo's link straight into the editor.
    const inEditor = window.location.hash === EDIT_HASH || new URLSearchParams(window.location.search).has('open');
    (inEditor ? api.session() : api.home()).then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    document.title = session?.mode === 'editor' ? `${session.name} - demo-studio` : 'demo-studio';
  }, [session]);

  const open = useCallback((path: string) => {
    setSession(null);
    api.open(path).then((next) => { showEditInAddress(); setSession(next); }).catch((e: Error) => setError(e.message));
  }, []);

  // Errors stay on the card (the copy can fail, the home screen should not).
  const tryExample = useCallback((path: string) => api.tryExample(path).then((next) => { showEditInAddress(); setSession(next); }), []);

  const showPicker = useCallback(() => {
    showHomeInAddress();
    api.home().then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="boot"><div><p>The editor could not load.</p><p className="muted">{error}</p></div></div>;
  if (!session) return <div className="boot"><Loader2 className="spin" size={20} aria-label="Loading" /></div>;
  if (session.mode === 'picker') {
    return <Home session={session} onOpen={open} onTry={tryExample} onRefresh={showPicker} />;
  }
  return (
    <Editor key={session.folder} session={session} onClose={showPicker} />
  );
}
