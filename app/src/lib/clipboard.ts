// Copies text, with a fallback for when the async clipboard is missing or refused (an older
// browser, or a page that is not focused). Resolves false only when both ways fail.
export async function copyText(text: string, doc: Document = document): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no async clipboard');
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text, doc);
  }
}

function legacyCopy(text: string, doc: Document): boolean {
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  const focused = doc.activeElement as HTMLElement | null;
  area.select();
  let ok = false;
  try {
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  focused?.focus?.();
  return ok;
}
