import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demo, handoff } from 'virtual:demo-studio-validators';
import { fromCheck, makeValidator } from './validate.mjs';
import { validatorsSource } from './validators-plugin.mjs';

const schema = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../schemas/${name}.schema.json`, import.meta.url)), 'utf8'));
const example = (file) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../examples/${file}`, import.meta.url)), 'utf8'));

describe('precompiled validators (the page CSP allows no eval)', () => {
  it('are plain code: no eval or new Function at runtime', () => {
    expect(validatorsSource()).not.toMatch(/\bnew Function\b|\beval\(|\brequire\(/);
  });

  it('give the same messages as the runtime compiler', () => {
    const cases = {
      demo: [example('todo-sample/demo.json'), { title: 'T' }, { title: 'T', template: 'house\n', sequence: [{ card: 'a', title: 'x' }] },
        { title: 'T', sequence: [{ card: 'a', title: 'x', accent: '' }] }],
      handoff: [example('acme-invoice-bot/handoff.json'), { videos: [] }],
    };
    const compiled = { demo: fromCheck(demo), handoff: fromCheck(handoff) };
    for (const [kind, docs] of Object.entries(cases)) {
      const runtime = makeValidator(schema(kind));
      for (const doc of docs) expect(compiled[kind](doc)).toEqual(runtime(doc));
    }
    expect(compiled.demo(cases.demo[0])).toEqual([]);
    expect(compiled.demo(cases.demo[1]).length).toBeGreaterThan(0);
  });
});
