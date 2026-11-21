// Real-time playback of a timeline with two <video> elements: one shows the current clip while
// the other waits on the next clip's in point, so cuts swap without a gap.
import { serverUrl } from './static-demo';
import { shotAt, sourceTime } from './timeline';
import type { Timeline, TimelineShot } from './types';

export const FPS = 30;
const END_EPSILON = 1 / 60;

type Listener = () => void;

export interface PlayerSnapshot {
  time: number;
  playing: boolean;
  shotId: string | null;
}

export function mediaUrl(path: string): string {
  return serverUrl(`/media/${path.split('/').map(encodeURIComponent).join('/')}`);
}

export class Player {
  private videos: [HTMLVideoElement, HTMLVideoElement];
  private active = 0;
  private timeline: Timeline = { scenes: [], shots: [], total: 0, rateWpm: 165, leadIn: 0.3 };
  private shot: TimelineShot | undefined;
  private frame = 0;
  private cardClock: { wall: number; time: number } | null = null;
  private listeners = new Set<Listener>();
  private snapshot: PlayerSnapshot = { time: 0, playing: false, shotId: null };
  private loop: { start: number; end: number } | null = null;
  private scrubbing = false;
  onFrame: ((video: HTMLVideoElement | null, shot: TimelineShot | undefined) => void) | null = null;

  constructor(a: HTMLVideoElement, b: HTMLVideoElement) {
    this.videos = [a, b];
    for (const v of this.videos) {
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
    }
    this.show();
  }

  // ---------------------------------------------------------------- external store

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private publish(time: number) {
    const next = { time, playing: this.isPlaying, shotId: this.shot?.id ?? null };
    const prev = this.snapshot;
    if (prev.time === next.time && prev.playing === next.playing && prev.shotId === next.shotId) return;
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }

  // ---------------------------------------------------------------- state

  isPlaying = false;

  get time() {
    return this.snapshot.time;
  }

  get current() {
    return this.shot;
  }

  get activeVideo(): HTMLVideoElement {
    return this.videos[this.active];
  }

  setTimeline(timeline: Timeline) {
    this.timeline = timeline;
    const time = Math.min(this.snapshot.time, timeline.total);
    if (this.isPlaying) {
      // Keep playing from the same moment; the edit may have moved the shot under the playhead.
      this.load(time, true);
    } else {
      this.seek(time);
    }
  }

  setLoop(range: { start: number; end: number } | null) {
    this.loop = range;
  }

  // ---------------------------------------------------------------- transport

  play() {
    if (!this.timeline.shots.length) return;
    let time = this.snapshot.time;
    if (time >= this.timeline.total - END_EPSILON) time = this.loop?.start ?? 0;
    this.isPlaying = true;
    this.scrubbing = false;
    this.load(time, true);
    this.tick();
  }

  pause() {
    this.isPlaying = false;
    cancelAnimationFrame(this.frame);
    this.videos.forEach((v) => v.pause());
    this.cardClock = null;
    this.publish(this.snapshot.time);
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  seek(time: number) {
    const clamped = Math.max(0, Math.min(time, this.timeline.total));
    this.load(clamped, this.isPlaying);
    this.publish(clamped);
    this.paint();
  }

  step(frames: number) {
    this.pause();
    this.seek(this.snapshot.time + frames / FPS);
  }

  // Shows one source frame of a shot without moving the playhead, for trim previews.
  scrub(shot: TimelineShot, source: number) {
    if (shot.kind !== 'clip' || !shot.mediaPath) return;
    this.pause();
    this.scrubbing = true;
    const video = this.activeVideo;
    this.assign(video, shot.mediaPath);
    video.currentTime = source;
    this.shot = shot;
    this.show();
    this.paint();
  }

  endScrub() {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    this.seek(this.snapshot.time);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.videos.forEach((v) => {
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- internals

  private assign(video: HTMLVideoElement, path: string) {
    if (video.dataset.path === path) return;
    video.dataset.path = path;
    video.src = mediaUrl(path);
  }

  private load(time: number, playing: boolean) {
    const shot = shotAt(this.timeline, time);
    this.shot = shot;
    if (!shot) {
      this.show();
      return;
    }
    if (shot.kind === 'card') {
      this.videos.forEach((v) => v.pause());
      this.cardClock = playing ? { wall: performance.now(), time } : null;
    } else {
      this.cardClock = null;
      const target = sourceTime(shot, time);
      const standby = this.videos[1 - this.active];
      // The standby element may already hold this clip at its in point.
      if (standby.dataset.path === shot.mediaPath && Math.abs(standby.currentTime - target) < 0.05) {
        this.active = 1 - this.active;
      }
      const video = this.activeVideo;
      this.assign(video, shot.mediaPath ?? '');
      video.playbackRate = shot.speed;
      if (Math.abs(video.currentTime - target) > 0.02) video.currentTime = target;
      if (playing) video.play().catch(() => this.pause());
      else video.pause();
      this.videos[1 - this.active].pause();
    }
    this.show();
    this.preloadAfter(shot);
  }

  private preloadAfter(shot: TimelineShot) {
    const index = this.timeline.shots.indexOf(shot);
    const next = this.timeline.shots.slice(index + 1).find((s) => s.kind === 'clip');
    if (!next?.mediaPath) return;
    const standby = this.videos[1 - this.active];
    this.assign(standby, next.mediaPath);
    if (Math.abs(standby.currentTime - next.in) > 0.02) standby.currentTime = next.in;
  }

  private show() {
    const clip = this.shot?.kind === 'clip';
    this.videos.forEach((v, i) => {
      v.style.visibility = clip && i === this.active ? 'visible' : 'hidden';
    });
  }

  private paint() {
    this.onFrame?.(this.shot?.kind === 'clip' ? this.activeVideo : null, this.shot);
  }

  private currentTime(): number {
    const shot = this.shot;
    if (!shot) return 0;
    if (shot.kind === 'card') {
      if (!this.cardClock) return this.snapshot.time;
      return this.cardClock.time + (performance.now() - this.cardClock.wall) / 1000;
    }
    const video = this.activeVideo;
    return shot.start + (video.currentTime - shot.in) / shot.speed;
  }

  private tick = () => {
    if (!this.isPlaying) return;
    const shot = this.shot;
    let time = this.currentTime();
    if (shot) {
      const shotEnd = shot.start + shot.length;
      const clipDone = shot.kind === 'clip' && (this.activeVideo.currentTime >= shot.out - END_EPSILON || this.activeVideo.ended);
      if (this.loop && time >= this.loop.end - END_EPSILON) {
        time = this.loop.start;
        this.load(time, true);
      } else if (time >= shotEnd - END_EPSILON || clipDone) {
        if (shotEnd >= this.timeline.total - END_EPSILON) {
          this.publish(this.timeline.total);
          this.pause();
          return;
        }
        time = shotEnd;
        this.load(time, true);
      }
    }
    this.publish(Math.min(Math.max(time, shot?.start ?? 0), this.timeline.total));
    this.paint();
    this.frame = requestAnimationFrame(this.tick);
  };
}
