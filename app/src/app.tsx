import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type Session } from './api';
import { Home } from './components/home';
import { Editor } from './editor';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.session().then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    document.title = session?.mode === 'editor' ? `${session.name} - demo-studio` : 'demo-studio';
  }, [session]);

  const open = useCallback((path: string) => {
    setSession(null);
    api.open(path).then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  const showPicker = useCallback(() => {
    api.home().then(setSession).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="boot"><div><p>The editor could not load.</p><p className="muted">{error}</p></div></div>;
  if (!session) return <div className="boot"><Loader2 className="spin" size={20} aria-label="Loading" /></div>;
  if (session.mode === 'picker') {
    return <Home session={session} onOpen={open} onRefresh={showPicker} />;
  }
  return (
    <Editor key={session.folder} session={session} onClose={showPicker} />
  );
}
