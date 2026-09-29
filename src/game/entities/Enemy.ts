import { STAGE } from '../../config';
import { art, type Art, type ArtKey } from '../../core/Art';
import type { Game } from '../Game';
import type { Renderer } from '../Renderer';
import { Bullet, type BulletSpec } from './Bullet';

export type EnemyKind = 'cyborg' | 'brain' | 'wasp' | 'mantis' | 'crystal';

/**
 * drift  – fly left, optional sine weave (the original behaviour)
 * arc    – swoop in from above/below and settle onto a lane
 * dash   – mantis: glide in, wind up, then lunge at where the player was
 * hover  – crystal: park on the right third, fire, then leave
 */
export type Motion = 'drift' | 'arc' | 'dash' | 'hover';

interface FireSpec {
  bullet: BulletSpec;
  speed: number;
  interval: number;
  pattern: 'aimed' | 'straight' | 'spread3' | 'shotgun5';
  initialDelay: number;
}

interface KindSpec {
  art: ArtKey;
  radius: number;
  hp: number;
  speed: number;
  weaveAmp: number;
  weaveFreq: number;
  spin: number;
  score: number;
  motion: Motion;
  fire: FireSpec;
  sparkColor: string;
}

export const KINDS: Record<EnemyKind, KindSpec> = {
  cyborg: {
    art: 'enemyCyborg', radius: 28, hp: 3, speed: 2.0, weaveAmp: 0, weaveFreq: 0, spin: 0, score: 150, motion: 'drift',
    fire: { bullet: { art: 'projBoneShard', scale: 0.9, radius: 4 }, speed: 4.5, interval: 170, pattern: 'aimed', initialDelay: 90 },
    sparkColor: '#e6d8b8',
  },
  brain: {
    art: 'enemyBrain', radius: 30, hp: 2, speed: 1.6, weaveAmp: 90, weaveFreq: 0.04, spin: 0.01, score: 200, motion: 'drift',
    fire: { bullet: { art: 'projPsi', radius: 5 }, speed: 3.2, interval: 180, pattern: 'spread3', initialDelay: 120 },
    sparkColor: '#e85dc9',
  },
  wasp: {
    art: 'enemyWasp', radius: 18, hp: 1, speed: 3.8, weaveAmp: 40, weaveFreq: 0.10, spin: 0, score: 100, motion: 'drift',
    fire: { bullet: { art: 'projStinger', scale: 0.9, radius: 3 }, speed: 5.5, interval: 140, pattern: 'straight', initialDelay: 80 },
    sparkColor: '#a8e85d',
  },
  mantis: {
    art: 'enemyMantis', radius: 30, hp: 2, speed: 2.6, weaveAmp: 20, weaveFreq: 0.06, spin: 0, score: 250, motion: 'dash',
    fire: { bullet: { art: 'projBlade', scale: 0.9, radius: 5 }, speed: 4.0, interval: 150, pattern: 'aimed', initialDelay: 70 },
    sparkColor: '#ff8a3d',
  },
  crystal: {
    art: 'enemyCrystal', radius: 28, hp: 4, speed: 1.4, weaveAmp: 0, weaveFreq: 0, spin: 0.02, score: 300, motion: 'hover',
    fire: { bullet: { art: 'projSplinter', scale: 0.9, radius: 3 }, speed: 3.6, interval: 150, pattern: 'shotgun5', initialDelay: 60 },
    sparkColor: '#9be7ff',
  },
};

export interface EnemyOptions {
  x?: number;
  y: number;
  motion?: Motion;
  elite?: boolean;
  /** arc: where the swoop starts vertically (e.g. -60 or STAGE.height + 60). */
  fromY?: number;
  /** dash/hover: where to park horizontally. */
  parkX?: number;
  /** Phase offset for weave, so trains of brains snake together. */
  phase?: number;
  speedMul?: number;
}

const ELITE_SCALE = 1.3;

