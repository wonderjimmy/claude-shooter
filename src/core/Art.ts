// SVG → bitmap baking. Every sprite is rasterised once at boot at the exact
// device resolution it will be drawn at, colour-graded in software, and given
// a pre-blurred "bloom" twin. At runtime we only ever call drawImage(), which
// is fast and identical on every browser — no WebGL, no shader compilation,
// no eval, so SES-locked pages, Firefox, Safari and phones all behave the same.

import projPulseSvg from '../../assets/images/sprites/proj-pulse.svg?raw';
import projChargeSvg from '../../assets/images/sprites/proj-charge.svg?raw';
import projBoneShardSvg from '../../assets/images/sprites/proj-bone-shard.svg?raw';
import projPsiSvg from '../../assets/images/sprites/proj-psi.svg?raw';
import projBladeSvg from '../../assets/images/sprites/proj-blade.svg?raw';
import projSplinterSvg from '../../assets/images/sprites/proj-splinter.svg?raw';
import projStingerSvg from '../../assets/images/sprites/proj-stinger.svg?raw';
import projBossSvg from '../../assets/images/sprites/proj-boss.svg?raw';
import puShieldSvg from '../../assets/images/sprites/pu-shield.svg?raw';
import puSpreadSvg from '../../assets/images/sprites/pu-spread.svg?raw';
import puSpeedSvg from '../../assets/images/sprites/pu-speed.svg?raw';
import puLifeSvg from '../../assets/images/sprites/pu-life.svg?raw';
import puBombSvg from '../../assets/images/sprites/pu-bomb.svg?raw';
import puMultiSvg from '../../assets/images/sprites/pu-multi.svg?raw';
import puLaserSvg from '../../assets/images/sprites/pu-laser.svg?raw';
import puCoinSvg from '../../assets/images/sprites/pu-coin.svg?raw';
import fxExplosionSvg from '../../assets/images/sprites/fx-explosion.svg?raw';
import fxHitSvg from '../../assets/images/sprites/fx-hit.svg?raw';

import type { DrawnKey } from '../game/art/Sprites';

export interface Art {
  /** Full-resolution bitmap, including `pad` on every side. */
  img: HTMLCanvasElement;
  /** Half-resolution blurred copy for additive bloom, or null. */
  glow: HTMLCanvasElement | null;
  /** White silhouette for hit flashes, or null. */
  white: HTMLCanvasElement | null;
  /** Logical (stage-space) draw size, including padding. */
  w: number;
  h: number;
}

interface SvgDef {
  svg: string;
  scale: number;
  glow?: boolean;
  white?: boolean;
  tint?: string;
  /** Bake at a higher resolution when the sprite is drawn enlarged (elites, explosions). */
  bakeMul?: number;
  grade?: boolean;
}

const DEFS = {
  projPulse:     { svg: projPulseSvg, scale: 0.5, glow: true },
  projCharge:    { svg: projChargeSvg, scale: 0.85, glow: true, tint: '#fff2a8' },
  projBoneShard: { svg: projBoneShardSvg, scale: 0.4, glow: true },
  projPsi:       { svg: projPsiSvg, scale: 0.34, glow: true },
  projBlade:     { svg: projBladeSvg, scale: 0.44, glow: true },
  projSplinter:  { svg: projSplinterSvg, scale: 0.36, glow: true },
  projStinger:   { svg: projStingerSvg, scale: 0.44, glow: true, tint: '#a8e85d' },
  projBoss:      { svg: projBossSvg, scale: 0.46, glow: true },
  projBossPink:  { svg: projBossSvg, scale: 0.42, glow: true, tint: '#ff9aff' },
  puShield:      { svg: puShieldSvg, scale: 0.7, glow: true },
  puSpread:      { svg: puSpreadSvg, scale: 0.7, glow: true },
  puSpeed:       { svg: puSpeedSvg, scale: 0.7, glow: true },
  puLife:        { svg: puLifeSvg, scale: 0.7, glow: true },
  puBomb:        { svg: puBombSvg, scale: 0.7, glow: true },
  puMulti:       { svg: puMultiSvg, scale: 0.7, glow: true },
  puLaser:       { svg: puLaserSvg, scale: 0.7, glow: true },
  puCoin:        { svg: puCoinSvg, scale: 0.7, glow: true },
  fxExplosion:   { svg: fxExplosionSvg, scale: 1, bakeMul: 3, grade: false },
  fxHit:         { svg: fxHitSvg, scale: 1, bakeMul: 1.5, grade: false },
} satisfies Record<string, SvgDef>;

