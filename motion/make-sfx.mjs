#!/usr/bin/env node
// Synthesises a small, consistent SFX kit with ffmpeg (no samples, no licences to track).
// Usage: node make-sfx.mjs [outDir]   (default motion/sfx; render-motion.mjs runs it on first use)
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'sfx');
mkdirSync(out, { recursive: true });

const PI2 = '2*PI';
const KIT = {
  whoosh: { d: 0.7, src: 'anoisesrc=color=pink:seed=3:amplitude=0.9', fx: 'highpass=f=350,lowpass=f=5200,afade=t=in:d=0.32:curve=qsin,afade=t=out:st=0.32:d=0.38:curve=exp,volume=0.8' },
  swish: { d: 0.32, src: 'anoisesrc=color=white:seed=5:amplitude=0.5', fx: 'highpass=f=2200,lowpass=f=9000,afade=t=in:d=0.1,afade=t=out:st=0.1:d=0.22:curve=exp' },
  click: { d: 0.07, src: `aevalsrc='0.8*exp(-t*95)*sin(${PI2}*1900*t)+0.3*exp(-t*160)*sin(${PI2}*4200*t)'` },
  tick: { d: 0.09, src: `aevalsrc='0.55*exp(-t*70)*sin(${PI2}*3100*t)'` },
  pop: { d: 0.45, src: `aevalsrc='0.9*exp(-t*9)*sin(${PI2}*(180*t+(900/13)*(1-exp(-13*t))))'`, fx: 'lowpass=f=6000' },
  hit: { d: 1.4, src: `aevalsrc='0.95*exp(-t*3.2)*sin(${PI2}*(48*t+(140/9)*(1-exp(-9*t))))+0.25*exp(-t*14)*sin(${PI2}*190*t)'`, fx: 'lowpass=f=3000' },
  sparkle: { d: 1.0, src: `aevalsrc='0.22*exp(-t*6)*sin(${PI2}*2637*t)+0.2*gt(t,0.07)*exp(-(t-0.07)*6)*sin(${PI2}*3136*t)+0.18*gt(t,0.14)*exp(-(t-0.14)*6)*sin(${PI2}*3951*t)+0.15*gt(t,0.21)*exp(-(t-0.21)*7)*sin(${PI2}*5274*t)'`, fx: 'aecho=0.6:0.4:60|110:0.3|0.2' },
  typing: { d: 2.4, src: `aevalsrc='0.45*exp(-mod(t,0.093)*130)*sin(${PI2}*2400*t)*(0.65+0.35*sin(t*41))+0.25*exp(-mod(t+0.041,0.157)*150)*sin(${PI2}*3300*t)'`, fx: 'afade=t=out:st=2.1:d=0.3' },
};

for (const [name, { d, src, fx }] of Object.entries(KIT)) {
  const file = join(out, `${name}.wav`);
  const filter = fx ? `,${fx}` : '';
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-t', String(d), '-i', src, '-af', `aformat=sample_rates=48000:channel_layouts=stereo${filter}`, '-c:a', 'pcm_s16le', file], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`sfx ${name} failed: ${r.stderr}`); process.exit(1); }
  console.log(file);
}
