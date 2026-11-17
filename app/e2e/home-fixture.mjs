// The home-screen fixture shared by home.e2e.mjs and screenshots.mjs: a demos folder holding the example with
// synthetic takes, plus two variants at other stages and an index, so the dashboard shows several states.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  return { dir, cleanup };
}