export type SvgKey = keyof typeof DEFS;
export type ArtKey = SvgKey | 'puPower' | 'gem' | DrawnKey;

const arts = new Map<ArtKey, Art>();
let pixelRatio = 1;

export function art(key: ArtKey): Art {
  const a = arts.get(key);
  if (!a) throw new Error(`Art not baked: ${key}`);
  return a;
}

/** Device pixels per stage unit the art was baked for. */
export function bakedPixelRatio(): number { return pixelRatio; }

// ── helpers ────────────────────────────────────────────────────────────────

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return [c, ctx];
}

let filterSupport: boolean | null = null;
function supportsCtxFilter(): boolean {
  if (filterSupport !== null) return filterSupport;
  const [, ctx] = makeCanvas(1, 1);
  try {
    ctx.filter = 'blur(2px)';
    filterSupport = ctx.filter === 'blur(2px)';
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

function viewBoxSize(svg: string): [number, number] {
  const m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  if (!m) throw new Error('SVG missing viewBox');
  return [parseFloat(m[1]!), parseFloat(m[2]!)];
}

async function svgImage(svg: string, w: number, h: number): Promise<HTMLImageElement> {
  const sized = svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) =>
    `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    // Safari occasionally needs the URL alive until after the first paint.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// Same colour grade the Pixi build used: saturate(0.4) → brightness(1.15) → contrast(0.15).
function colorGrade(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  let data: ImageData;
  try { data = ctx.getImageData(0, 0, w, h); } catch { return; /* tainted — skip grading */ }
  const d = data.data;
  const sx = 0.4 * 2 / 3 + 1;
  const sy = (sx - 1) * -0.5;
  const bright = 1.15;
  const cv = 1.15;
  const co = -0.5 * (cv - 1) * 255;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    let nr = sx * r + sy * g + sy * b;
    let ng = sy * r + sx * g + sy * b;
    let nb = sy * r + sy * g + sx * b;
    nr = nr * bright * cv + co;
    ng = ng * bright * cv + co;
    nb = nb * bright * cv + co;
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; // Uint8Clamped clamps for us
  }
  ctx.putImageData(data, 0, 0);
}

function makeGlow(src: HTMLCanvasElement, blurDevicePx: number): HTMLCanvasElement {
  const w = Math.ceil(src.width / 2);
  const h = Math.ceil(src.height / 2);
  const [out, ctx] = makeCanvas(w, h);
  if (supportsCtxFilter()) {
    ctx.filter = `blur(${Math.max(1, blurDevicePx / 2)}px)`;
    ctx.drawImage(src, 0, 0, w, h);
    ctx.filter = 'none';
  } else {
    // Downsample/upsample blur — cheap, universal, good enough for bloom.
    const f = Math.max(2, Math.round(blurDevicePx / 3));
    const [small, sctx] = makeCanvas(w / f, h / f);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(out, 0, 0);
  return out;
}

function makeWhite(src: HTMLCanvasElement): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

function applyTint(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, tint: string): void {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

async function bakeSvg(def: SvgDef): Promise<Art> {
  const [vw, vh] = viewBoxSize(def.svg);
  const res = pixelRatio * (def.bakeMul ?? 1);
  const pad = def.glow ? 14 : 2;
  const lw = vw * def.scale + pad * 2;
  const lh = vh * def.scale + pad * 2;
  const iw = Math.round(vw * def.scale * res);
  const ih = Math.round(vh * def.scale * res);
  const img = await svgImage(def.svg, iw, ih);

  const [c, ctx] = makeCanvas(lw * res, lh * res);
  const px = Math.round(pad * res);
  ctx.drawImage(img, px, px, iw, ih);
  if (def.tint) {
    const [copy, cctx] = makeCanvas(c.width, c.height);
    cctx.drawImage(c, 0, 0);
    applyTint(ctx, copy, c.width, c.height, def.tint);
  }
  if (def.grade !== false) colorGrade(ctx, c.width, c.height);

  return {
    img: c,
    glow: def.glow ? makeGlow(c, 10 * res) : null,
    white: def.white ? makeWhite(c) : null,
    w: lw,
    h: lh,
  };
}

// ── procedural art ─────────────────────────────────────────────────────────

export interface DrawnOptions { glow?: boolean; white?: boolean; bakeMul?: number }

/** Bake a canvas-drawn sprite of logical size w×h (drawn in logical units). */
export function bakeDrawn(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, o: DrawnOptions = {}): Art {
  const res = pixelRatio * (o.bakeMul ?? 1);
  const pad = o.glow ? 12 : 2;
  const [c, ctx] = makeCanvas((w + pad * 2) * res, (h + pad * 2) * res);
  ctx.scale(res, res);
  ctx.translate(pad, pad);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return {
    img: c,
    glow: o.glow ? makeGlow(c, 10 * res) : null,
    white: o.white ? makeWhite(c) : null,
    w: w + pad * 2,
    h: h + pad * 2,
  };
}

export function registerArt(key: ArtKey, a: Art): void { arts.set(key, a); }

function bakeProcedural(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): Art {
  const res = pixelRatio;
  const [c, ctx] = makeCanvas(size * res, size * res);
  ctx.scale(res, res);
  draw(ctx, size);
  return { img: c, glow: makeGlow(c, 8 * res), white: null, w: size, h: size };
}

function drawPowerOrb(ctx: CanvasRenderingContext2D, s: number): void {
  const r = s / 2 - 8;
  const cx = s / 2, cy = s / 2;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
  g.addColorStop(0, '#fff6f0');
  g.addColorStop(0.35, '#ff8a3d');
  g.addColorStop(1, '#a83232');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffe066';
  ctx.stroke();
  ctx.fillStyle = '#1a0820';
  ctx.font = `900 ${Math.round(r * 1.25)}px "Space Grotesk", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', cx, cy + 1);
}

function drawGem(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2, cy = s / 2, r = s / 2 - 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.62, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.62, cy);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#ffe066');
  g.addColorStop(1, '#ff8a3d');
  ctx.fillStyle = g;
  ctx.fill();
}

