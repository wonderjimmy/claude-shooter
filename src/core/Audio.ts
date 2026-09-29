// WebAudio mixer. SFX are decoded buffers (zero-latency, unlimited overlap);
// BGM streams through <audio> elements routed into a GainNode so fades and
// volume work on iOS, where HTMLMediaElement.volume is read-only.
//
// The BGM files in assets/audio/web/ are mastered for the game: loudness-
// matched to -16 LUFS and baked into seamless loops (song tail cross-faded
// into its head), so <audio loop> never hits a gap or an abrupt restart.
// The music bus runs through a low-pass filter the game sweeps for mood:
// muffled on the title and pause screens, a dip when you're hit, a tape-stop
// pitch drop in slow motion.

import bgmNormalUrl from '../../assets/audio/web/bgm-normal.mp3';
import bgmBossUrl from '../../assets/audio/web/bgm-boss.mp3';
import bgmVictoryUrl from '../../assets/audio/web/bgm-victory.mp3';
import sfxShootUrl from '../../assets/audio/sfx-shoot.mp3';
import sfxHitUrl from '../../assets/audio/sfx-hit.mp3';
import sfxExplodeUrl from '../../assets/audio/sfx-explode.mp3';
import sfxDamageUrl from '../../assets/audio/sfx-damage.mp3';
import sfxBossRoarUrl from '../../assets/audio/sfx-boss-roar.mp3';
import sfxBossPhaseUrl from '../../assets/audio/sfx-boss-phase.mp3';
import sfxBossExplodeUrl from '../../assets/audio/sfx-boss-explode.mp3';
import { loadJson, save } from './Storage';

const SAMPLES = {
  shoot: { url: sfxShootUrl, gap: 45, maxDur: 0.34, volume: 0.45 },
  hit: { url: sfxHitUrl, gap: 35, maxDur: 0.3, volume: 0.6 },
  explode: { url: sfxExplodeUrl, gap: 40, maxDur: 1.6, volume: 0.8 },
  damage: { url: sfxDamageUrl, gap: 100, maxDur: 2.2, volume: 1 },
  bossRoar: { url: sfxBossRoarUrl, gap: 500, maxDur: 6.6, volume: 1 },
  bossPhase: { url: sfxBossPhaseUrl, gap: 300, maxDur: 1.4, volume: 1 },
  bossExplode: { url: sfxBossExplodeUrl, gap: 200, maxDur: 4.2, volume: 1 },
} as const;

const MUSIC = {
  normal: bgmNormalUrl,
  boss: bgmBossUrl,
  victory: bgmVictoryUrl,
} as const;

export type SampleName = keyof typeof SAMPLES;
export type SynthName = 'pickup' | 'power' | 'graze' | 'bomb' | 'ui' | 'warn' | 'chain' | 'extend' | 'heartbeat' | 'ring';
export type MusicName = keyof typeof MUSIC;

export interface AudioSettings { master: number; music: number; sfx: number; muted: boolean }

interface Track { el: HTMLAudioElement; gain: GainNode | null; node: MediaElementAudioSourceNode | null }

export class AudioSystem {
  settings: AudioSettings = loadJson<AudioSettings>('audio3', { master: 0.85, music: 0.8, sfx: 0.9, muted: false });

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private buffers = new Map<SampleName, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private tracks = new Map<MusicName, Track>();
  private current: MusicName | null = null;
  private unlocked = false;
  private noise: AudioBuffer | null = null;

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.duck = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.tone.Q.value = 0.9;
    this.musicBus.connect(this.tone).connect(this.duck).connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    this.applyVolumes();

    for (const [name, url] of Object.entries(MUSIC) as Array<[MusicName, string]>) {
      const el = new Audio();
      el.src = url;
      el.preload = name === 'normal' ? 'auto' : 'none';
      el.crossOrigin = 'anonymous';
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      // Let playbackRate bend pitch (tape-stop effect in slow motion).
      const pp = el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
      pp.preservesPitch = false;
      pp.webkitPreservesPitch = false;
      pp.mozPreservesPitch = false;
      el.loop = name !== 'victory';
      let node: MediaElementAudioSourceNode | null = null;
      let gain: GainNode | null = null;
      try {
        node = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = 0;
        node.connect(gain).connect(this.musicBus);
      } catch {
        node = null;
        gain = null;
      }
      this.tracks.set(name, { el, gain, node });
    }

