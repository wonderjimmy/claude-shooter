import { STAGE } from '../../config';
import { art, type Art, type ArtKey } from '../../core/Art';
import type { Renderer } from '../Renderer';

export interface BulletSpec {
  art: ArtKey;
  /** Draw scale relative to the baked art. */
  scale?: number;
  radius: number;
  damage?: number;
  pierce?: boolean;
  /** Radians per frame; bends the velocity (curving boss patterns). */
  turn?: number;
  /** Speed multiplier per frame (1 = constant). */
  accel?: number;
  /** Spin the sprite instead of pointing it along velocity. */
  spin?: number;
}

export class Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly radius: number;
  readonly damage: number;
  readonly pierce: boolean;
  readonly hits: Set<object> | null;
  grazed = false;
  dead = false;
  age = 0;
  private readonly a: Art;
  private readonly scale: number;
  private readonly turn: number;
  private readonly accel: number;
  private readonly spin: number;
  private rot: number;

  constructor(x: number, y: number, vx: number, vy: number, spec: BulletSpec) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.a = art(spec.art);
    this.scale = spec.scale ?? 1;
    this.radius = spec.radius;
    this.damage = spec.damage ?? 1;
    this.pierce = spec.pierce ?? false;
    this.hits = this.pierce ? new Set() : null;
    this.turn = spec.turn ?? 0;
    this.accel = spec.accel ?? 1;
    this.spin = spec.spin ?? 0;
    this.rot = this.spin ? Math.random() * Math.PI : Math.atan2(vy, vx);
  }

  update(dt: number): void {
    this.age += dt;
    if (this.turn !== 0) {
      const c = Math.cos(this.turn * dt), s = Math.sin(this.turn * dt);
      const vx = this.vx * c - this.vy * s;
      this.vy = this.vx * s + this.vy * c;
      this.vx = vx;
    }
    if (this.accel !== 1) {
      const m = Math.pow(this.accel, dt);
      this.vx *= m;
      this.vy *= m;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot = this.spin ? this.rot + this.spin * dt : Math.atan2(this.vy, this.vx);
    if (this.x < -80 || this.x > STAGE.width + 80 || this.y < -80 || this.y > STAGE.height + 80) {
      this.dead = true;
    }
  }

  draw(r: Renderer): void {
    r.sprite(this.a, this.x, this.y, this.rot, this.scale);
  }

  drawGlow(r: Renderer, alpha: number): void {
    r.glow(this.a, this.x, this.y, this.rot, this.scale, alpha);
  }
}
