// Contact sheet of a time range (ffmpeg has no drawtext here, so frame k is at start + k/fps,
// read left to right, top to bottom).
// Usage: node sheet.mjs <video> <start> <dur> <fps> <cols> <out.jpg> [tileWidth=320]
import { run } from './lib.mjs';

const [video, start, dur, fps, cols, out, tw = '320'] = process.argv.slice(2);
if (!out) { console.error('usage: node sheet.mjs <video> <start> <dur> <fps> <cols> <out.jpg> [tileWidth]'); process.exit(2); }
const count = Math.round(Number(dur) * Number(fps));
const rows = Math.ceil(count / Number(cols));
await run('ffmpeg', ['-v', 'error', '-y', '-ss', start, '-i', video, '-t', dur, '-vf',
  `fps=${fps},scale=${tw}:-2,tile=${cols}x${rows}:padding=4:color=red`, '-frames:v', '1', '-q:v', '4', out]);
console.log(`${out}: ${count} frames, ${cols}x${rows}, frame k at ${start}+k/${fps}s`);
