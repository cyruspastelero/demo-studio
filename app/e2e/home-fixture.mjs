// The home-screen fixture shared by home.e2e.mjs and screenshots.mjs: a demos folder holding the example with
// synthetic takes, plus two variants at other stages and an index, so the dashboard shows several states.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exampleCopy, REPO } from './harness.mjs';

const INDEX = `# Demos

| Demo | What it shows | Status | Final cut |
| --- | --- | --- | --- |
| [acme-invoice-bot](acme-invoice-bot/README.md) | A chat thread becomes an invoice | Review (2026-01-02): reel sent | none yet |
| [acme-payment-links](acme-payment-links/README.md) | A payment link from one sentence | Recording (2026-01-05) | none yet |
| [acme-onboarding](acme-onboarding/README.md) | A new customer set up in two minutes | Delivered (2026-01-09) | \`acme-onboarding/final/acme-onboarding.mp4\` |
`;

// Two more demos at other stages, so the home screen (and its screenshot) shows more than one state.
function variant(dir, name, title, change) {
  const folder = join(dir, name);
  cpSync(join(dir, 'acme-invoice-bot'), folder, { recursive: true });
  for (const file of ['demo.json', 'handoff.json']) {
    const config = JSON.parse(readFileSync(join(folder, file), 'utf8'));
    writeFileSync(join(folder, file), `${JSON.stringify({ ...config, title }, null, 2)}\n`);
  }
  change(folder);
}

export const FIXTURE_TEMPLATE = {
  id: 'warm-keynote',
  name: 'Warm keynote',
  description: 'Dark stage, a warm orange accent, slow zooms and short title cards.',
  created: '2026-11-18',
  source: 'copied',
  look: { brand: { accent: '#ff7043', background: { base: '#141414' } } },
};
const FIXTURE_SOURCE = { file: 'reference.mp4', duration: 96 };

// A template of the user's own in <demos>/_templates/, with six preview frames taken from the synthetic takes.
function templateFixture(dir) {
  const folder = join(dir, '_templates', FIXTURE_TEMPLATE.id);
  mkdirSync(join(folder, 'preview'), { recursive: true });
  writeFileSync(join(folder, 'template.json'), `${JSON.stringify(FIXTURE_TEMPLATE, null, 2)}\n`);
  writeFileSync(join(folder, 'README.md'), `# ${FIXTURE_TEMPLATE.name}\n`);
  writeFileSync(join(folder, 'source.json'), `${JSON.stringify(FIXTURE_SOURCE, null, 2)}\n`);
  const raw = join(dir, 'acme-invoice-bot', 'recordings', 'raw');
  const takes = readdirSync(raw).filter((f) => f.endsWith('.mp4')).sort();
  for (let i = 0; i < 6; i += 1) {
    const out = join(folder, 'preview', `0${i + 1}.png`);
    const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.5', '-i', join(raw, takes[i % takes.length]),
      '-frames:v', '1', '-vf', 'scale=640:-2', out], { stdio: 'inherit' });
    if (made.status !== 0) throw new Error(`could not make template preview ${out}`);
  }
}

export function homeFixture() {
  const { dir, cleanup } = exampleCopy();
  writeFileSync(join(dir, 'README.md'), INDEX);
  for (const file of ['AGENTS.md', 'check.py']) copyFileSync(join(REPO, 'starter', file), join(dir, file));
  variant(dir, 'acme-payment-links', 'Acme Payment Links', (folder) => {
    const takes = join(folder, 'recordings', 'takes.csv');
    writeFileSync(takes, readFileSync(takes, 'utf8').replace(/,keep,/, ',new,').replace(/,keep,/, ',new,'));
  });
  variant(dir, 'acme-onboarding', 'Acme Onboarding', (folder) => {
    mkdirSync(join(folder, 'final'));
    copyFileSync(join(folder, 'recordings', 'raw', '05-approve-t1.mp4'), join(folder, 'final', 'acme-onboarding.mp4'));
  });
  templateFixture(dir);
  return { dir, cleanup };
}
