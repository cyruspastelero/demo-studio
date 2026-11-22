// Small JSON Schema validator (the subset our schemas use) plus storyboard checks that need the disk.
// Errors name the path, e.g. "scenes[3].phrases: expected at least 1 item(s)".
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
const typeMatches = (want, v) => want === typeOf(v) || (want === 'number' && typeof v === 'number');

function fmtPath(path) {
  return path.reduce((s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${p}` : p), '') || '(root)';
}

function deref(root, schema) {
  let s = schema;
  while (s && s.$ref) {
    const parts = s.$ref.replace(/^#\//, '').split('/');
    s = parts.reduce((node, key) => node[key], root);
  }
  return s;
}

/** Validate value against schema. Returns a list of {path, message}. `onFormat(format, value, path)` hooks asset checks. */
export function validateSchema(rootSchema, value, { onFormat } = {}) {
  const errors = [];
  const visit = (schema, v, path) => {
    schema = deref(rootSchema, schema);
    if (!schema || schema === true) return;
    const err = (message) => errors.push({ path: fmtPath(path), message });
    if (schema.const !== undefined && v !== schema.const) return err(`must be ${JSON.stringify(schema.const)}`);
    if (schema.enum && !schema.enum.includes(v)) return err(`must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')} (got ${JSON.stringify(v)})`);
    if (schema.type && !typeMatches(schema.type, v)) return err(`expected ${schema.type}, got ${typeOf(v)}`);
    if (schema.anyOf) {
      const branchErrors = schema.anyOf.map((sub) => {
        const save = errors.length;
        visit(sub, v, path);
        return errors.splice(save);
      });
      if (!branchErrors.some((e) => e.length === 0)) {
        // Report the branch whose top-level type matched, else the one with the fewest errors.
        const typed = schema.anyOf.findIndex((sub) => { const s = deref(rootSchema, sub); return !s.type || typeMatches(s.type, v); });
        errors.push(...(typed >= 0 ? branchErrors[typed] : branchErrors.sort((a, b) => a.length - b.length)[0]));
      }
      return;
    }
    if (typeof v === 'number') {
      if (schema.minimum !== undefined && v < schema.minimum) err(`must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && v > schema.maximum) err(`must be <= ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && v <= schema.exclusiveMinimum) err(`must be > ${schema.exclusiveMinimum}`);
    }
    if (typeof v === 'string') {
      if (schema.minLength !== undefined && v.length < schema.minLength) err(`must not be empty`);
      if (schema.pattern && !new RegExp(schema.pattern).test(v)) err(`must match ${schema.pattern} (got ${JSON.stringify(v)})`);
      if (schema.format && onFormat) { const m = onFormat(schema.format, v, path); if (m) err(m); }
    }
    if (Array.isArray(v)) {
      if (schema.minItems !== undefined && v.length < schema.minItems) err(`expected at least ${schema.minItems} item(s), got ${v.length}`);
      if (schema.maxItems !== undefined && v.length > schema.maxItems) err(`expected at most ${schema.maxItems} item(s), got ${v.length}`);
      if (schema.items) v.forEach((item, i) => visit(schema.items, item, [...path, i]));
    }
    if (typeOf(v) === 'object') {
      for (const key of schema.required || []) if (!(key in v)) errors.push({ path: fmtPath([...path, key]), message: 'is required' });
      if (schema.anyOfRequired && !schema.anyOfRequired.some((keys) => keys.every((k) => k in v))) errors.push({ path: fmtPath(path), message: `needs one of: ${schema.anyOfRequired.map((k) => k.join('+')).join(' or ')}` });
      const props = schema.properties || {};
      for (const [key, sub] of Object.entries(props)) if (key in v) visit(sub, v[key], [...path, key]);
      const extraAllowed = new Set(Object.keys(props));
      for (const name of schema.additionalPropertiesFrom || []) Object.keys(rootSchema.$defs[name]).forEach((k) => extraAllowed.add(k));
      const closed = schema.additionalProperties === false || schema.additionalPropertiesFrom;
      for (const key of Object.keys(v)) {
        if (extraAllowed.has(key)) continue;
        if (closed) errors.push({ path: fmtPath([...path, key]), message: 'is not a known field' });
        else if (typeof schema.additionalProperties === 'object') visit(schema.additionalProperties, v[key], [...path, key]);
      }
    }
    for (const sub of schema.allOf || []) {
      if (sub.if) { if (quick(sub.if, v)) visit(sub.then, v, path); } else visit(sub, v, path);
    }
  };
  const quick = (schema, v) => {
    const save = errors.length;
    visit(schema, v, []);
    const ok = errors.length === save;
    errors.splice(save);
    return ok;
  };
  visit(rootSchema, value, []);
  return errors;
}

const MEDIA_IMAGE = /\.(png|jpe?g|webp|svg)$/i;
const MEDIA_VIDEO = /\.(mp4|mov|webm|m4v|gif)$/i;
const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

/** Asset existence and kind checks for storyboard `format` fields; paths resolve from baseDir. */
export function assetChecker(baseDir) {
  return (format, value) => {
    if (!format.startsWith('asset-')) return null;
    const full = resolve(baseDir, value);
    if (!existsSync(full) || !statSync(full).isFile()) return `file not found: ${value} (looked at ${full})`;
    if (format === 'asset-image' && !MEDIA_IMAGE.test(value)) return `expected an image (.png .jpg .webp .svg): ${value}`;
    if (format === 'asset-media' && !MEDIA_IMAGE.test(value) && !MEDIA_VIDEO.test(value)) return `expected an image or video: ${value}`;
    if (format === 'asset-audio' && !AUDIO.test(value)) return `expected an audio file: ${value}`;
    return null;
  };
}

/** Full storyboard check: schema, assets, and timing rules. Returns error strings. */
export function validateStoryboard(board, schema, storyboardPath) {
  const baseDir = dirname(resolve(storyboardPath));
  const errors = validateSchema(schema, board, { onFormat: assetChecker(baseDir) }).map((e) => `${e.path}: ${e.message}`);
  if (Array.isArray(board.scenes)) {
    const hasBpm = Boolean(board.timing && (board.timing.bpm || board.timing.beatsFrom));
    board.scenes.forEach((scene, i) => {
      if (scene.beats == null && scene.duration == null) errors.push(`scenes[${i}] (${scene.type}): needs "beats" or "duration"`);
      if (scene.beats != null && !hasBpm) errors.push(`scenes[${i}] (${scene.type}).beats: needs timing.bpm or timing.beatsFrom`);
      if (scene.beats != null && scene.duration != null) errors.push(`scenes[${i}] (${scene.type}): use "beats" or "duration", not both`);
    });
  }
  return errors;
}

export function validateStyle(style, schema) {
  return validateSchema(schema, style).map((e) => `${e.path}: ${e.message}`);
}
