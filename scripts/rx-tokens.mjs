// Reads recordings/.rx-token (written by frame-receiver.mjs: a JSON map of port -> token) and
// turns it into the `const RX_TOKENS = {...};` line that goes in front of lib.js in scene code.
// Only port-number keys with hex tokens are kept, so a file from someone else's demo folder
// cannot inject code. Usage (from recordings/): node rx-tokens.mjs   -> prints the line
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readRxTokens(dir = process.cwd()) {
  const file = resolve(dir, '.rx-token');
  if (!existsSync(file)) return {};
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw)
    .filter(([port, token]) => /^\d{1,5}$/.test(port) && typeof token === 'string' && /^[0-9a-f]{32,128}$/.test(token)));
}

export function rxTokensLine(dir) {
  return `const RX_TOKENS = ${JSON.stringify(readRxTokens(dir))};`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tokens = readRxTokens();
  if (Object.keys(tokens).length === 0) {
    console.error('rx-tokens: no frame receiver token in .rx-token; start frame-receiver.mjs first, '
      + 'or recording will be refused');
  }
  console.log(rxTokensLine());
}
