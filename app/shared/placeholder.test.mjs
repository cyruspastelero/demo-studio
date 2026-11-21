import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPlaceholderTitle } from './placeholder.mjs';

const template = (name) => JSON.parse(readFileSync(new URL(`../../templates/${name}`, import.meta.url), 'utf8'));

describe('isPlaceholderTitle', () => {
  it('matches the titles the templates ship with', () => {
    expect(isPlaceholderTitle(template('handoff.json').title)).toBe(true);
    expect(isPlaceholderTitle(template('demo.json').title)).toBe(true);
  });
  it('treats a missing or blank title as a placeholder and a real one as not', () => {
    expect(isPlaceholderTitle(undefined)).toBe(true);
    expect(isPlaceholderTitle('  ')).toBe(true);
    expect(isPlaceholderTitle(' Product name ')).toBe(true);
    expect(isPlaceholderTitle('Invoice bot')).toBe(false);
  });
});