export class Enemy {
  x: number;
  y: number;
  dead = false;
  /** True when killed by the player (vs flying off-screen). */
  killed = false;
  readonly kind: EnemyKind;
  readonly elite: boolean;
  readonly radius: number;
  readonly score: number;
  hp: number;
  readonly maxHp: number;
  private readonly spec: KindSpec;
  private readonly a: Art;
  private readonly motion: Motion;
  private readonly speed: number;
  private readonly fireInterval: number;
  private readonly bulletSpeed: number;
  private readonly baseY: number;
  private readonly fromY: number;
  private readonly parkX: number;
  private readonly phase: number;
  private t = 0;
  private rot = 0;
  private flash = 0;
  private fireTimer: number;
  private state: 'enter' | 'windup' | 'dash' | 'hold' | 'leave' = 'enter';
  private stateT = 0;
  private dvx = 0;
  private dvy = 0;

  constructor(private game: Game, kind: EnemyKind, o: EnemyOptions) {
    const spec = KINDS[kind];
    const m = game.muls;
    this.spec = spec;
    this.kind = kind;
    this.elite = o.elite ?? false;
    this.a = art(spec.art);
    this.motion = o.motion ?? spec.motion;
    this.speed = spec.speed * m.enemySpeed * (o.speedMul ?? 1);
    this.fireInterval = spec.fire.interval * m.enemyFire * (this.elite ? 0.6 : 1);
    this.bulletSpeed = spec.fire.speed * m.bulletSpeed;
    this.radius = spec.radius * (this.elite ? ELITE_SCALE : 1);
    const hp = spec.hp * m.enemyHp * (this.elite ? 4 : 1);
    this.hp = this.maxHp = Math.max(1, Math.round(hp * 2) / 2);
    this.score = spec.score * (this.elite ? 4 : 1);
    this.x = o.x ?? STAGE.width + 70;
    this.baseY = o.y;
    this.fromY = o.fromY ?? o.y;
    this.y = this.motion === 'arc' ? this.fromY : o.y;
    this.parkX = o.parkX ?? STAGE.width * 0.72;
    this.phase = o.phase ?? 0;
    this.fireTimer = spec.fire.initialDelay * (0.7 + Math.random() * 0.6);
  }

  get onScreen(): boolean {
    return this.x < STAGE.width - 20 && this.x > 30 && this.y > 10 && this.y < STAGE.height - 10;
  }

  update(dt: number): void {
    this.t += dt;
    this.stateT += dt;
    if (this.flash > 0) this.flash -= dt;
    const s = this.spec;

    switch (this.motion) {
      case 'drift':
        this.x -= this.speed * dt;
        if (s.weaveAmp > 0) this.y = this.baseY + Math.sin(this.t * s.weaveFreq + this.phase) * s.weaveAmp;
        break;
      case 'arc': {
        this.x -= this.speed * dt;
        const k = Math.exp(-this.t / 45);
        this.y = this.baseY + (this.fromY - this.baseY) * k;
        if (s.weaveAmp > 0) this.y += Math.sin(this.t * s.weaveFreq + this.phase) * s.weaveAmp * (1 - k) * 0.5;
        break;
      }
      case 'dash':
        this.updateDash(dt);
        break;
      case 'hover':
        this.updateHover(dt);
        break;
    }

    if (s.spin) this.rot += s.spin * dt;
    else if (this.motion === 'dash' && this.state === 'windup') this.rot = Math.sin(this.stateT * 1.3) * 0.08;
    else this.rot = 0;

    // Mantis doesn't shoot mid-lunge; everyone else fires while on-screen.
    if (this.onScreen && this.state !== 'dash' && this.state !== 'windup') {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval;
        this.shoot();
      }
    }