// ── particles: one soft dot per colour, generated on demand ─────────────────

const dotCache = new Map<string, HTMLCanvasElement>();
export const DOT_RADIUS = 16;

export function dot(color: string): HTMLCanvasElement {
  let c = dotCache.get(color);
  if (c) return c;
  const size = DOT_RADIUS * 2;
  const [canvas, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(DOT_RADIUS, DOT_RADIUS, 0, DOT_RADIUS, DOT_RADIUS, DOT_RADIUS);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(0.6, color + '88');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dotCache.set(color, canvas);
  c = canvas;
  return c;
}

// ── entry point ─────────────────────────────────────────────────────────────

export async function bakeArt(ratio: number, onProgress?: (done: number, total: number) => void): Promise<void> {
  pixelRatio = ratio;
  arts.clear();
  const entries = Object.entries(DEFS) as Array<[SvgKey, SvgDef]>;
  const total = entries.length + 2;
  let done = 0;
  // Bake in small batches so the loading bar actually moves.
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    const baked = await Promise.all(batch.map(([, def]) => bakeSvg(def)));
    batch.forEach(([key], j) => arts.set(key, baked[j]!));
    done += batch.length;
    onProgress?.(done, total);
    await new Promise((r) => setTimeout(r, 0));
  }
  arts.set('puPower', bakeProcedural(46, drawPowerOrb));
  arts.set('gem', bakeProcedural(18, drawGem));
  onProgress?.(total, total);
}
