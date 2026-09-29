import { STAGE } from '../../config';
import type { Renderer } from '../Renderer';
import { THEMES, WRAP, sceneArt, type SceneArt, type ThemeName } from './Scenery';

interface Star { x: number; y: number; z: number; size: number; tw: number }
interface Spore { x: number; y: number; z: number; ph: number }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

interface Layer { name: ThemeName; art: SceneArt; alpha: number }

/**
 * Multi-layer procedural backdrop. Back to front:
 * sky gradient → stars → nebula → celestial body → far carcass → near carcass
 * → wisps → spores / meteors → flesh walls (Hive Throat only).
 * Themes cross-fade when the sector changes.
 */
export class Background {
  private layers: Layer[] = [];
  private pending: ThemeName | null = null;
  private current: ThemeName | null = null;
  private stars: Star[] = [];
  private spores: Spore[] = [];
  private meteors: Meteor[] = [];
  private meteorT = 300;
  private t = 0;
  private scroll = 0;
  private bodyX = 1010;
  private wallK = 0;
  warp = 1;
  private warpTarget = 1;
  /** Low-detail mode skips the wisp layer, spores and the second carcass. */
  lowDetail = false;

  constructor() {
    for (let i = 0; i < 220; i++) {
      const z = Math.pow(Math.random(), 1.6);
      this.stars.push({ x: Math.random() * STAGE.width, y: Math.random() * STAGE.height, z, size: 0.7 + z * 1.9, tw: Math.random() * 6.3 });
    }
    for (let i = 0; i < 34; i++) {
      this.spores.push({ x: Math.random() * STAGE.width, y: Math.random() * STAGE.height, z: 0.4 + Math.random() * 0.6, ph: Math.random() * 6.3 });
    }
  }

  get theme(): ThemeName | null { return this.pending ?? this.current; }

  /** Preload a theme (resolves when its art is baked). */
  prepare(name: ThemeName): Promise<unknown> { return sceneArt(name); }

  setTheme(name: ThemeName): void {
    if (name === this.current && !this.pending) return;
    this.pending = name;
    void sceneArt(name).then((art) => {
      if (this.pending !== name) return;
      this.pending = null;
      this.current = name;
      this.bodyX = 1040;
      this.layers.push({ name, art, alpha: this.layers.length ? 0 : 1 });
    });
  }

  setWarp(v: number): void { this.warpTarget = v; }

  update(dt: number): void {
    this.t += dt;
    this.warp += (this.warpTarget - this.warp) * Math.min(1, 0.04 * dt);
    const w = this.warp;
    this.scroll += w * dt;
    this.bodyX -= 0.03 * w * dt;

    // Cross-fade: newest layer fades in, the rest fade out and are dropped.
    const top = this.layers[this.layers.length - 1];
    if (top && top.alpha < 1) top.alpha = Math.min(1, top.alpha + 0.012 * dt);
    if (top && top.alpha >= 1 && this.layers.length > 1) this.layers = [top];

    const walls = this.current && THEMES[this.current].walls ? 1 : 0;
    this.wallK += (walls - this.wallK) * Math.min(1, 0.015 * dt);

    for (const s of this.stars) {
      s.x -= (0.08 + s.z * s.z * 2.4) * w * dt;
      if (s.x < -40) { s.x = STAGE.width + Math.random() * 40; s.y = Math.random() * STAGE.height; }
    }
    for (const s of this.spores) {
      s.x -= (0.9 + s.z * 2.2) * w * dt;
      s.y += Math.sin(this.t * 0.02 + s.ph) * 0.25 * dt;
      if (s.x < -20) { s.x = STAGE.width + 20; s.y = Math.random() * STAGE.height; }
    }

    this.meteorT -= dt;
    if (this.meteorT <= 0) {
      this.meteorT = 360 + Math.random() * 600;
      const sp = 14 + Math.random() * 8;
      this.meteors.push({ x: STAGE.width * (0.4 + Math.random() * 0.7), y: -20, vx: -sp * 0.8, vy: sp * 0.45, life: 70 });
    }
    this.meteors = this.meteors.filter((m) => {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      return m.life > 0 && m.y < STAGE.height + 40;
    });
  }

