import { Graphics, Sprite } from 'pixi.js';
import { Entity } from './Entity';
import { Bullet } from './Bullet';
import type { Game } from '../Game';
import { STAGE } from '../../config';
import { tex, type SpriteKey } from '../assets/sprites';

export type BossStage = 1 | 2 | 3;

interface PhaseSpec {
  sprite: SpriteKey;
  hp: number;
  scale: number;
  radius: number;
  fireInterval: number;
  pattern: 'spread' | 'burst' | 'hell';
}

const PHASES: Record<BossStage, PhaseSpec> = {
  1: { sprite: 'bossStage1', hp: 60, scale: 1.6, radius: 220, fireInterval: 80, pattern: 'spread' },
  2: { sprite: 'bossStage2', hp: 50, scale: 1.9, radius: 200, fireInterval: 110, pattern: 'burst' },
  3: { sprite: 'bossStage3', hp: 50, scale: 2.1, radius: 180, fireInterval: 32, pattern: 'hell' },
};

const BURST_SHOTS = 4;
const BURST_GAP = 6;
const BURST_EMITTER_OFFSET = 90;

const LASER_COOLDOWN = 220;
const LASER_CHARGE = 60;
const LASER_FIRE = 50;
const LASER_LENGTH = STAGE.width * 1.6;
const LASER_HALF_WIDTH = 22;

const ENTRY_FRAMES = 90;

export class Boss extends Entity {
  radius: number;
  hp: number;
  maxHp: number;
  stage: BossStage = 1;

  private spec: PhaseSpec;
  private sprite: Sprite;
  private t = 0;
  private fireTimer = 0;
  private centerX: number;
  private centerY: number;
  private flashTimer = 0;
  private entryTimer = ENTRY_FRAMES;
  private startX: number;
  private burstShotsLeft = 0;
  private burstTimer = 0;

  private laserState: 'idle' | 'charge' | 'fire' = 'idle';
  private laserTimer = 0;
  private laserCooldown = LASER_COOLDOWN + 60;
  private laserAngle = 0;
  private laserOriginX = 0;
  private laserOriginY = 0;
  private beam: Graphics;

  constructor(game: Game) {
    super(game);
    this.spec = this.scaledPhase(1);
    this.hp = this.spec.hp;
    this.maxHp = this.spec.hp;
    this.radius = this.spec.radius;
    this.laserCooldown = (LASER_COOLDOWN + 60) * game.muls.bossFire;

    this.centerX = STAGE.width - 320;
    this.centerY = STAGE.height / 2;
    this.startX = STAGE.width + 400;
    this.x = this.startX;
    this.y = this.centerY;

    this.sprite = new Sprite(tex(this.spec.sprite));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(this.spec.scale);
    this.view.addChild(this.sprite);

    this.beam = new Graphics();
    this.beam.visible = false;
    game.layers.fx.addChild(this.beam);
  }

  override destroy(): void {
    if (!this.beam.destroyed) this.beam.destroy();
    super.destroy();
  }

  get totalMaxHp(): number {
    const m = this.game.muls.bossHp;
    return Math.ceil(PHASES[1].hp * m) + Math.ceil(PHASES[2].hp * m) + Math.ceil(PHASES[3].hp * m);
  }
  get totalHp(): number {
    const m = this.game.muls.bossHp;
    let remaining = this.hp;
    for (let s = (this.stage + 1) as BossStage; s <= 3; s = (s + 1) as BossStage) {
      remaining += Math.ceil(PHASES[s].hp * m);
    }
    return remaining;
  }

  private scaledPhase(stage: BossStage): PhaseSpec {
    const base = PHASES[stage];
    const m = this.game.muls;
    return {
      ...base,
      hp: Math.ceil(base.hp * m.bossHp),
      fireInterval: base.fireInterval * m.bossFire,
    };
  }

  override update(dt: number): void {
    this.t += dt;

    if (this.entryTimer > 0) {
      this.entryTimer -= dt;
      const k = 1 - Math.max(0, this.entryTimer) / ENTRY_FRAMES;
      const eased = 1 - Math.pow(1 - k, 3);
      this.x = this.startX + (this.centerX - this.startX) * eased;
      return;
    }

    this.y = this.centerY + Math.sin(this.t * 0.03) * 40;
    this.x = this.centerX + Math.cos(this.t * 0.022) * 20;
    this.sprite.rotation = Math.sin(this.t * 0.015) * 0.04;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.sprite.tint = 0xffffff;
    }

