// The fonts text can use, loaded into the page as @font-face rules under the same family names the
// exports use (shared/text-style.mjs), plus the shared text-box look. Re-read on demand, so a font
// file just dropped into the demo's fonts/ folder shows up without a reload.
import { useCallback, useEffect, useState } from 'react';
import { TEXT_BOX_CSS, fontFamily } from '../../shared/text-style.mjs';
import { api, fontUrl, type FontInfo } from '../api';

const FORMAT: Record<string, string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

function styleElement(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.append(el);
  }
  return el;
}

function faceCss(font: FontInfo): string {
  const ext = font.source === 'bundled' ? 'woff2' : font.id.split('.').pop() ?? 'woff2';
  return `@font-face { font-family: '${fontFamily(font.id)}'; src: url("${fontUrl(font.id)}") format('${FORMAT[ext] ?? 'woff2'}');`
    + ' font-weight: 100 900; font-style: normal; font-display: block; }';
}

export function useFonts(onError: (message: string) => void) {
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const refresh = useCallback(() => {
    api.fonts()
      .then((list) => {
        const css = list.map(faceCss).join('\n');
        const el = styleElement('ds-fonts');
        if (el.textContent === css) return; // unchanged: leave an open menu alone
        el.textContent = css;
        setFonts(list);
      })
      .catch((e: Error) => onError(`Could not list the fonts: ${e.message}`));
  }, [onError]);
  useEffect(() => {
    styleElement('ds-text-box').textContent = TEXT_BOX_CSS;
    refresh();
    // Back from the terminal where a font was just added: list it before the menu is opened.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);
  return { fonts, refresh };
}
