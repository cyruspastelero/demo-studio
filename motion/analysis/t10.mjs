// 10 fps frames around each transition, plus review sheets (one row per transition).
// Usage: node t10.mjs <video> <outDir> <t1> <t2> ...
// Writes <outDir>/<t>/00..09.jpg (480 wide, t-0.5s .. t+0.4s) and <outDir>/sheet-N.jpg
// (8 rows per sheet, 10 frames per row at 240 wide, rows in the order given).
import fs from 'node:fs';
import path from 'node:path';
import { run } from './lib.mjs';

const [video, outDir, ...times] = process.argv.slice(2);
if (!times.length) { console.error('usage: node t10.mjs <video> <outDir> <t1> [t2 ...]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const rows = [];
for (const t of times.map(Number)) {
  const dir = path.join(outDir, t.toFixed(2));
  fs.mkdirSync(dir, { recursive: true });
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.max(0, t - 0.5)), '-i', video, '-t', '1.0',
    '-vf', 'fps=10,scale=480:-2', '-q:v', '5', '-frames:v', '10', path.join(dir, '%02d.jpg')]);
  const row = path.join(dir, 'row.jpg');
  await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '10', '-start_number', '1', '-i', path.join(dir, '%02d.jpg'),
    '-vf', 'scale=240:-2,tile=10x1:padding=2:color=red', '-frames:v', '1', '-q:v', '4', row]);
  rows.push(row);
}
for (let s = 0; s * 8 < rows.length; s++) {
  const part = rows.slice(s * 8, s * 8 + 8);
  const inputs = part.flatMap((r) => ['-i', r]);
  const out = path.join(outDir, `sheet-${s + 1}.jpg`);
  const fc = part.length > 1 ? `vstack=inputs=${part.length}` : 'null';
  await run('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-q:v', '4', out]);
  console.log(`${out}: rows ${part.map((r) => path.basename(path.dirname(r))).join(', ')}`);
}