    if (this.burstShotsLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.fireBurstShot();
        this.burstShotsLeft -= 1;
        this.burstTimer = BURST_GAP;
      }
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.burstShotsLeft === 0) {
      this.fireTimer = this.spec.fireInterval;
      if (this.spec.pattern === 'burst') {
        this.burstShotsLeft = BURST_SHOTS;
        this.burstTimer = 0;
      } else {
        this.fire();
      }
    }

    this.updateLaser(dt);
  }

  private updateLaser(dt: number): void {
    if (this.stage !== 2) {
      if (this.laserState !== 'idle') {
        this.laserState = 'idle';
        this.beam.visible = false;
      }
      return;
    }

    const player = this.game.player;
    const originX = this.x - 40;
    const originY = this.y;

    if (this.laserState === 'idle') {
      this.laserCooldown -= dt;
      if (this.laserCooldown <= 0) {
        this.laserState = 'charge';
        this.laserTimer = LASER_CHARGE;
      }
    } else if (this.laserState === 'charge') {
      this.laserTimer -= dt;
      this.laserOriginX = originX;
      this.laserOriginY = originY;
      this.laserAngle = Math.atan2(player.y - originY, player.x - originX);
      this.drawBeam(true);
      if (this.laserTimer <= 0) {
        this.laserState = 'fire';
        this.laserTimer = LASER_FIRE;
        this.game.shake.add(0.3);
      }
    } else {
      this.laserTimer -= dt;
      this.drawBeam(false);
      if (this.laserTimer <= 0) {
        this.laserState = 'idle';
        this.laserCooldown = LASER_COOLDOWN * this.game.muls.bossFire;
        this.beam.visible = false;
      }
    }
  }

  private drawBeam(charging: boolean): void {
    this.beam.clear();
    this.beam.position.set(this.laserOriginX, this.laserOriginY);
    this.beam.rotation = this.laserAngle;
    this.beam.visible = true;

    const halfW = charging ? 1.5 : LASER_HALF_WIDTH;
    const innerColor = charging ? 0xff6b6b : 0xffffff;
    const outerColor = 0xff4444;
    const innerAlpha = charging ? 0.4 + Math.sin(this.t * 0.6) * 0.25 : 0.95;

    this.beam
      .rect(0, -halfW * 2.4, LASER_LENGTH, halfW * 4.8)
      .fill({ color: outerColor, alpha: charging ? 0.18 : 0.45 });
    this.beam
      .rect(0, -halfW, LASER_LENGTH, halfW * 2)
      .fill({ color: innerColor, alpha: innerAlpha });

    if (!charging) {
      this.beam
        .rect(0, -halfW * 0.4, LASER_LENGTH, halfW * 0.8)
        .fill({ color: 0xffffff, alpha: 0.95 });
    }
  }

  isLaserDangerous(): boolean {
    return this.laserState === 'fire';
  }

  laserHits(px: number, py: number, pr: number): boolean {
    if (!this.isLaserDangerous()) return false;
    const dx = px - this.laserOriginX;
    const dy = py - this.laserOriginY;
    const cos = Math.cos(-this.laserAngle);
    const sin = Math.sin(-this.laserAngle);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return rx > -20 && rx < LASER_LENGTH && Math.abs(ry) < LASER_HALF_WIDTH + pr;
  }

  damage(amount: number): boolean {
    if (this.entryTimer > 0) return false;
    this.hp -= amount;
    this.sprite.tint = 0xffaaaa;
    this.flashTimer = 4;
    if (this.hp <= 0) {
      if (this.stage < 3) {
        this.advanceStage();
        return false;
      }
      this.dead = true;
      return true;
    }
    return false;
  }

  private advanceStage(): void {
    this.stage = (this.stage + 1) as BossStage;
    this.spec = this.scaledPhase(this.stage);
    this.hp = this.spec.hp;
    this.maxHp = this.spec.hp;
    this.sprite.texture = tex(this.spec.sprite);
    this.sprite.scale.set(this.spec.scale);
    this.radius = this.spec.radius;
    this.fireTimer = 30;
    this.burstShotsLeft = 0;
    this.burstTimer = 0;
    this.laserState = 'idle';
    this.laserCooldown = (LASER_COOLDOWN + 60) * this.game.muls.bossFire;
    this.beam.visible = false;

    this.game.shake.add(0.7);
    this.game.bossPhaseTransition(this.x, this.y);
  }

  private fireBurstShot(): void {
    const fromTop = this.burstShotsLeft % 2 === 0;
    const offsetY = fromTop ? -BURST_EMITTER_OFFSET : BURST_EMITTER_OFFSET;
    const ex = this.x;
    const ey = this.y + offsetY;
    const player = this.game.player;
    const dx = player.x - ex;
    const dy = player.y - ey;
    const a = Math.atan2(dy, dx);
    const speed = 6.0;
    this.game.spawn(new Bullet(
      this.game, ex, ey,
      Math.cos(a) * speed, Math.sin(a) * speed,
      { side: 'enemy', sprite: 'projBoss', scale: 0.38, radius: 6, tint: 0xff9aff },
    ));
  }

  private fire(): void {
    const player = this.game.player;
    const baseSpec = { side: 'enemy' as const, sprite: 'projBoss' as SpriteKey, scale: 0.4, radius: 6 };

    switch (this.spec.pattern) {
      case 'spread': {
        const speed = 4;
        for (let i = -2; i <= 2; i++) {
          const a = Math.PI + i * 0.18;
          this.game.spawn(new Bullet(
            this.game, this.x, this.y,
            Math.cos(a) * speed, Math.sin(a) * speed,
            baseSpec,
          ));
        }
        break;
      }
      case 'burst': {
        // handled by fireBurstShot via burstShotsLeft scheduling
        break;
      }
      case 'hell': {
        const speed = 4;
        const ringCount = 10;
        const phase = this.t * 0.04;
        for (let i = 0; i < ringCount; i++) {
          const a = (i / ringCount) * Math.PI * 2 + phase;
          this.game.spawn(new Bullet(
            this.game, this.x, this.y,
            Math.cos(a) * speed, Math.sin(a) * speed,
            { ...baseSpec, scale: 0.32, radius: 5 },
          ));
        }
        const dx = player.x - this.x, dy = player.y - this.y;
        const aim = Math.atan2(dy, dx);
        this.game.spawn(new Bullet(
          this.game, this.x, this.y,
          Math.cos(aim) * 6, Math.sin(aim) * 6,
          { ...baseSpec, scale: 0.45, radius: 7 },
        ));
        break;
      }
    }
  }
}

export { PHASES as BOSS_PHASES };
