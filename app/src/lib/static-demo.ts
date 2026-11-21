// The GitHub Pages build (vite --mode static) runs the editor with no server: reads come from
// recorded files next to the page, edits stay in this tab, and rendering is not available.
import { staticKey } from '../../shared/static-key.mjs';

export const STATIC_DEMO = import.meta.env.MODE === 'static';

export const STATIC_DEMO_NOTICE = 'This is a live demo with no server: edits stay in this tab, and rendering, '
  + 'revealing and opening files need the local studio.';

export function serverUrl(path: string): string {
  return STATIC_DEMO ? `./data/${staticKey(path)}` : path;
}
