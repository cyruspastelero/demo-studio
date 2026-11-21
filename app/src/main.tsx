import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { STATIC_DEMO, STATIC_DEMO_NOTICE } from './lib/static-demo';
import './styles.css';

if (STATIC_DEMO) {
  const note = document.createElement('p');
  note.className = 'static-demo-note';
  note.textContent = STATIC_DEMO_NOTICE;
  document.body.prepend(note);
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
