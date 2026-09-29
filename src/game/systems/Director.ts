import { STAGE } from '../../config';
import type { EnemyKind, EnemyOptions } from '../entities/Enemy';
import type { Game } from '../Game';
import type { ThemeName } from '../fx/Scenery';

// Authored formations instead of pure random spawns: each sector is a
// shuffled deck of wave templates that ends on an elite ambush.

type Wave = (d: Director, lvl: number) => number;

const H = STAGE.height;
const lane = (min = 90, max = H - 90) => min + Math.random() * (max - min);

const waves = {
  waspLine: (d, lvl) => {
    const y = lane();
    const n = 5 + Math.min(3, lvl);
    for (let i = 0; i < n; i++) d.at(i * 14, 'wasp', { y });
    return 150;
  },
  waspVee: (d) => {
    const y = lane(200, H - 200);
    for (let i = 0; i < 7; i++) {
      const off = Math.abs(i - 3);
      d.at(0, 'wasp', { y: y + (i - 3) * 40, x: STAGE.width + 70 + off * 46 });
    }
    return 170;
  },
  waspPincer: (d, lvl) => {
    const n = 4 + Math.min(2, lvl);
    for (let i = 0; i < n; i++) {
      d.at(i * 16, 'wasp', { y: 190, motion: 'arc', fromY: -60 });
      d.at(i * 16 + 8, 'wasp', { y: H - 190, motion: 'arc', fromY: H + 60 });
    }
    return 200;
  },
  brainSnake: (d, lvl) => {
    const y = lane(200, H - 200);
    const n = 4 + Math.min(2, lvl);
    for (let i = 0; i < n; i++) d.at(i * 24, 'brain', { y });
    return 230;
  },
  cyborgWall: (d, lvl) => {
    const ys = lvl >= 2 ? [130, 290, 450, 610] : [180, 360, 540];
    ys.forEach((y, i) => d.at(i * 18, 'cyborg', { y: y + (Math.random() - 0.5) * 40 }));
    return 210;
  },
  cyborgPincer: (d) => {
    d.at(0, 'cyborg', { y: 220, motion: 'arc', fromY: -80 });
    d.at(0, 'cyborg', { y: H - 220, motion: 'arc', fromY: H + 80 });
    d.at(40, 'cyborg', { y: 150, motion: 'arc', fromY: -80 });
    d.at(40, 'cyborg', { y: H - 150, motion: 'arc', fromY: H + 80 });
    return 220;
  },
  mantisStrike: (d, lvl) => {
    const n = 2 + (lvl >= 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      d.at(i * 45, 'mantis', { y: lane(120, H - 120), parkX: 860 + Math.random() * 180 });
    }
    return 230;
  },
  crystalTurret: (d, lvl) => {
    d.at(0, 'crystal', { y: lvl >= 2 ? 200 : lane(220, H - 220), parkX: 960 });
    if (lvl >= 2) d.at(30, 'crystal', { y: H - 200, parkX: 1040 });
    if (lvl >= 1) {
      const y = lane();
      for (let i = 0; i < 5; i++) d.at(80 + i * 14, 'wasp', { y });
    }
    return 270;
  },
  mixedAssault: (d, lvl) => {
    d.at(0, 'brain', { y: 220 });
    d.at(0, 'brain', { y: H - 220, phase: Math.PI });
    const y = lane();
    for (let i = 0; i < 4 + lvl; i++) d.at(50 + i * 13, 'wasp', { y });
    if (lvl >= 1) d.at(90, 'mantis', { y: lane(), parkX: 940 });
    return 220;
  },
} satisfies Record<string, Wave>;

type WaveName = keyof typeof waves;

function eliteAmbush(kind: EnemyKind): Wave {
  return (d, lvl) => {
    d.at(0, kind, { y: H / 2 + (Math.random() - 0.5) * 160, elite: true, parkX: 900 });
    for (let i = 0; i < 3 + lvl; i++) {
      d.at(60 + i * 30, 'wasp', { y: 150, motion: 'arc', fromY: -60 });
      d.at(75 + i * 30, 'wasp', { y: H - 150, motion: 'arc', fromY: H + 60 });
    }
    return 330;
  };
}

export interface SectorSpec {
  name: string;
  subtitle: string;
  tint: string;
  theme: ThemeName;
  deck: WaveName[];
  elite: EnemyKind;
}

