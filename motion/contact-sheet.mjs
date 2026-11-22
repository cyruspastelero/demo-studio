#!/usr/bin/env node
// Contact sheet of a rendered video for review: node contact-sheet.mjs <video> [--fps 4] [--cols 8] [--width 320] [--out sheet.jpg]
// Tiles run left to right, top to bottom, one every 1/fps seconds.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const video = args[0];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : def; };
if (!video) { console.error('usage: node contact-sheet.mjs <video> [--fps 4] [--cols 8] [--width 320] [--out sheet.jpg] [--from s] [--to s]'); process.exit(2); }
const fps = Number(opt('fps', 4)), cols = Number(opt('cols', 8)), width = Number(opt('width', 320));
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
const from = Number(opt('from', 0)), to = Number(opt('to', Number(probe.stdout.trim())));
const tiles = Math.ceil((to - from) * fps);
const rows = Math.ceil(tiles / cols);
const out = opt('out', video.replace(/\.mp4$/, `.sheet-${fps}fps.jpg`));
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(from), '-t', String(to - from), '-i', video, '-vf', `fps=${fps},scale=${width}:-1,tile=${cols}x${rows}:padding=3:color=0xff0000`, '-frames:v', '1', '-q:v', '3', out], { encoding: 'utf8' });
if (r.status !== 0) { console.error(`contact sheet failed: ${r.stderr}`); process.exit(1); }
console.log(out);
