import { STAGE } from '../../config';
import { art, type Art, type ArtKey } from '../../core/Art';
import type { Game } from '../Game';
import type { Renderer } from '../Renderer';
import { Bullet, type BulletSpec } from './Bullet';

export type BossStage = 1 | 2 | 3;

interface PhaseSpec {
  art: ArtKey;
  hp: number;
  radius: number;
  fireInterval: number;
  pattern: 'spread' | 'burst' | 'hell';
}

export const BOSS_PHASES: Record<BossStage, PhaseSpec> = {
  // HP is ~2.5× the Pixi build's because the player now has power levels 1–4.
  1: { art: 'bossStage1', hp: 150, radius: 210, fireInterval: 80, pattern: 'spread' },
  2: { art: 'bossStage2', hp: 130, radius: 195, fireInterval: 110, pattern: 'burst' },
  3: { art: 'bossStage3', hp: 140, radius: 175, fireInterval: 34, pattern: 'hell' },
};

const ORB: BulletSpec = { art: 'projBoss', radius: 6 };
const ORB_SMALL: BulletSpec = { art: 'projBoss', scale: 0.8, radius: 5 };
const ORB_PINK: BulletSpec = { art: 'projBossPink', radius: 6 };

const BURST_SHOTS = 4;
const BURST_GAP = 6;
const BURST_OFFSET = 90;
const LASER_COOLDOWN = 220;
const LASER_CHARGE = 60;
const LASER_FIRE = 50;
const LASER_LENGTH = STAGE.width * 1.6;
const LASER_HALF = 22;
const ENTRY_FRAMES = 110;
const TRANSITION_FRAMES = 70;

export class Boss {
  x = STAGE.width + 420;
  y = STAGE.height / 2;
  dead = false;
  stage: BossStage = 1;
  hp: number;
  radius: number;
  /** Frames of invulnerability left (entry + phase transitions). */
  shielded = ENTRY_FRAMES;

  private spec: PhaseSpec;
  private a: Art;
  private t = 0;
  private fireTimer = 60;
  private volley = 0;
  private flash = 0;
  private entry = ENTRY_FRAMES;
  private readonly startX = STAGE.width + 420;
  private readonly cx = STAGE.width - 320;
  private readonly cy = STAGE.height / 2;
  private burstLeft = 0;
  private burstTimer = 0;
  private spiral = 0;
  private spiralTimer = 0;

  private laser: 'idle' | 'charge' | 'fire' = 'idle';
  private laserTimer = 0;
  private laserCooldown: number;
  private laserAngle = 0;
  private laserX = 0;
  private laserY = 0;

  constructor(private game: Game) {
    this.spec = this.scaled(1);
    this.hp = this.spec.hp;
    this.radius = this.spec.radius;
    this.a = art(this.spec.art);
    this.laserCooldown = (LASER_COOLDOWN + 60) * game.muls.bossFire;
  }

  private scaled(stage: BossStage): PhaseSpec {
    const base = BOSS_PHASES[stage];
    const m = this.game.muls;
    return { ...base, hp: Math.ceil(base.hp * m.bossHp), fireInterval: base.fireInterval * m.bossFire };
  }

  get maxHp(): number { return this.spec.hp; }

  get totalMaxHp(): number {
    const m = this.game.muls.bossHp;
    return ([1, 2, 3] as BossStage[]).reduce((s, st) => s + Math.ceil(BOSS_PHASES[st].hp * m), 0);
  }

  get totalHp(): number {
    const m = this.game.muls.bossHp;
    let rest = Math.max(0, this.hp);
    for (let s = this.stage + 1; s <= 3; s++) rest += Math.ceil(BOSS_PHASES[s as BossStage].hp * m);
    return rest;
  }

  /** Phase boundaries as fractions of the total bar, for HUD notches. */
  get phaseMarks(): number[] {
    const m = this.game.muls.bossHp;
    const total = this.totalMaxHp;
    const p3 = Math.ceil(BOSS_PHASES[3].hp * m);
    const p2 = Math.ceil(BOSS_PHASES[2].hp * m);
    return [p3 / total, (p3 + p2) / total];
  }

  get entering(): boolean { return this.entry > 0; }

