import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJson } from '../shared/format.mjs';
import { validators } from '../shared/schemas.mjs';

export const FILES = { handoff: 'handoff.json', demo: 'demo.json' };
const WATCH_SETTLE_MS = 150;

export const hashText = (text) => createHash('sha1').update(text).digest('hex');

export class SaveError extends Error {
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function readDocument(folder, kind) {
  const file = join(folder, FILES[kind]);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  let data = null;
  let errors = [];
  try {
    data = JSON.parse(text);
    errors = validators[kind](data);
  } catch (error) {
    errors = [`${FILES[kind]} is not valid JSON: ${error.message}`];
  }
  return { kind, name: FILES[kind], text, hash: hashText(text), data, errors };
}

// Tracks what this server last wrote or saw, so the watcher can tell outside edits from its own.
export class DocumentStore {
  constructor(folder, onOutsideChange) {
    this.folder = folder;
    this.known = new Map();
    this.onOutsideChange = onOutsideChange;
    this.timers = new Map();
    for (const kind of Object.keys(FILES)) {
      const doc = readDocument(folder, kind);
      if (doc) this.known.set(kind, doc.hash);
    }
    this.watcher = watch(folder, (_event, name) => {
      const kind = Object.keys(FILES).find((k) => FILES[k] === String(name));
      if (kind) this.settle(kind);
    });
    this.watcher.on('error', (error) => console.error(`studio: file watch stopped: ${error.message}`));
  }

  settle(kind) {
    clearTimeout(this.timers.get(kind));
    this.timers.set(kind, setTimeout(() => {
      const doc = readDocument(this.folder, kind);
      if (!doc || doc.hash === this.known.get(kind)) return;
      this.known.set(kind, doc.hash);
      this.onOutsideChange(doc);
    }, WATCH_SETTLE_MS));
  }

  // Validates, refuses to overwrite an outside edit the client has not seen, then writes a temp
  // file and renames it over the original so a reader never sees half a file.
  save(kind, data, baseHash) {
    if (!FILES[kind]) throw new SaveError(`unknown file ${kind}`, 400);
    const errors = validators[kind](data);
    if (errors.length) throw new SaveError(`${FILES[kind]} not saved: it does not match the schema`, 422, { errors });
    const file = join(this.folder, FILES[kind]);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    const currentHash = current === null ? null : hashText(current);
    // An existing file is only overwritten by a client that proves it saw the current version.
    // A missing baseHash is treated like a stale one, so a blind write cannot replace the file.
    if (currentHash !== null && baseHash !== currentHash) {
      const message = typeof baseHash === 'string' && baseHash
        ? `${FILES[kind]} changed on disk since it was loaded`
        : `${FILES[kind]} already exists; reload it before saving`;
      throw new SaveError(message, 409, { text: current, hash: currentHash });
    }
    const text = formatJson(data);
    const hash = hashText(text);
    if (hash === currentHash) return { hash };
    const temp = join(this.folder, `.${FILES[kind]}.studio-${process.pid}.tmp`);
    this.known.set(kind, hash);
    try {
      writeFileSync(temp, text);
      renameSync(temp, file);
    } catch (error) {
      this.known.set(kind, currentHash);
      try { unlinkSync(temp); } catch { /* temp was never created */ }
      throw new SaveError(`could not write ${FILES[kind]}: ${error.message}`, 500);
    }
    return { hash };
  }

  close() {
    this.watcher.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
}
