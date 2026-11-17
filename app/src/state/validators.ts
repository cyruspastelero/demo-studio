// Precompiled at build time (shared/validators-plugin.mjs): the page's CSP allows no eval, which
// Ajv's runtime compiler needs.
import { demo, handoff } from 'virtual:demo-studio-validators';
import { fromCheck } from '../../shared/validate.mjs';
import type { FileKind } from '../lib/types';

const validators: Record<FileKind, (data: unknown) => string[]> = {
  handoff: fromCheck(handoff),
  demo: fromCheck(demo),
};

export function validate(kind: FileKind, data: unknown): string[] {
  return validators[kind](data);
}