    if (this.x < -120 || this.x > STAGE.width + 200 || this.y < -200 || this.y > STAGE.height + 200) this.dead = true;
  }

  private updateDash(dt: number): void {
    const p = this.game.player;
    if (this.state === 'enter') {
      this.x += (this.parkX - this.x) * Math.min(1, 0.045 * dt);
      this.y += (this.baseY - this.y) * Math.min(1, 0.05 * dt);
      this.y += Math.sin(this.t * 0.06 + this.phase) * 0.6 * dt;
      if (Math.abs(this.x - this.parkX) < 12 || this.stateT > 120) {
        // Fire one volley on arrival, then telegraph the lunge.
        if (this.onScreen) this.shoot();
        this.state = 'windup';
        this.stateT = 0;
      }
    } else if (this.state === 'windup') {
      this.x += 0.8 * dt; // pull back
      if (this.stateT > 42) {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        const sp = 9.5 * this.game.muls.enemySpeed;
        this.dvx = Math.cos(a) * sp;
        this.dvy = Math.sin(a) * sp;
        this.state = 'dash';
        this.stateT = 0;
        this.game.fx.emit(this.x, this.y, { count: 10, speed: [1, 4], life: [8, 16], size: [3, 6], color: '#ff8a3d' });
      }
    } else {
      this.x += this.dvx * dt;
      this.y += this.dvy * dt;
      if (this.stateT % 2 < dt) {
        this.game.fx.emit(this.x + 20, this.y, { count: 2, speed: [0.5, 1.5], life: [10, 18], size: [3, 6], color: '#ff8a3d' });
      }
    }
  }

  private updateHover(dt: number): void {
    if (this.state === 'enter') {
      this.x += (this.parkX - this.x) * Math.min(1, 0.03 * dt);
      if (Math.abs(this.x - this.parkX) < 10) { this.state = 'hold'; this.stateT = 0; }
    } else if (this.state === 'hold') {
      this.y = this.baseY + Math.sin(this.stateT * 0.03) * 22;
      if (this.stateT > 300) { this.state = 'leave'; this.stateT = 0; }
    } else {
      this.x -= Math.min(6, 0.5 + this.stateT * 0.06) * dt;
    }
  }

  /** Returns true if this hit killed it. */
  damage(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash = 4;
    if (this.hp <= 0) {
      this.dead = true;
      this.killed = true;
      return true;
    }
    return false;
  }

  private shoot(): void {
    const f = this.spec.fire;
    const g = this.game;
    const p = g.player;
    const sp = this.bulletSpeed;
    const base = Math.atan2(p.y - this.y, p.x - this.x);
    const fireAt = (a: number) => {
      g.enemyBullets.push(new Bullet(this.x - 10, this.y, Math.cos(a) * sp, Math.sin(a) * sp, f.bullet));
    };
    const spreadMul = this.elite ? 1.6 : 1;
    switch (f.pattern) {
      case 'straight':
        fireAt(Math.PI);
        if (this.elite) { fireAt(Math.PI - 0.2); fireAt(Math.PI + 0.2); }
        break;
      case 'aimed':
        fireAt(base);
        if (this.elite) { fireAt(base - 0.22); fireAt(base + 0.22); }
        break;
      case 'spread3':
        for (const o of [-0.18, 0, 0.18]) fireAt(base + o * spreadMul);
        if (this.elite) { fireAt(base - 0.5); fireAt(base + 0.5); }
        break;
      case 'shotgun5':
        for (const o of [-0.32, -0.16, 0, 0.16, 0.32]) fireAt(base + o);
        if (this.elite) for (const o of [-0.24, -0.08, 0.08, 0.24]) fireAt(base + o);
        break;
    }
  }

  get sparkColor(): string { return this.spec.sparkColor; }

  private get drawScale(): number { return (this.elite ? ELITE_SCALE : 1); }

  draw(r: Renderer): void {
    const s = this.drawScale;
    r.sprite(this.a, this.x, this.y, this.rot, s);
    if (this.flash > 0) r.white(this.a, this.x, this.y, this.rot, s, 0.75);
    else if (this.motion === 'dash' && this.state === 'windup') {
      r.white(this.a, this.x, this.y, this.rot, s, 0.25 + 0.25 * Math.sin(this.stateT * 0.9));
    }
  }

  drawGlow(r: Renderer, alpha: number): void {
    const s = this.drawScale;
    if (this.elite) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.15);
      r.dot('#ff3b3b', this.x, this.y, this.radius * 2.2, 0.35 + pulse * 0.25);
    }
    r.glow(this.a, this.x, this.y, this.rot, s, alpha);
  }
}
