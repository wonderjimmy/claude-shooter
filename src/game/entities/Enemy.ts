import { STAGE } from '../../config';
import type { Rig } from '../art/Rig';
import type { DrawnKey } from '../art/Sprites';
import type { Game } from '../Game';
import type { Renderer } from '../Renderer';
import { Bullet, type BulletSpec } from './Bullet';

export type EnemyKind = 'cyborg' | 'brain' | 'wasp' | 'mantis' | 'crystal';

/**
 * drift  – fly left, optional sine weave
 * arc    – swoop in from above/below and settle onto a lane
 * dash   – mantis: glide in, raise scythes, lunge at where the player was
 * hover  – crystal: park on the right third, sing (fire), then leave
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
  name: string;
  radius: number;
  hp: number;
  speed: number;
  weaveAmp: number;
  weaveFreq: number;
  score: number;
  motion: Motion;
  fire: FireSpec;
  color: string;
  /** Where shots leave from, in local (facing-left) coordinates. */
  muzzle: [number, number];
}

export const KINDS: Record<EnemyKind, KindSpec> = {
  wasp: {
    name: 'Sting-drone', radius: 20, hp: 1, speed: 3.8, weaveAmp: 40, weaveFreq: 0.10, score: 100, motion: 'drift',
    fire: { bullet: { art: 'projStinger', scale: 0.9, radius: 3 }, speed: 5.5, interval: 140, pattern: 'straight', initialDelay: 80 },
    color: '#a8e85d', muzzle: [-44, 2],
  },
  cyborg: {
    name: 'Bone Warden', radius: 30, hp: 3, speed: 2.0, weaveAmp: 0, weaveFreq: 0, score: 150, motion: 'drift',
    fire: { bullet: { art: 'projBoneShard', scale: 0.9, radius: 4 }, speed: 4.5, interval: 170, pattern: 'aimed', initialDelay: 90 },
    color: '#5dd9e8', muzzle: [-34, -1],
  },
  brain: {
    name: 'Psi Medusa', radius: 32, hp: 2, speed: 1.6, weaveAmp: 90, weaveFreq: 0.04, score: 200, motion: 'drift',
    fire: { bullet: { art: 'projPsi', radius: 5 }, speed: 3.2, interval: 180, pattern: 'spread3', initialDelay: 120 },
    color: '#e85dc9', muzzle: [-20, 11],
  },
  mantis: {
    name: 'Reaper', radius: 30, hp: 2, speed: 2.6, weaveAmp: 20, weaveFreq: 0.06, score: 250, motion: 'dash',
    fire: { bullet: { art: 'projBlade', scale: 0.9, radius: 5 }, speed: 4.0, interval: 150, pattern: 'aimed', initialDelay: 70 },
    color: '#ff8a3d', muzzle: [-52, -2],
  },
  crystal: {
    name: 'Shard Choir', radius: 32, hp: 4, speed: 1.4, weaveAmp: 0, weaveFreq: 0, score: 300, motion: 'hover',
    fire: { bullet: { art: 'projSplinter', scale: 0.9, radius: 3 }, speed: 3.6, interval: 150, pattern: 'shotgun5', initialDelay: 60 },
    color: '#9be7ff', muzzle: [0, 0],
  },
};

export interface EnemyOptions {
  x?: number;
  y: number;
  motion?: Motion;
  elite?: boolean;
  fromY?: number;
  parkX?: number;
  phase?: number;
  speedMul?: number;
}

const ELITE_SCALE = 1.3;
const TELEGRAPH = 22;

export class Enemy {
  x: number;
  y: number;
  dead = false;
  killed = false;
  readonly kind: EnemyKind;
  readonly elite: boolean;
  readonly radius: number;
  readonly score: number;
  hp: number;
  readonly maxHp: number;
  private readonly spec: KindSpec;
  private readonly motion: Motion;
  private readonly speed: number;
  private readonly fireInterval: number;
  private readonly bulletSpeed: number;
  private readonly baseY: number;
  private readonly fromY: number;
  private readonly parkX: number;
  private readonly phase: number;
  private t = Math.random() * 100;
  private age = 0;
  private rot = 0;
  private flash = 0;
  private fireTimer: number;
  private state: 'enter' | 'windup' | 'dash' | 'hold' | 'leave' = 'enter';
  private stateT = 0;
  private dvx = 0;
  private dvy = 0;
  private lastY = 0;
  private vy = 0;
  private scythe = 0;
  private spin = 0;

  constructor(private game: Game, kind: EnemyKind, o: EnemyOptions) {
    const spec = KINDS[kind];
    const m = game.muls;
    this.spec = spec;
    this.kind = kind;
    this.elite = o.elite ?? false;
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
    this.y = this.lastY = this.motion === 'arc' ? this.fromY : o.y;
    this.parkX = o.parkX ?? STAGE.width * 0.72;
    this.phase = o.phase ?? 0;
    this.fireTimer = spec.fire.initialDelay * (0.7 + Math.random() * 0.6);
  }