  update(dt: number): void {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.dead) {
      // Death throes: shudder in place while the outro plays.
      this.x = this.cx + (Math.random() - 0.5) * 14;
      this.y = this.cy + (Math.random() - 0.5) * 14;
      this.flash = 2;
      return;
    }
    if (this.shielded > 0) this.shielded -= dt;

    if (this.entry > 0) {
      this.entry -= dt;
      const k = 1 - Math.max(0, this.entry) / ENTRY_FRAMES;
      this.x = this.startX + (this.cx - this.startX) * (1 - Math.pow(1 - k, 3));
      return;
    }

    const wobble = this.stage === 3 ? 1.6 : 1;
    this.y = this.cy + Math.sin(this.t * 0.03) * 40 * wobble;
    this.x = this.cx + Math.cos(this.t * 0.022) * 20 * wobble;

    if (this.shielded > 0) return; // mid-transition: no attacks

    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.fireBurstShot();
        this.burstLeft -= 1;
        this.burstTimer = BURST_GAP;
      }
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.burstLeft === 0) {
      this.fireTimer = this.spec.fireInterval * (this.desperate ? 1.4 : 1);
      this.volley++;
      if (this.spec.pattern === 'burst') {
        this.burstLeft = BURST_SHOTS;
        this.burstTimer = 0;
      } else {
        this.fire();
      }
    }

    if (this.desperate) {
      this.spiralTimer -= dt;
      if (this.spiralTimer <= 0) {
        this.spiralTimer = 7 * this.game.muls.bossFire;
        this.spiral += 0.37;
        const sp = 3.1 * this.game.muls.bulletSpeed;
        for (const off of [0, Math.PI]) {
          const a = this.spiral + off;
          this.emit(this.x, this.y, a, sp, ORB_PINK);
        }
      }
    }

    this.updateLaser(dt);
  }

  private get desperate(): boolean {
    return this.stage === 3 && this.hp < this.spec.hp * 0.4;
  }

  private emit(x: number, y: number, a: number, sp: number, spec: BulletSpec): void {
    this.game.enemyBullets.push(new Bullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, spec));
  }

  private aimFrom(x: number, y: number): number {
    const p = this.game.player;
    return Math.atan2(p.y - y, p.x - x);
  }

  private fire(): void {
    const bs = this.game.muls.bulletSpeed;
    switch (this.spec.pattern) {
      case 'spread': {
        for (let i = -2; i <= 2; i++) this.emit(this.x - 60, this.y, Math.PI + i * 0.18, 4 * bs, ORB);
        if (this.volley % 3 === 0) {
          const aim = this.aimFrom(this.x - 60, this.y);
          for (const o of [-0.12, 0, 0.12]) this.emit(this.x - 60, this.y, aim + o, 5.5 * bs, ORB_PINK);
        }
        break;
      }
      case 'hell': {
        const count = this.desperate ? 8 : 10;
        const phase = this.t * 0.04;
        for (let i = 0; i < count; i++) {
          this.emit(this.x, this.y, (i / count) * Math.PI * 2 + phase, 4 * bs, ORB_SMALL);
        }
        this.emit(this.x, this.y, this.aimFrom(this.x, this.y), 6 * bs, { ...ORB, scale: 1.1, radius: 7 });
        break;
      }
      case 'burst':
        break;
    }
    this.game.audio.play('hit', { volume: 0.4, rate: 0.6 });
  }

  private fireBurstShot(): void {
    const ey = this.y + (this.burstLeft % 2 === 0 ? -BURST_OFFSET : BURST_OFFSET);
    this.emit(this.x, ey, this.aimFrom(this.x, ey), 6 * this.game.muls.bulletSpeed, ORB_PINK);
  }

  private updateLaser(dt: number): void {
    if (this.stage !== 2) { this.laser = 'idle'; return; }
    const p = this.game.player;
    if (this.laser === 'idle') {
      this.laserCooldown -= dt;
      if (this.laserCooldown <= 0) { this.laser = 'charge'; this.laserTimer = LASER_CHARGE; }
    } else if (this.laser === 'charge') {
      this.laserTimer -= dt;
      this.laserX = this.x - 40;
      this.laserY = this.y;
      // Stop tracking for the last 12 frames so the dodge window is honest.
      if (this.laserTimer > 12) this.laserAngle = Math.atan2(p.y - this.laserY, p.x - this.laserX);
      if (this.laserTimer <= 0) {
        this.laser = 'fire';
        this.laserTimer = LASER_FIRE;
        this.game.shake.add(0.35);
        this.game.audio.play('bossPhase', { volume: 0.6, rate: 1.4 });
      }
    } else {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laser = 'idle';
        this.laserCooldown = LASER_COOLDOWN * this.game.muls.bossFire;
      }
    }
  }

  laserHits(px: number, py: number, pr: number): boolean {
    if (this.laser !== 'fire') return false;
    const dx = px - this.laserX, dy = py - this.laserY;
    const c = Math.cos(-this.laserAngle), s = Math.sin(-this.laserAngle);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    return rx > -20 && rx < LASER_LENGTH && Math.abs(ry) < LASER_HALF + pr;
  }

  /** Returns 'phase' when a phase breaks, 'dead' on the final blow. */
  damage(amount: number): 'none' | 'hit' | 'phase' | 'dead' {
    if (this.shielded > 0 || this.dead) return 'none';
    this.hp -= amount;
    this.flash = 3;
    if (this.hp > 0) return 'hit';
    if (this.stage < 3) {
      this.advance();
      return 'phase';
    }
    this.dead = true;
    return 'dead';
  }

  private advance(): void {
    this.stage = (this.stage + 1) as BossStage;
    this.spec = this.scaled(this.stage);
    this.hp = this.spec.hp;
    this.radius = this.spec.radius;
    this.a = art(this.spec.art);
    this.fireTimer = 40;
    this.burstLeft = 0;
    this.laser = 'idle';
    this.laserCooldown = (LASER_COOLDOWN + 60) * this.game.muls.bossFire;
    this.shielded = TRANSITION_FRAMES;
    this.game.onBossPhase(this.x, this.y);
  }

  draw(r: Renderer): void {
    const rot = Math.sin(this.t * 0.015) * 0.04;
    r.sprite(this.a, this.x, this.y, rot);
    if (this.flash > 0) r.white(this.a, this.x, this.y, rot, 1, 0.45);
    if (this.shielded > 0 && this.entry <= 0) {
      r.white(this.a, this.x, this.y, rot, 1, 0.15 + 0.15 * Math.sin(this.t * 0.8));
    }
  }

  drawGlow(r: Renderer): void {
    const rot = Math.sin(this.t * 0.015) * 0.04;
    const heartbeat = 0.45 + 0.2 * Math.max(0, Math.sin(this.t * (this.desperate ? 0.2 : 0.1)));
    r.glow(this.a, this.x, this.y, rot, 1, heartbeat);
    if (this.laser !== 'idle') this.drawBeam(r);
  }

  private drawBeam(r: Renderer): void {
    const ctx = r.ctx;
    const charging = this.laser === 'charge';
    r.resetTransform();
    ctx.translate(this.laserX, this.laserY);
    ctx.rotate(this.laserAngle);
    const half = charging ? 1.5 + (1 - this.laserTimer / LASER_CHARGE) * 2 : LASER_HALF * Math.min(1, (LASER_FIRE - this.laserTimer) / 4 + 0.3);
    if (charging) {
      const locked = this.laserTimer <= 12;
      ctx.globalAlpha = locked ? 0.9 : 0.4 + Math.sin(this.t * 0.6) * 0.25;
      ctx.fillStyle = locked ? '#ffffff' : '#ff6b6b';
      ctx.fillRect(0, -half, LASER_LENGTH, half * 2);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(0, -half * 5, LASER_LENGTH, half * 10);
    } else {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(-20, -half * 2.4, LASER_LENGTH, half * 4.8);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#ffb0b0';
      ctx.fillRect(-20, -half, LASER_LENGTH, half * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-20, -half * 0.4, LASER_LENGTH, half * 0.8);
    }
    ctx.globalAlpha = 1;
    r.dot('#ff6b6b', this.laserX, this.laserY, charging ? 30 : 60, 0.9);
  }
}
