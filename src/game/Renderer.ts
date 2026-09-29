import { STAGE } from '../config';
import { type Art, DOT_RADIUS, dot, makeCanvas } from '../core/Art';

/**
 * Thin wrapper over a 2D context that works in stage units (1280×720) and
 * knows how to place baked art. Everything draws through here.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per stage unit. */
  k = 1;
  /** CSS pixels per stage unit (for converting touch drags). */
  cssScale = 1;
  /** Camera offset in device pixels (screen shake). */
  private ox = 0;
  private oy = 0;

  private vignette: HTMLCanvasElement | null = null;
  private scanlines: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
  }

  /** Fit the canvas into its parent box keeping 16:9, capped for fill-rate. */
  resize(boxW: number, boxH: number, maxRatio: number): void {
    const scale = Math.min(boxW / STAGE.width, boxH / STAGE.height);
    const cssW = Math.floor(STAGE.width * scale);
    const cssH = Math.floor(STAGE.height * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, maxRatio);
    let pw = Math.round(cssW * dpr);
    // Never exceed 2560 device px wide — beyond that fill-rate dominates and nobody can tell.
    if (pw > 2560) pw = 2560;
    const ph = Math.round(pw * STAGE.height / STAGE.width);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.vignette = null;
      this.scanlines = null;
    }
    this.k = pw / STAGE.width;
    this.cssScale = cssW / STAGE.width;
  }

  setCamera(shakeX: number, shakeY: number): void {
    this.ox = shakeX * this.k;
    this.oy = shakeY * this.k;
  }

  resetTransform(): void {
    this.ctx.setTransform(this.k, 0, 0, this.k, this.ox, this.oy);
  }

  /** Stage-space transform without shake (HUD). */
  hudTransform(): void {
    this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
  }

  private place(x: number, y: number, rot: number, s: number): void {
    const k = this.k * s;
    if (rot === 0) {
      this.ctx.setTransform(k, 0, 0, k, this.ox + x * this.k, this.oy + y * this.k);
    } else {
      const c = Math.cos(rot) * k;
      const sn = Math.sin(rot) * k;
      this.ctx.setTransform(c, sn, -sn, c, this.ox + x * this.k, this.oy + y * this.k);
    }
  }

  sprite(a: Art, x: number, y: number, rot = 0, s = 1, alpha = 1): void {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    this.place(x, y, rot, s);
    ctx.globalAlpha = alpha;
    ctx.drawImage(a.img, -a.w / 2, -a.h / 2, a.w, a.h);
  }

  /** Must be called while composite = 'lighter'. */
  glow(a: Art, x: number, y: number, rot = 0, s = 1, alpha = 1): void {
    if (!a.glow || alpha <= 0) return;
    this.place(x, y, rot, s);
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(a.glow, -a.w / 2, -a.h / 2, a.w, a.h);
  }

  white(a: Art, x: number, y: number, rot = 0, s = 1, alpha = 1): void {
    if (!a.white || alpha <= 0) return;
    this.place(x, y, rot, s);
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(a.white, -a.w / 2, -a.h / 2, a.w, a.h);
  }

  /** Soft additive dot, radius in stage units. */
  dot(color: string, x: number, y: number, radius: number, alpha = 1): void {
    if (alpha <= 0 || radius <= 0) return;
    const s = radius / DOT_RADIUS;
    this.place(x, y, 0, s);
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(dot(color), -DOT_RADIUS, -DOT_RADIUS);
  }

  additive(on: boolean): void {
    this.ctx.globalCompositeOperation = on ? 'lighter' : 'source-over';
  }

  /** Full-frame post: vignette + faint scanlines, both baked once per size. */
  post(scanlines: boolean): void {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!this.vignette) {
      const [c, vctx] = makeCanvas(w / 4, h / 4);
      const g = vctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.35, c.width / 2, c.height / 2, c.width * 0.62);
      g.addColorStop(0, 'rgba(4,3,10,0)');
      g.addColorStop(1, 'rgba(4,3,10,0.72)');
      vctx.fillStyle = g;
      vctx.fillRect(0, 0, c.width, c.height);
      this.vignette = c;
    }
    ctx.drawImage(this.vignette, 0, 0, w, h);
    if (scanlines) {
      if (!this.scanlines) {
        const step = Math.max(2, Math.round(this.k * 3));
        const [c, sctx] = makeCanvas(4, step);
        sctx.fillStyle = 'rgba(255,255,255,0.035)';
        sctx.fillRect(0, 0, 4, 1);
        this.scanlines = c;
      }
      const pattern = ctx.createPattern(this.scanlines, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }

  flash(color: string, alpha: number): void {
    if (alpha <= 0.002) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalAlpha = 1;
  }
}
