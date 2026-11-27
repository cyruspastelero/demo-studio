// Holds handoff.json and demo.json with undo/redo, autosaves after edits, and reconciles with
// edits made outside the app (Claude, a text editor).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, isStaleOpen, type FileState } from '../api';
import { STATIC_DEMO } from '../lib/static-demo';
import type { FileKind } from '../lib/types';
import { commit, type Docs, type History, initHistory, redo as redoStep, undo as undoStep } from './history';
import { validate } from './validators';

export const AUTOSAVE_MS = 800;
const KINDS: FileKind[] = ['handoff', 'demo'];

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'invalid' | 'error' | 'conflict';

export interface Conflict {
  kind: FileKind;
  data: unknown;
  hash: string;
  diskErrors: string[];
}

interface Saved {
  data: unknown;
  hash: string | null;
}

type Notify = (message: string, tone?: 'info' | 'error') => void;

function initialSaved(files: Record<FileKind, FileState | null>): Record<FileKind, Saved> {
  return {
    handoff: { data: files.handoff?.data, hash: files.handoff?.hash ?? null },
    demo: { data: files.demo?.data, hash: files.demo?.hash ?? null },
  };
}

export function useDocuments(files: Record<FileKind, FileState | null>, notify: Notify) {
  const [history, setHistory] = useState<History>(() =>
    initHistory({ handoff: files.handoff?.data ?? undefined, demo: files.demo?.data ?? undefined }));
  const saved = useRef(initialSaved(files));
  const present = useRef<Docs>(history.present);
  present.current = history.present;
  const [status, setStatus] = useState<Record<FileKind, SaveStatus>>({ handoff: 'saved', demo: 'saved' });
  const [errors, setErrors] = useState<Record<FileKind, string[]>>({
    handoff: files.handoff?.errors ?? [], demo: files.demo?.errors ?? [],
  });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [tick, setTick] = useState(0);
  // The save under way for each file, so a second caller waits for it instead of reading "failed".
  const inFlight = useRef<Record<FileKind, Promise<boolean> | null>>({ handoff: null, demo: null });
  // Another tab opened a different demo: this tab must not write again (see api.ts openId).
  const [stale, setStale] = useState(false);
  const staleRef = useRef(false);

  const setKindStatus = (kind: FileKind, value: SaveStatus) => setStatus((s) => (s[kind] === value ? s : { ...s, [kind]: value }));
  const setKindErrors = (kind: FileKind, value: string[]) => setErrors((e) => ({ ...e, [kind]: value }));

  // One PUT; resolves true when it was written. Only a success with newer edits waiting asks the
  // autosave to run again; after a failure it waits for the next edit, so a stopped server is not
  // retried every 800 ms.
  const write = useCallback(async (kind: FileKind, data: unknown, keepalive: boolean): Promise<boolean> => {
    setKindStatus(kind, 'saving');
    try {
      const { hash } = await api.save(kind, data, saved.current[kind].hash, keepalive);
      saved.current = { ...saved.current, [kind]: { data, hash } };
      const current = present.current[kind] === data;
      setKindStatus(kind, current ? 'saved' : 'pending');
      if (!current) setTick((t) => t + 1);
      return true;
    } catch (error) {
      if (isStaleOpen(error)) {
        staleRef.current = true;
        setStale(true);
        setStatus({ handoff: 'error', demo: 'error' });
        notify(`${(error as Error).message} Your last edits here were not saved.`, 'error');
      } else if (error instanceof ApiError && error.status === 409) {
        let disk: unknown = null;
        try {
          disk = JSON.parse(String(error.body.text));
        } catch { /* broken JSON on disk; the dialog offers only "keep mine" */ }
        setConflict({ kind, data: disk, hash: String(error.body.hash), diskErrors: disk ? validate(kind, disk) : ['not valid JSON'] });
        setKindStatus(kind, 'conflict');
      } else if (error instanceof ApiError && error.status === 422) {
        setKindErrors(kind, (error.body.errors as string[]) ?? [error.message]);
        setKindStatus(kind, 'invalid');
      } else {
        setKindStatus(kind, 'error');
        notify(`Could not save ${kind}.json: ${(error as Error).message}`, 'error');
      }
      return false;
    }
  }, [notify]);

  // Resolves true when the file on disk matches the editor afterwards. A save already under way is
  // awaited first, then the file is saved again if it changed meanwhile (not after a failure).
  const save = useCallback(async (kind: FileKind, keepalive = false): Promise<boolean> => {
    const running = inFlight.current[kind];
    if (running) return (await running) && save(kind, keepalive);
    const data = present.current[kind];
    if (data === undefined || data === saved.current[kind].data) return true;
    if (staleRef.current) return false;
    const problems = validate(kind, data);
    setKindErrors(kind, problems);
    if (problems.length) {
      setKindStatus(kind, 'invalid');
      return false;
    }
    const attempt = write(kind, data, keepalive);
    inFlight.current[kind] = attempt;
    try {
      return (await attempt) && present.current[kind] === data;
    } finally {
      inFlight.current[kind] = null;
    }
  }, [write]);

  // Autosave, debounced, for each file that differs from what is on disk.
  useEffect(() => {
    if (conflict || stale) return undefined;
    const timers = KINDS.filter((k) => history.present[k] !== undefined && history.present[k] !== saved.current[k].data)
      .map((kind) => {
        if (!inFlight.current[kind]) setKindStatus(kind, 'pending');
        return setTimeout(() => save(kind), AUTOSAVE_MS);
      });
    return () => timers.forEach(clearTimeout);
  }, [history.present, save, tick, conflict, stale]);

  // Closing or reloading the tab inside the autosave delay: start the saves (keepalive, so they
  // outlive the page) and ask the browser to warn, since they may not finish in time.
  useEffect(() => {
    if (STATIC_DEMO) return undefined;
    const onLeave = (event: BeforeUnloadEvent) => {
      const dirty = KINDS.filter((k) => present.current[k] !== undefined && present.current[k] !== saved.current[k].data);
      if (!dirty.length || staleRef.current) return;
      dirty.forEach((kind) => { void save(kind, true); });
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [save]);

  const apply = useCallback((kind: FileKind, update: (doc: unknown) => unknown) => {
    setHistory((h) => {
      const current = h.present[kind];
      const next = update(current);
      return next === current ? h : commit(h, { ...h.present, [kind]: next });
    });
  }, []);

  const replaceFromDisk = useCallback((kind: FileKind, data: unknown, hash: string) => {
    saved.current = { ...saved.current, [kind]: { data, hash } };
    // A fresh history: undoing past a reload would put the old version back and autosave it over
    // the outside edit without asking.
    setHistory((h) => initHistory({ ...h.present, [kind]: data }));
    setKindErrors(kind, validate(kind, data));
    setKindStatus(kind, 'saved');
  }, []);

  const onOutsideChange = useCallback((file: FileState & { kind: FileKind }) => {
    const { kind } = file;
    const dirty = present.current[kind] !== saved.current[kind].data;
    if (!file.data) {
      saved.current = { ...saved.current, [kind]: { ...saved.current[kind], hash: file.hash } };
      notify(`${file.name} was changed outside the app and is not valid JSON. Your version is kept; it will replace the file on the next save.`, 'error');
      return;
    }
    if (!dirty) {
      replaceFromDisk(kind, file.data, file.hash);
      notify(`${file.name} changed outside the app. Reloaded.`);
      return;
    }
    setConflict({ kind, data: file.data, hash: file.hash, diskErrors: file.errors });
    setKindStatus(kind, 'conflict');
  }, [notify, replaceFromDisk]);

  const resolveConflict = useCallback((choice: 'mine' | 'disk') => {
    if (!conflict) return;
    const { kind } = conflict;
    if (choice === 'disk' && conflict.data) {
      replaceFromDisk(kind, conflict.data, conflict.hash);
      notify(`Loaded ${kind}.json from disk.`);
    } else {
      // Treat the disk version as seen, so the next save replaces it with ours.
      saved.current = { ...saved.current, [kind]: { data: Symbol('outdated'), hash: conflict.hash } };
      setKindStatus(kind, 'pending');
    }
    setConflict(null);
    setTick((t) => t + 1);
  }, [conflict, notify, replaceFromDisk]);

  return {
    docs: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo: () => setHistory(undoStep),
    redo: () => setHistory(redoStep),
    apply,
    status,
    errors,
    conflict,
    resolveConflict,
    onOutsideChange,
    saveNow: save,
    // Read after an await: true once the server said another demo was opened since this tab's.
    isStale: () => staleRef.current,
  };
}
