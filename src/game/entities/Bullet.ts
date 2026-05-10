import { Sprite } from 'pixi.js';
import { Entity } from './Entity';
import type { Game } from '../Game';
import { STAGE } from '../../config';
import { tex, type SpriteKey } from '../assets/sprites';

export type BulletSide = 'player' | 'enemy';

export interface BulletSpec {
  side: BulletSide;
  sprite: SpriteKey;
  scale: number;
  radius: number;
  blur?: number;
  tint?: number;
  rotateToVelocity?: boolean;
  pierce?: boolean;
  damage?: number;
}

export class Bullet extends Entity {
  radius: number;
  readonly side: BulletSide;
  readonly pierce: boolean;
  readonly damage: number;
  readonly hitTargets = new Set<unknown>();

  constructor(
    game: Game,
    x: number,
    y: number,
    private vx: number,
    private vy: number,
    spec: BulletSpec,
  ) {
    super(game);
    this.x = x;
    this.y = y;
    this.side = spec.side;
    this.radius = spec.radius;
    this.pierce = spec.pierce ?? false;
    this.damage = spec.damage ?? 1;

    const sprite = new Sprite(tex(spec.sprite));
    sprite.anchor.set(0.5);
    sprite.scale.set(spec.scale);
    if (spec.tint !== undefined) sprite.tint = spec.tint;
    // Per-bullet BlurFilter dropped: each bullet would create its own framebuffer pass,
    // and with spread+multi up to ~15 bullets onscreen this dominates GPU cost on WebKit.
    // The proj-pulse / proj-charge SVGs already include glow gradients, so visual impact is small.
    if (spec.rotateToVelocity ?? true) {
      sprite.rotation = Math.atan2(vy, vx);
    }
    this.view.addChild(sprite);
  }

  override update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (
      this.x < -64 || this.x > STAGE.width + 64 ||
      this.y < -64 || this.y > STAGE.height + 64
    ) {
      this.destroy();
    }
  }
}

export const PLAYER_BULLET: Omit<BulletSpec, 'side'> = {
  sprite: 'projPulse',
  scale: 0.45,
  radius: 4,
  blur: 2,
};

export function playerBullet(): BulletSpec {
  return { side: 'player', ...PLAYER_BULLET };
}

export function laserBullet(): BulletSpec {
  return {
    side: 'player',
    sprite: 'projCharge',
    scale: 0.85,
    radius: 8,
    blur: 3,
    pierce: true,
    tint: 0xfff2a8,
  };
}