export const SECTORS: SectorSpec[] = [
  {
    name: 'OUTER HUSK', subtitle: 'the swarm stirs', tint: '#5dd9e8', theme: 'husk', elite: 'cyborg',
    deck: ['waspLine', 'cyborgWall', 'waspVee', 'brainSnake', 'waspPincer', 'mixedAssault', 'waspLine', 'brainSnake', 'cyborgWall'],
  },
  {
    name: 'SINEW DRIFT', subtitle: 'the hunters wake', tint: '#e85dc9', theme: 'sinew', elite: 'crystal',
    deck: ['mantisStrike', 'brainSnake', 'crystalTurret', 'waspPincer', 'mantisStrike', 'cyborgPincer', 'mixedAssault', 'waspVee', 'crystalTurret'],
  },
  {
    name: 'HIVE THROAT', subtitle: 'it knows your name', tint: '#ff5a3d', theme: 'throat', elite: 'mantis',
    deck: ['crystalTurret', 'mantisStrike', 'waspVee', 'brainSnake', 'cyborgPincer', 'mixedAssault', 'mantisStrike', 'waspPincer', 'cyborgWall', 'crystalTurret'],
  },
];

type Phase = 'intro' | 'waves' | 'clear' | 'warning' | 'boss';

interface Scheduled { at: number; kind: EnemyKind; opts: EnemyOptions }

export class Director {
  sector = 0;
  phase: Phase = 'intro';
  private t = 0;
  private phaseT = 0;
  private waveT = 0;
  private waveLen = 0;
  private deck: Wave[] = [];
  private queue: Scheduled[] = [];
  private fillerT = 0;
  private waveStart = 0;

  constructor(private game: Game) {}

  get lvl(): number { return this.sector + (this.game.loop - 1) * 1.5; }
  get spec(): SectorSpec { return SECTORS[this.sector]!; }
  get wavesLeft(): number { return this.deck.length; }

  start(): void {
    this.sector = 0;
    this.enter('intro');
  }

  /** Schedule a spawn relative to the start of the current wave. */
  at(delay: number, kind: EnemyKind, opts: EnemyOptions): void {
    this.queue.push({ at: this.waveStart + delay, kind, opts });
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const g = this.game;
    switch (p) {
      case 'intro':
        g.background.setTheme(this.spec.theme);
        g.background.setWarp(4);
        g.hud.banner(`SECTOR ${this.sector + 1}`, this.spec.name, this.spec.subtitle, this.spec.tint);
        break;
      case 'waves': {
        g.background.setWarp(1);
        const shuffled = [...this.spec.deck].sort(() => Math.random() - 0.5);
        this.deck = [...shuffled.map((n) => waves[n] as Wave), eliteAmbush(this.spec.elite)];
        this.waveT = 0;
        this.waveLen = 0;
        break;
      }
      case 'clear':
        g.onSectorClear(this.sector);
        break;
      case 'warning':
        g.background.setTheme('heart');
        g.hud.warning();
        g.audio.synth('warn');
        g.audio.preloadMusic('boss');
        g.audio.music(null, 1500);
        g.audio.muffle(380, 2.6);
        break;
      case 'boss':
        g.spawnBoss();
        break;
    }
  }

  skipToBoss(): void {
    this.queue.length = 0;
    this.deck.length = 0;
    this.sector = SECTORS.length - 1;
    this.enter('warning');
  }

  skipSector(): void {
    this.queue.length = 0;
    this.deck.length = 0;
    this.enter('clear');
  }

  update(dt: number): void {
    this.t += dt;
    this.phaseT += dt;
    const g = this.game;

    // Release scheduled spawns.
    if (this.queue.length) {
      let w = 0;
      for (const s of this.queue) {
        if (s.at <= this.t) g.spawnEnemy(s.kind, s.opts);
        else this.queue[w++] = s;
      }
      this.queue.length = w;
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 150) this.enter('waves');
        break;
      case 'waves': {
        this.waveT += dt;
        const quiet = this.queue.length === 0 && g.enemies.length === 0;
        const ready = this.waveT >= this.waveLen || (quiet && this.waveT > 45);
        if (ready) {
          const next = this.deck.shift();
          if (next) {
            this.waveStart = this.t;
            this.waveLen = next(this, this.lvl) * g.muls.waveGap;
            this.waveT = 0;
          } else if (quiet) {
            this.enter('clear');
          }
        }
        // A trickle of stragglers keeps the gaps between formations alive.
        if (this.sector > 0 || g.loop > 1) {
          this.fillerT -= dt;
          if (this.fillerT <= 0) {
            this.fillerT = (280 - 60 * Math.min(3, this.lvl)) * g.muls.waveGap;
            this.waveStartKeep(() => this.at(0, Math.random() < 0.7 ? 'wasp' : 'brain', { y: lane() }));
          }
        }
        break;
      }
      case 'clear':
        if (this.phaseT > 170) {
          if (this.sector < SECTORS.length - 1) {
            this.sector++;
            this.enter('intro');
          } else {
            this.enter('warning');
          }
        }
        break;
      case 'warning':
        if (this.phaseT > 190) this.enter('boss');
        break;
      case 'boss':
        break;
    }
  }

  private waveStartKeep(fn: () => void): void {
    const saved = this.waveStart;
    this.waveStart = this.t;
    fn();
    this.waveStart = saved;
  }
}
