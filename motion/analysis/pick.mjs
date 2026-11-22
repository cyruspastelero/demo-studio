// Contact sheet of specific times (for picking measurement frames).
// Usage: node pick.mjs <video> <t1,t2,...> <out.jpg> [cols=4] [tileWidth=480]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './lib.mjs';

const [video, times, out, cols = '4', tw = '480'] = process.argv.slice(2);
if (!out) { console.error('usage: node pick.mjs <video> <t1,t2,...> <out.jpg> [cols] [tileWidth]'); process.exit(2); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pick-'));
const ts = times.split(',');
for (const [i, t] of ts.entries())
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', `scale=${tw}:-2`, '-q:v', '4', path.join(dir, `${String(i).padStart(3, '0')}.jpg`)]);
const rows = Math.ceil(ts.length / Number(cols));
await run('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', `tile=${cols}x${rows}:padding=4:color=red`, '-frames:v', '1', '-q:v', '4', out]);
fs.rmSync(dir, { recursive: true });
console.log(`${out}: ${ts.join(', ')} (${cols} per row)`);