  draw(r: Renderer): void {
    const ctx = r.ctx;
    r.hudTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.layers.length === 0 || !this.current) {
      ctx.fillStyle = '#04030a';
      ctx.fillRect(0, 0, STAGE.width, STAGE.height);
      return;
    }

    // Sky (opaque base, blended between themes).
    for (const l of this.layers) {
      ctx.globalAlpha = l.alpha;
      ctx.drawImage(l.art.sky, 0, 0, STAGE.width, STAGE.height);
    }

    // Stars — streak as warp rises.
    const th = THEMES[this.current];
    ctx.fillStyle = th.star;
    for (const s of this.stars) {
      ctx.globalAlpha = (0.2 + s.z * 0.7) * (0.7 + 0.3 * Math.sin(this.t * 0.04 + s.tw));
      const len = s.size + (this.warp - 1) * s.z * 14;
      ctx.fillRect(s.x, s.y, len, s.size * 0.8);
    }

    for (const l of this.layers) this.drawScene(r, l);

    // Spores + meteors (additive).
    ctx.globalCompositeOperation = 'lighter';
    if (!this.lowDetail) {
      for (const s of this.spores) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.05 + s.ph);
        r.dot(th.wisp, s.x, s.y, 3 + s.z * 5, (0.12 + pulse * 0.2) * s.z);
      }
    }
    r.hudTransform();
    for (const m of this.meteors) {
      const k = Math.min(1, m.life / 30);
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 6, m.y - m.vy * 6);
      g.addColorStop(0, th.star);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.8 * k;
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 6, m.y - m.vy * 6);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawScene(r: Renderer, l: Layer): void {
    const ctx = r.ctx;
    const a = l.art;
    const s = this.scroll;
    const pulse = THEMES[l.name].body === 'eye' || THEMES[l.name].body === 'eclipse'
      ? 1 + 0.03 * Math.max(0, Math.sin(this.t * 0.09)) : 1;
    r.hudTransform();

    // Nebula (big, slow).
    ctx.globalAlpha = l.alpha * 0.9;
    this.strip(ctx, a.nebula, s * 0.18, 0, WRAP, STAGE.height);

    // Celestial body.
    const bs = 520 * pulse;
    ctx.globalAlpha = l.alpha;
    ctx.drawImage(a.body, this.bodyX - bs / 2, 200 - bs / 2, bs, bs);

    // Carcasses: far (small, faint) then near.
    if (!this.lowDetail) {
      ctx.globalAlpha = l.alpha * 0.45;
      this.strip(ctx, a.carcass, s * 0.22, STAGE.height - 250, WRAP * 0.6, 180);
    }
    ctx.globalAlpha = l.alpha * 0.9;
    this.strip(ctx, a.carcass, s * 0.42, STAGE.height - 215, WRAP, 300);

    // Wisps (additive, faster).
    if (!this.lowDetail) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = l.alpha * 0.55;
      this.strip(ctx, a.wisps, s * 0.7, 0, WRAP, STAGE.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Flesh walls, only once Hive Throat is reached.
    if (a.wallTop && a.wallBot && this.wallK > 0.01) {
      const h = 104;
      const slide = (1 - this.wallK) * h;
      ctx.globalAlpha = l.alpha;
      this.strip(ctx, a.wallTop, s * 1.6, -slide, WRAP, h);
      this.strip(ctx, a.wallBot, s * 1.6 + 700, STAGE.height - h + slide, WRAP, h);
    }
    ctx.globalAlpha = 1;
  }

  private strip(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, off: number, y: number, w: number, h: number): void {
    let x = -(off % w);
    // +1 px overlap hides the bilinear seam where the tile wraps.
    for (; x < STAGE.width; x += w - 1) ctx.drawImage(img, x, y, w, h);
  }
}
