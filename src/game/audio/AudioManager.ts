type SfxOpts = { volume?: number };
type BgmOpts = { loop?: boolean; fadeMs?: number; volume?: number };

export class AudioManager {
  private sfxPool = new Map<string, HTMLAudioElement[]>();
  private bgmRegistry = new Map<string, string>();
  private bgm: HTMLAudioElement | null = null;
  private bgmName: string | null = null;

  private unlocked = false;
  private pendingBgm: (() => void) | null = null;

  masterVolume = 0.8;
  sfxVolume = 1.0;
  bgmVolume = 0.55;
  muted = false;
  private preMuteMaster = 0.8;

  constructor() {
    this.loadSettings();
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      const pending = this.pendingBgm;
      this.pendingBgm = null;
      pending?.();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  registerSfx(name: string, url: string, poolSize = 4): void {
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < poolSize; i++) {
      const a = new Audio(url);
      a.preload = 'auto';
      pool.push(a);
    }
    this.sfxPool.set(name, pool);
  }

  registerBgm(name: string, url: string): void {
    this.bgmRegistry.set(name, url);
  }

  playSfx(name: string, opts: SfxOpts = {}): void {
    const pool = this.sfxPool.get(name);
    if (!pool || pool.length === 0) return;
    const ready = pool.find((a) => a.paused || a.ended) ?? pool[0]!;
    try { ready.currentTime = 0; } catch { /* not seekable yet */ }
    ready.volume = clamp01((opts.volume ?? 1) * this.sfxVolume * this.masterVolume);
    void ready.play().catch(() => { /* autoplay block, swallow */ });
  }

  playBgm(name: string, opts: BgmOpts = {}): void {
    if (this.bgmName === name) return;
    const url = this.bgmRegistry.get(name);
    if (!url) return;

    const start = (): void => {
      const fadeMs = opts.fadeMs ?? 800;
      const target = clamp01((opts.volume ?? 1) * this.bgmVolume * this.masterVolume);

      const next = new Audio(url);
      next.loop = opts.loop ?? true;
      next.volume = 0;
      void next.play().catch(() => { /* still blocked; bail */ });
      this.fadeAudio(next, target, fadeMs);

      if (this.bgm) {
        const old = this.bgm;
        this.fadeAudio(old, 0, fadeMs, () => {
          old.pause();
          old.src = '';
        });
      }
      this.bgm = next;
      this.bgmName = name;
    };

    if (this.unlocked) start();
    else this.pendingBgm = start;
  }

  stopBgm(fadeMs = 600): void {
    if (!this.bgm) return;
    const old = this.bgm;
    this.fadeAudio(old, 0, fadeMs, () => { old.pause(); old.src = ''; });
    this.bgm = null;
    this.bgmName = null;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp01(v);
    if (this.masterVolume > 0) this.preMuteMaster = this.masterVolume;
    this.muted = this.masterVolume === 0;
    if (this.bgm) this.bgm.volume = clamp01(this.bgmVolume * this.masterVolume);
    this.saveSettings();
  }
  setBgmVolume(v: number): void {
    this.bgmVolume = clamp01(v);
    if (this.bgm) this.bgm.volume = clamp01(this.bgmVolume * this.masterVolume);
    this.saveSettings();
  }
  setSfxVolume(v: number): void {
    this.sfxVolume = clamp01(v);
    this.saveSettings();
  }

  toggleMute(): void {
    if (this.muted) {
      this.setMasterVolume(this.preMuteMaster || 0.8);
    } else {
      this.preMuteMaster = this.masterVolume || 0.8;
      this.setMasterVolume(0);
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('claude-shooter:audio', JSON.stringify({
        master: this.masterVolume,
        bgm: this.bgmVolume,
        sfx: this.sfxVolume,
        preMute: this.preMuteMaster,
      }));
    } catch { /* private mode */ }
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem('claude-shooter:audio');
      if (!raw) return;
      const s = JSON.parse(raw) as Partial<{ master: number; bgm: number; sfx: number; preMute: number }>;
      if (typeof s.master === 'number') this.masterVolume = clamp01(s.master);
      if (typeof s.bgm === 'number') this.bgmVolume = clamp01(s.bgm);
      if (typeof s.sfx === 'number') this.sfxVolume = clamp01(s.sfx);
      if (typeof s.preMute === 'number') this.preMuteMaster = clamp01(s.preMute);
      this.muted = this.masterVolume === 0;
    } catch { /* corrupt */ }
  }

  private fadeAudio(audio: HTMLAudioElement, target: number, ms: number, onDone?: () => void): void {
    const start = audio.volume;
    const startTime = performance.now();
    const tick = () => {
      const t = ms <= 0 ? 1 : Math.min(1, (performance.now() - startTime) / ms);
      audio.volume = clamp01(start + (target - start) * t);
      if (t < 1) requestAnimationFrame(tick);
      else onDone?.();
    };
    requestAnimationFrame(tick);
  }
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