  get onScreen(): boolean {
    return this.x < STAGE.width - 20 && this.x > 30 && this.y > 10 && this.y < STAGE.height - 10;
  }

  private get canFire(): boolean {
    return this.onScreen && this.state !== 'dash' && this.state !== 'windup';
  }

  /** 0 → 1 while a shot is being telegraphed. */
  private get charge(): number {
    return this.canFire && this.fireTimer < TELEGRAPH ? 1 - Math.max(0, this.fireTimer) / TELEGRAPH : 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.age += dt;
    this.stateT += dt;
    if (this.flash > 0) this.flash -= dt;
    const s = this.spec;

    switch (this.motion) {
      case 'drift':
        this.x -= this.speed * dt;
        if (s.weaveAmp > 0) this.y = this.baseY + Math.sin(this.age * s.weaveFreq + this.phase) * s.weaveAmp;
        break;
      case 'arc': {
        this.x -= this.speed * dt;
        const k = Math.exp(-this.age / 45);
        this.y = this.baseY + (this.fromY - this.baseY) * k;
        if (s.weaveAmp > 0) this.y += Math.sin(this.age * s.weaveFreq + this.phase) * s.weaveAmp * (1 - k) * 0.5;
        break;
      }
      case 'dash': this.updateDash(dt); break;
      case 'hover': this.updateHover(dt); break;
    }

    this.vy = (this.y - this.lastY) / Math.max(dt, 0.001);
    this.lastY = this.y;

    // Body attitude.
    if (this.kind === 'mantis' && this.state === 'dash') {
      const target = Math.atan2(this.dvy, this.dvx) - Math.PI;
      this.rot += (Math.atan2(Math.sin(target), Math.cos(target)) - this.rot) * Math.min(1, 0.3 * dt);
    } else {
      this.rot += (Math.max(-0.35, Math.min(0.35, -this.vy * 0.05)) - this.rot) * Math.min(1, 0.15 * dt);
    }

    // Mantis scythes: fold → raise → strike.
    const scytheTarget = this.state === 'windup' ? 1 : this.state === 'dash' ? -0.6 : 0;
    this.scythe += (scytheTarget - this.scythe) * Math.min(1, (this.state === 'dash' ? 0.5 : 0.12) * dt);
    // Crystal shard orbit speeds up while charging.
    this.spin += (0.02 + this.charge * 0.18) * dt;

    if (this.canFire) {
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
      this.y += Math.sin(this.age * 0.06 + this.phase) * 0.6 * dt;
      if (Math.abs(this.x - this.parkX) < 12 || this.stateT > 120) {
        if (this.onScreen) this.shoot();
        this.state = 'windup';
        this.stateT = 0;
      }
    } else if (this.state === 'windup') {
      this.x += 0.8 * dt;
      if (this.stateT > 42) {
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        const sp = 9.5 * this.game.muls.enemySpeed;
        this.dvx = Math.cos(a) * sp;
        this.dvy = Math.sin(a) * sp;
        this.state = 'dash';
        this.stateT = 0;
        this.game.fx.emit(this.x, this.y, { count: 12, speed: [1, 4], life: [8, 16], size: [3, 6], color: '#ff8a3d' });
        this.game.audio.play('hit', { volume: 0.5, rate: 0.5 });
      }
    } else {
      this.x += this.dvx * dt;
      this.y += this.dvy * dt;
      if (this.stateT % 2 < dt) {
        this.game.fx.emit(this.x - this.dvx * 2, this.y - this.dvy * 2, { count: 2, speed: [0.5, 1.5], life: [10, 18], size: [3, 6], color: '#ff8a3d' });
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

  private muzzle(): [number, number] {
    const [lx, ly] = this.spec.muzzle;
    const k = this.elite ? ELITE_SCALE : 1;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.x + (lx * c - ly * s) * k, this.y + (lx * s + ly * c) * k];
  }

  private shoot(): void {
    const f = this.spec.fire;
    const g = this.game;
    const p = g.player;
    const sp = this.bulletSpeed;
    const [mx, my] = this.muzzle();
    const base = Math.atan2(p.y - my, p.x - mx);
    const fireAt = (a: number) => {
      g.enemyBullets.push(new Bullet(mx, my, Math.cos(a) * sp, Math.sin(a) * sp, f.bullet));
    };
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
        for (const o of [-0.18, 0, 0.18]) fireAt(base + o * (this.elite ? 1.6 : 1));
        if (this.elite) { fireAt(base - 0.5); fireAt(base + 0.5); }
        break;
      case 'shotgun5':
        for (const o of [-0.32, -0.16, 0, 0.16, 0.32]) fireAt(base + o);
        if (this.elite) for (const o of [-0.24, -0.08, 0.08, 0.24]) fireAt(base + o);
        break;
    }
    g.fx.emit(mx, my, { count: 5, speed: [1, 3], life: [6, 12], size: [2, 4], color: this.spec.color });
  }

  get sparkColor(): string { return this.spec.color; }

  /** Parts that fly off when this enemy dies. */
  debris(): Array<[DrawnKey, number, number]> {
    switch (this.kind) {
      case 'wasp': return [['waWing', -10, -10], ['waWing', 0, -6]];
      case 'cyborg': return [['cyRing', 14, -2]];
      case 'brain': return [];
      case 'mantis': return [['maScytheT', -30, -18], ['maScytheB', -30, 14]];
      case 'crystal': return [['crShard', 0, -46], ['crShard', 40, 23], ['crShard', -40, 23]];
    }
  }

  get scale(): number { return this.elite ? ELITE_SCALE : 1; }
  get rotation(): number { return this.rot; }

  // ── drawing ───────────────────────────────────────────────────────────────

  private rig(g: Rig): void {
    const t = this.t;
    g.frame(this.x, this.y, this.rot, this.scale);
    switch (this.kind) {
      case 'wasp': {
        const flap = Math.sin(t * 1.1) * 0.5;
        g.part('waWing', -8, -9, 2.25 + flap, 1, 0.6);
        g.part('waBody', 0, Math.sin(t * 0.3) * 1.2);
        g.part('waWing', -12, -10, 1.9 + flap, 1, 0.9);
        break;
      }
      case 'cyborg':
        g.part('cyRing', 16, -2, t * 0.025);
        g.part('cyBody', 0, Math.sin(t * 0.08) * 1.5);
        break;
      case 'brain': {
        const pulse = 1 + Math.sin(t * 0.12) * 0.03;
        g.part('brBell', 0, -6, Math.sin(t * 0.05) * 0.05, pulse);
        break;
      }
      case 'mantis': {
        // Praying stance at rest; scythes rear up on wind-up and snap forward on the lunge.
        const idle = Math.sin(t * 0.1) * 0.08;
        const sc = this.scythe;
        const up = sc >= 0 ? 0.55 + sc * 0.75 : 0.55 + sc * 1.3;
        const down = sc >= 0 ? 0.35 + sc * 0.6 : 0.35 + sc * 1.1;
        g.part('maScytheB', -22, 4, -down - idle, 1.25, 0.9);
        g.part('maBody', 0, 0);
        g.part('maScytheT', -22, -6, up + idle, 1.3);
        break;
      }
      case 'crystal': {
        const R = 46 - this.charge * 12;
        for (let i = 0; i < 6; i++) {
          const a = this.spin + (i / 6) * Math.PI * 2;
          g.part('crShard', Math.cos(a) * R, Math.sin(a) * R, a + Math.PI / 2, 1);
        }
        g.part('crCore', 0, 0, this.spin * -0.3);
        break;
      }
    }
  }

  /** Brain tentacles are drawn live (they're just curves). */
  private tentacles(r: Renderer): void {
    const ctx = r.ctx;
    const k = this.scale;
    r.resetTransform();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = this.x + (-34 + i * 17) * k;
      const by = this.y + 20 * k;
      const pts: Array<[number, number]> = [[bx, by]];
      for (let j = 1; j <= 7; j++) {
        const wave = Math.sin(this.t * 0.12 - j * 0.7 + i * 1.3) * (3 + j * 1.6);
        pts.push([bx + j * 5.5 * k + wave * 0.4, by + j * 6 * k + wave]);
      }
      for (const [w, color] of [[4.5 * k, '#5a1454'], [1.6 * k, '#ff9aff']] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
  }

  draw(r: Renderer, g: Rig): void {
    if (this.kind === 'brain') this.tentacles(r);
    this.rig(g.begin('solid'));
    if (this.flash > 0) this.rig(g.begin('white', 0.8));
    else if (this.state === 'windup') this.rig(g.begin('white', 0.2 + 0.2 * Math.sin(this.stateT * 0.9)));
  }

  drawGlow(r: Renderer, g: Rig, alpha: number): void {
    if (this.elite) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.15);
      r.dot('#ff3b3b', this.x, this.y, this.radius * 2.2, 0.35 + pulse * 0.25);
    }
    this.rig(g.begin('glow', alpha));
    const c = this.charge;
    if (c > 0) {
      const [mx, my] = this.muzzle();
      r.dot(this.spec.color, mx, my, 6 + c * 16, 0.4 + c * 0.6);
      r.dot('#ffffff', mx, my, 2 + c * 5, c);
    }
  }
}
