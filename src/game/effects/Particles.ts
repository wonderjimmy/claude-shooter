import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  life: number;
  maxLife: number;
  size0: number;
}

export interface EmitOptions {
  count: number;
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  color: number;
  angle?: [number, number];
  gravity?: [number, number];
  additive?: boolean;
}

const TEX_RADIUS = 16;

export class Particles {
  readonly view = new Container();
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private texture: Texture;

  constructor(renderer: Renderer) {
    const g = new Graphics().circle(0, 0, TEX_RADIUS).fill({ color: 0xffffff });
    this.texture = renderer.generateTexture(g);
    g.destroy();
  }

  private static readonly MAX_ACTIVE = 350;

  emit(x: number, y: number, opts: EmitOptions): void {
    const [a0, a1] = opts.angle ?? [0, Math.PI * 2];
    const [g0, g1] = opts.gravity ?? [0, 0];

    const budget = Math.max(0, Particles.MAX_ACTIVE - this.active.length);
    const count = Math.min(opts.count, budget);
    if (count <= 0) return;

    for (let i = 0; i < count; i++) {
      const p = this.pool.pop() ?? this.create();
      const angle = a0 + Math.random() * (a1 - a0);
      const speed = opts.speed[0] + Math.random() * (opts.speed[1] - opts.speed[0]);

      p.sprite.x = x;
      p.sprite.y = y;
      p.sprite.tint = opts.color;
      p.sprite.blendMode = opts.additive ? 'add' : 'normal';
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.ax = g0;
      p.ay = g1;
      p.maxLife = opts.life[0] + Math.random() * (opts.life[1] - opts.life[0]);
      p.life = p.maxLife;
      p.size0 = opts.size[0] + Math.random() * (opts.size[1] - opts.size[0]);
      p.sprite.scale.set(p.size0 / TEX_RADIUS);
      p.sprite.alpha = 1;
      this.view.addChild(p.sprite);
      this.active.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.view.removeChild(p.sprite);
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      const t = p.life / p.maxLife;
      p.sprite.alpha = t;
      p.sprite.scale.set((p.size0 / TEX_RADIUS) * (0.3 + 0.7 * t));
    }
  }

  private create(): Particle {
    const sprite = new Sprite(this.texture);
    sprite.anchor.set(0.5);
    return { sprite, vx: 0, vy: 0, ax: 0, ay: 0, life: 0, maxLife: 0, size0: 0 };
  }
}