    this.loadSamples();

    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    }
  }

  get available(): boolean { return this.ctx !== null; }

  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all((Object.entries(SAMPLES) as Array<[SampleName, { url: string }]>).map(async ([name, s]) => {
      try {
        const res = await fetch(s.url);
        const bytes = await res.arrayBuffer();
        const buf = await new Promise<AudioBuffer>((resolve, reject) => {
          // Callback form for older Safari.
          const p = ctx.decodeAudioData(bytes, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
        this.buffers.set(name, buf);
      } catch (err) {
        console.warn('[audio] failed to load', name, err);
      }
    }));
  }

  /** Must run inside a user gesture at least once (autoplay policy, iOS). */
  unlock(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    if (this.unlocked) return;
    this.unlocked = true;
    // Prime every <audio> inside the gesture so later play() calls outside a gesture succeed on iOS.
    for (const [name, t] of this.tracks) {
      if (name === this.current) continue;
      const p = t.el.play();
      if (p) p.then(() => { if (this.current !== name) t.el.pause(); }).catch(() => {});
    }
    if (this.current) this.startTrack(this.current, 600);
  }

  play(name: SampleName, opts: { volume?: number; rate?: number } = {}): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || !this.sfxBus || ctx.state !== 'running') return;
    const spec = SAMPLES[name];
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < spec.gap) return;
    this.lastPlayed.set(name, now);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    const vol = spec.volume * (opts.volume ?? 1);
    const t0 = ctx.currentTime;
    const dur = Math.min(buf.duration, spec.maxDur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.setValueAtTime(vol, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(g).connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  synth(name: SynthName): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || ctx.state !== 'running') return;
    const now = performance.now();
    const gaps: Record<SynthName, number> = { pickup: 40, power: 80, graze: 55, bomb: 200, ui: 30, warn: 400, chain: 60, extend: 200, heartbeat: 300, ring: 400 };
    if (now - (this.lastPlayed.get(name) ?? -1e9) < gaps[name]) return;
    this.lastPlayed.set(name, now);

    const t = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + start + dur);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(vol, t + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(bus);
      o.start(t + start);
      o.stop(t + start + dur + 0.02);
    };

    switch (name) {
      case 'pickup':
        tone(880, 0, 0.09, 'square', 0.08);
        tone(1320, 0.06, 0.12, 'square', 0.08);
        break;
      case 'power':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.05, 0.14, 'sawtooth', 0.07));
        break;
      case 'extend':
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.2, 'triangle', 0.14));
        break;
      case 'graze':
        tone(2400, 0, 0.035, 'triangle', 0.05, 3200);
        break;
      case 'chain':
        tone(1200, 0, 0.06, 'sine', 0.07, 1800);
        break;
      case 'ui':
        tone(660, 0, 0.05, 'square', 0.05, 990);
        break;
      case 'warn':
        for (let i = 0; i < 3; i++) {
          tone(440, i * 0.55, 0.45, 'sawtooth', 0.09, 880);
        }
        break;
      case 'heartbeat':
        tone(62, 0, 0.16, 'sine', 0.5, 40);
        tone(58, 0.2, 0.2, 'sine', 0.38, 36);
        break;
      case 'ring':
        tone(3520, 0, 0.9, 'sine', 0.025);
        break;
      case 'bomb': {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer(ctx);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(6000, t);
        f.frequency.exponentialRampToValueAtTime(120, t + 1.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        src.connect(f).connect(g).connect(bus);
        src.start(t);
        src.stop(t + 1.25);
        tone(90, 0, 0.8, 'sine', 0.35, 30);
        break;
      }
    }
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 1.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  music(name: MusicName | null, fadeMs = 800): void {
    if (name === this.current) return;
    const prev = this.current;
    this.current = name;
    if (prev) this.stopTrack(prev, fadeMs);
    if (name && this.unlocked) this.startTrack(name, fadeMs);
  }

  preloadMusic(name: MusicName): void {
    const t = this.tracks.get(name);
    if (t && t.el.preload !== 'auto') {
      t.el.preload = 'auto';
      t.el.load();
    }
  }

  private startTrack(name: MusicName, fadeMs: number): void {
    const t = this.tracks.get(name);
    const ctx = this.ctx;
    if (!t || !ctx) return;
    try { t.el.currentTime = 0; } catch { /* not seekable yet */ }
    void t.el.play().catch(() => {});
    if (t.gain) {
      const g = t.gain.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(1, ctx.currentTime + fadeMs / 1000);
    } else {
      t.el.volume = this.settings.muted ? 0 : this.settings.master * this.settings.music;
    }
  }

  private stopTrack(name: MusicName, fadeMs: number): void {
    const t = this.tracks.get(name);
    const ctx = this.ctx;
    if (!t || !ctx) return;
    if (t.gain) {
      const g = t.gain.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
    }
    window.setTimeout(() => { if (this.current !== name) t.el.pause(); }, fadeMs + 50);
  }

  /**
   * Sweep the music low-pass. `hz` ≥ 18000 means fully open.
   * Pass `thenHz` to bounce back after the sweep (hit / sector transitions).
   */
  muffle(hz: number, seconds = 0.4, thenHz?: number, holdSeconds = 0.15): void {
    const ctx = this.ctx;
    if (!ctx || !this.tone) return;
    const f = this.tone.frequency;
    const t = ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(40, f.value), t);
    f.exponentialRampToValueAtTime(Math.max(40, hz), t + Math.max(0.01, seconds));
    if (thenHz !== undefined) {
      f.setValueAtTime(Math.max(40, hz), t + seconds + holdSeconds);
      f.exponentialRampToValueAtTime(Math.max(40, thenHz), t + seconds + holdSeconds + 0.9);
    }
  }

  /** Playback rate of the current track (pitch follows — tape-stop / slow-mo). */
  musicRate(rate: number): void {
    for (const t of this.tracks.values()) {
      try { t.el.playbackRate = rate; } catch { /* some browsers clamp */ }
    }
  }

  /** Lower the music while paused / in menus. */
  setDucked(ducked: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.duck) return;
    const g = this.duck.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(ducked ? 0.35 : 1, ctx.currentTime + 0.25);
  }

  set(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    save('audio3', this.settings);
    this.applyVolumes();
  }

  toggleMute(): void { this.set({ muted: !this.settings.muted }); }

  private applyVolumes(): void {
    const s = this.settings;
    if (this.master) this.master.gain.value = s.muted ? 0 : s.master;
    if (this.musicBus) this.musicBus.gain.value = s.music;
    if (this.sfxBus) this.sfxBus.gain.value = s.sfx;
    for (const t of this.tracks.values()) {
      if (!t.gain) t.el.volume = s.muted ? 0 : s.master * s.music;
    }
  }
}
