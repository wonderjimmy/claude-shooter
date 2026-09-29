import { art, type ArtKey } from '../../core/Art';
import type { Renderer } from '../Renderer';

export interface EmitOptions {
  count: number;
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  color: string;
  angle?: [number, number];
  gravity?: number;
  drag?: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  color: string; gravity: number; drag: number;
}

interface Explosion { x: number; y: number; scale: number; life: number; maxLife: number; rot: number; spin: number }
interface Ring { x: number; y: number; r: number; speed: number; life: number; maxLife: number; color: string; width: number }
interface Popup { x: number; y: number; text: string; life: number; maxLife: number; color: string; size: number }
interface Spark { x: number; y: number; life: number; rot: number; s: number }
interface Debris { key: ArtKey; x: number; y: number; vx: number; vy: number; rot: number; spin: number; s: number; life: number; maxLife: number; smoke: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** All transient, non-colliding eye candy. */
export class Fx {
  maxParticles = 420;
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private explosions: Explosion[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private sparks: Spark[] = [];
  private debrisList: Debris[] = [];

  emit(x: number, y: number, o: EmitOptions): void {
    const budget = this.maxParticles - this.particles.length;
    const n = Math.min(o.count, budget);
    const [a0, a1] = o.angle ?? [0, Math.PI * 2];
    for (let i = 0; i < n; i++) {
      const p = this.pool.pop() ?? ({} as Particle);
      const a = rand(a0, a1);
      const sp = rand(o.speed[0], o.speed[1]);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.maxLife = p.life = rand(o.life[0], o.life[1]);
      p.size = rand(o.size[0], o.size[1]);
      p.color = o.color;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 0.96;
      this.particles.push(p);
    }
  }

  explosion(x: number, y: number, scale = 1.4, maxLife = 30): void {
    this.explosions.push({ x, y, scale, life: maxLife, maxLife, rot: Math.random() * Math.PI * 2, spin: rand(-0.06, 0.06) });
  }

  ring(x: number, y: number, color: string, speed = 14, life = 32, width = 10): void {
    this.rings.push({ x, y, r: 8, speed, life, maxLife: life, color, width });
  }

  popup(x: number, y: number, text: string, color = '#ffe066', size = 18): void {
    if (this.popups.length > 40) this.popups.shift();
    this.popups.push({ x, y, text, life: 55, maxLife: 55, color, size });
  }

  /** A broken-off character part tumbling away, trailing smoke. */
  debris(key: ArtKey, x: number, y: number, vx: number, vy: number, opts: { rot?: number; spin?: number; s?: number; life?: number } = {}): void {
    if (this.debrisList.length > 60) this.debrisList.shift();
    const life = opts.life ?? 60;
    this.debrisList.push({ key, x, y, vx, vy, rot: opts.rot ?? 0, spin: opts.spin ?? rand(-0.15, 0.15), s: opts.s ?? 1, life, maxLife: life, smoke: 0 });
  }

  spark(x: number, y: number): void {
    if (this.sparks.length > 30) return;
    this.sparks.push({ x, y, life: 10, rot: Math.random() * Math.PI, s: rand(0.6, 1) });
  }

  clear(): void {
    this.pool.push(...this.particles);
    this.particles.length = 0;
    this.explosions.length = 0;
    this.rings.length = 0;
    this.popups.length = 0;
    this.sparks.length = 0;
    this.debrisList.length = 0;
  }

  update(dt: number): void {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) { this.pool.push(p); continue; }
      const drag = Math.pow(p.drag, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ps[w++] = p;
    }
    ps.length = w;

    this.explosions = this.explosions.filter((e) => { e.life -= dt; e.rot += e.spin * dt; return e.life > 0; });
    this.rings = this.rings.filter((r) => { r.life -= dt; r.r += r.speed * dt; r.speed *= Math.pow(0.95, dt); return r.life > 0; });
    this.popups = this.popups.filter((p) => { p.life -= dt; p.y -= 0.7 * dt; return p.life > 0; });
    this.sparks = this.sparks.filter((s) => { s.life -= dt; return s.life > 0; });
    this.debrisList = this.debrisList.filter((d) => {
      d.life -= dt;
      d.vy += 0.12 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      d.smoke -= dt;
      if (d.smoke <= 0 && d.life > 10) {
        d.smoke = 3;
        this.emit(d.x, d.y, { count: 1, speed: [0.2, 0.8], life: [14, 26], size: [3, 6], color: '#ff8a3d' });
      }
      return d.life > 0;
    });
  }

  /** Tumbling parts — normal composite, drawn with the solid pass. */
  drawDebris(r: Renderer): void {
    for (const d of this.debrisList) {
      const t = d.life / d.maxLife;
      const a = art(d.key);
      r.sprite(a, d.x, d.y, d.rot, d.s, Math.min(1, t * 2));
      r.white(a, d.x, d.y, d.rot, d.s, Math.max(0, 1 - (d.maxLife - d.life) / 8) * 0.8);
    }
  }

  /** Draw with composite already set to 'lighter'. */
  drawAdditive(r: Renderer): void {
    const ex = art('fxExplosion');
    for (const e of this.explosions) {
      const t = 1 - e.life / e.maxLife;
      const s = 0.2 + (1 - Math.pow(1 - t, 2)) * e.scale;
      r.sprite(ex, e.x, e.y, e.rot, s, Math.max(0, 1 - t * t));
    }
    const hit = art('fxHit');
    for (const s of this.sparks) {
      r.sprite(hit, s.x, s.y, s.rot, s.s * (0.6 + (10 - s.life) * 0.05), s.life / 10);
    }
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      r.dot(p.color, p.x, p.y, p.size * (0.35 + 0.65 * t), Math.min(1, t * 1.4));
    }
    const ctx = r.ctx;
    for (const ring of this.rings) {
      const t = ring.life / ring.maxLife;
      r.resetTransform();
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width * t + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawPopups(r: Renderer): void {
    const ctx = r.ctx;
    r.resetTransform();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `700 ${p.size}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = 'rgba(4,3,10,0.7)';
      ctx.fillText(p.text, p.x + 1.5, p.y + 1.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  get particleCount(): number { return this.particles.length; }
}
