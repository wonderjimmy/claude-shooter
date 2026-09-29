// Procedural backdrop art, baked once per theme into off-screen canvases.
// Everything tiles horizontally over WRAP stage units so it can scroll forever.

import { makeCanvas } from '../../core/Art';

export const WRAP = 2560;

export type ThemeName = 'husk' | 'sinew' | 'throat' | 'heart' | 'dawn';

export interface Theme {
  skyTop: string;
  skyMid: string;
  skyBot: string;
  nebDeep: string;
  nebHot: string;
  wisp: string;
  rim: string;
  star: string;
  body: 'deadstar' | 'giant' | 'eye' | 'eclipse' | 'sun';
  walls: boolean;
}

export const THEMES: Record<ThemeName, Theme> = {
  husk:   { skyTop: '#0c1726', skyMid: '#07101a', skyBot: '#04030a', nebDeep: '#15405a', nebHot: '#5dd9e8', wisp: '#9be7ff', rim: '#5dd9e8', star: '#d8f6ff', body: 'deadstar', walls: false },
  sinew:  { skyTop: '#210a26', skyMid: '#12061a', skyBot: '#05030b', nebDeep: '#56185c', nebHot: '#e85dc9', wisp: '#ff9aff', rim: '#e85dc9', star: '#ffe0f7', body: 'giant', walls: false },
  throat: { skyTop: '#260a08', skyMid: '#150507', skyBot: '#070205', nebDeep: '#5c1a10', nebHot: '#ff5a3d', wisp: '#ff8a3d', rim: '#ff6a3d', star: '#ffe2cf', body: 'eye', walls: true },
  heart:  { skyTop: '#2c0306', skyMid: '#160206', skyBot: '#050103', nebDeep: '#4d0a0c', nebHot: '#ff3b3b', wisp: '#ff6b6b', rim: '#ff3b3b', star: '#ffd0d0', body: 'eclipse', walls: true },
  dawn:   { skyTop: '#2b1b08', skyMid: '#170d0c', skyBot: '#0a0612', nebDeep: '#6b4312', nebHot: '#ffe066', wisp: '#fff2a8', rim: '#ffe066', star: '#fff6dc', body: 'sun', walls: false },
};

export interface SceneArt {
  sky: HTMLCanvasElement;
  nebula: HTMLCanvasElement;
  wisps: HTMLCanvasElement;
  carcass: HTMLCanvasElement;
  body: HTMLCanvasElement;
  wallTop: HTMLCanvasElement | null;
  wallBot: HTMLCanvasElement | null;
}

// ── noise ────────────────────────────────────────────────────────────────────

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Noise {
  private v = new Float32Array(256);
  private p = new Uint8Array(512);
  constructor(seed: number) {
    const r = mulberry(seed);
    for (let i = 0; i < 256; i++) { this.v[i] = r(); this.p[i] = i; }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = this.p[i]!; this.p[i] = this.p[j]!; this.p[j] = t;
    }
    for (let i = 0; i < 256; i++) this.p[i + 256] = this.p[i]!;
  }
  private h(x: number, y: number): number { return this.v[this.p[(this.p[x & 255]! + y) & 255]!]!; }
  /** Value noise, periodic in x with period `px` lattice cells. */
  at(x: number, y: number, px: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const a = this.h(x0, yi), b = this.h(x1, yi), c = this.h(x0, yi + 1), d = this.h(x1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  fbm(x: number, y: number, period: number, oct = 5): number {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += this.at(x * f, y * f, period * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return s / norm;
  }
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

// ── layers ───────────────────────────────────────────────────────────────────

function bakeSky(t: Theme): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(8, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, t.skyTop);
  g.addColorStop(0.5, t.skyMid);
  g.addColorStop(1, t.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  return c;
}

/** Domain-warped fbm clouds. Low-res on purpose: upscaling gives free softness. */
async function bakeClouds(t: Theme, seed: number, w: number, h: number, opts: { lo: number; hi: number; alpha: number; hotMix: number; wispy: boolean }): Promise<HTMLCanvasElement> {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const n = new Noise(seed);
  const deep = rgb(t.nebDeep), hot = rgb(opts.wispy ? t.wisp : t.nebHot);
  const period = 6; // lattice cells across the full wrap width
  const sx = period / w, sy = (period * (h / w)) * 2.2;
  for (let y = 0; y < h; y++) {
    const ny = y / h;
    // Fade clouds toward the vertical edges a little so the middle stays readable.
    const band = opts.wispy ? 1 : 0.55 + 0.45 * Math.sin(ny * Math.PI);
    for (let x = 0; x < w; x++) {
      const fx = x * sx, fy = ny * sy;
      const qx = n.fbm(fx, fy, period, 4);
      const qy = n.fbm(fx + 5.2, fy + 1.3, period, 4);
      const v = n.fbm(fx + 1.7 * qx, fy + 1.7 * qy + 3.1, period, opts.wispy ? 5 : 4);
      let dens = smooth(opts.lo, opts.hi, v) * band;
      if (opts.wispy) dens = Math.pow(dens, 1.6);
      const heat = smooth(0.35, 0.9, qy) * opts.hotMix;
      const i = (y * w + x) * 4;
      d[i] = deep[0] + (hot[0] - deep[0]) * heat;
      d[i + 1] = deep[1] + (hot[1] - deep[1]) * heat;
      d[i + 2] = deep[2] + (hot[2] - deep[2]) * heat;
      d[i + 3] = dens * 255 * opts.alpha;
    }
    if (y % 24 === 23) await yieldFrame();
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Distant bio-mechanical carcasses: a spine with ribs, silhouetted and rim-lit. */
function bakeCarcass(t: Theme, seed: number): HTMLCanvasElement {
  const H = 300;
  const [c, ctx] = makeCanvas(WRAP / 2, H / 2);
  ctx.scale(0.5, 0.5);
  const r = mulberry(seed);
  const base = H * 0.62;
  const spineY = (x: number) => base + Math.sin((x / WRAP) * Math.PI * 4) * 38 + Math.sin((x / WRAP) * Math.PI * 10 + 1) * 12;

  // Ribs first (behind the spine).
  const ribs: Array<[number, number, number]> = [];
  for (let x = 30; x < WRAP; x += 70 + r() * 40) ribs.push([x, 90 + r() * 130, r()]);
  const silhouette = '#07040c';
  ctx.lineCap = 'round';
  for (const [x, len, k] of ribs) {
    const y = spineY(x);
    const lean = -0.35 - k * 0.3;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(lean) * len * 0.6, y + dir * len * 0.55, x + Math.sin(lean) * len * 0.2 - 18, y + dir * len);
      ctx.strokeStyle = silhouette;
      ctx.lineWidth = 13 - k * 5;
      ctx.stroke();
      ctx.strokeStyle = t.rim;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Spine as vertebrae beads.
  for (let x = -10; x < WRAP + 20; x += 13) {
    const y = spineY(x);
    const s = 15 + Math.sin(x * 0.05) * 3;
    ctx.fillStyle = silhouette;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = t.rim;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= WRAP; x += 8) {
    const y = spineY(x) - 13;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Scattered lit nodes along the spine — "engines" still burning in the dead hive.
  for (let i = 0; i < 16; i++) {
    const x = r() * WRAP, y = spineY(x);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    g.addColorStop(0, t.nebHot);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - 16, y - 16, 32, 32);
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Organic wall strip (flesh tunnel) — `flip` for the ceiling. */
function bakeWall(t: Theme, seed: number, flip: boolean): HTMLCanvasElement {
  const H = 110;
  const [c, ctx] = makeCanvas(WRAP / 2, H / 2);
  ctx.scale(0.5, 0.5);
  if (flip) { ctx.translate(0, H); ctx.scale(1, -1); }
  const n = new Noise(seed);
  const edge = (x: number) => 40 + n.fbm(x / WRAP * 10, 0.5, 10, 4) * 60;

  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= WRAP; x += 6) ctx.lineTo(x, edge(x));
  ctx.lineTo(WRAP, H);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 30, 0, H);
  g.addColorStop(0, '#6a1c20');
  g.addColorStop(0.3, '#35090f');
  g.addColorStop(1, '#0a0206');
  ctx.fillStyle = g;
  ctx.fill();

  // Veins.
  ctx.save();
  ctx.clip();
  const r = mulberry(seed + 7);
  ctx.strokeStyle = t.rim;
  for (let i = 0; i < 26; i++) {
    let x = r() * WRAP, y = H;
    ctx.globalAlpha = 0.18 + r() * 0.2;
    ctx.lineWidth = 0.8 + r() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.5) * 50;
      y -= 8 + r() * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Ribs pressing through the membrane.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#4a1a1a';
  ctx.lineWidth = 6;
  for (let x = 40; x < WRAP; x += 150) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.quadraticCurveTo(x + 40, edge(x + 40) + 10, x + 90, H);
    ctx.stroke();
  }
  ctx.restore();

  // Wet rim light on the edge.
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = t.rim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= WRAP; x += 6) {
    const y = edge(x);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  return c;
}

function bakeBody(t: Theme, seed: number): HTMLCanvasElement {
  const S = 520;
  const [c, ctx] = makeCanvas(S, S);
  const cx = S / 2, cy = S / 2;
  const r = mulberry(seed);
  const halo = (radius: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 1;
  };

  switch (t.body) {
    case 'deadstar': {
      halo(250, t.nebHot, 0.35);
      halo(120, '#ffffff', 0.5);
      // Corona rays.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 28; i++) {
        ctx.rotate((Math.PI * 2) / 28 + r() * 0.08);
        const len = 90 + r() * 150;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, 'rgba(216,246,255,0.5)');
        g.addColorStop(1, 'rgba(93,217,232,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -1.2, len, 2.4);
      }
      ctx.restore();
      const core = ctx.createRadialGradient(cx - 10, cy - 10, 4, cx, cy, 46);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.6, '#d8f6ff');
      core.addColorStop(1, '#5dd9e8');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, 44, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'giant': {
      halo(250, t.nebHot, 0.22);
      const R = 150;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createRadialGradient(cx - 60, cy - 60, 10, cx, cy, R);
      g.addColorStop(0, '#f7a8e8');
      g.addColorStop(0.45, '#9a2f8c');
      g.addColorStop(1, '#1a0620');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      // Storm bands.
      // Storm bands: many faint, overlapping, slightly tilted streaks.
      for (let i = 0; i < 40; i++) {
        const y = cy - R + r() * R * 2;
        ctx.globalAlpha = 0.03 + r() * 0.07;
        ctx.fillStyle = r() < 0.5 ? '#2a0830' : '#ffc8f4';
        ctx.beginPath();
        ctx.ellipse(cx + (r() - 0.5) * 40, y, R * 1.2, 2 + r() * 12, -0.12 + (r() - 0.5) * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      // A storm eye.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffd8f6';
      ctx.beginPath();
      ctx.ellipse(cx - 50, cy + 40, 22, 10, -0.12, 0, Math.PI * 2);
      ctx.fill();
      // Night side.
      ctx.globalAlpha = 1;
      const shade = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      shade.addColorStop(0.35, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(5,3,11,0.92)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, S, S);
      ctx.restore();
      // Ring.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.28);
      ctx.strokeStyle = t.star;
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.18 + i * 0.05;
        ctx.lineWidth = 2 + i;
        ctx.beginPath();
        ctx.ellipse(0, 0, 230 - i * 9, 34 - i * 1.5, 0, Math.PI * 0.02, Math.PI * 0.98, true);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }
    case 'eye': {
      halo(240, t.nebHot, 0.3);
      const R = 120;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
      g.addColorStop(0, '#1a0204');
      g.addColorStop(0.55, '#5c0e0a');
      g.addColorStop(0.8, '#ff6a3d');
      g.addColorStop(0.86, '#ffd2a8');
      g.addColorStop(1, '#3a0808');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // Iris striations.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = '#ffb07a';
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * Math.PI * 2 + r() * 0.03;
        ctx.globalAlpha = 0.1 + r() * 0.25;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
        ctx.lineTo(Math.cos(a) * (80 + r() * 20), Math.sin(a) * (80 + r() * 20));
        ctx.stroke();
      }
      ctx.restore();
      // Slit pupil.
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#050103';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 14, 62, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'eclipse': {
      halo(260, '#ff3b3b', 0.45);
      halo(150, '#ffb0a0', 0.55);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        ctx.rotate((Math.PI * 2) / 40);
        const len = 130 + r() * 110;
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0.45, 'rgba(255,90,70,0.55)');
        g.addColorStop(1, 'rgba(255,59,59,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, -1.5, len, 3);
      }
      ctx.restore();
      ctx.fillStyle = '#030102';
      ctx.beginPath();
      ctx.arc(cx, cy, 112, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd0c0';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'sun': {
      halo(260, '#ffe066', 0.5);
      halo(140, '#fff6dc', 0.8);
      const sg = ctx.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, 60);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(1, '#ffe7a0');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  return c;
}

const cache = new Map<ThemeName, Promise<SceneArt>>();

export function sceneArt(name: ThemeName): Promise<SceneArt> {
  let p = cache.get(name);
  if (!p) {
    p = bakeScene(name);
    cache.set(name, p);
  }
  return p;
}

const SEEDS: Record<ThemeName, number> = { husk: 11, sinew: 23, throat: 37, heart: 41, dawn: 53 };

async function bakeScene(name: ThemeName): Promise<SceneArt> {
  const t = THEMES[name];
  const seed = SEEDS[name];
  const nebula = await bakeClouds(t, seed, 640, 180, { lo: 0.42, hi: 0.78, alpha: 0.85, hotMix: 0.9, wispy: false });
  const wisps = await bakeClouds(t, seed + 100, 640, 180, { lo: 0.55, hi: 0.8, alpha: 0.55, hotMix: 1, wispy: true });
  await yieldFrame();
  return {
    sky: bakeSky(t),
    nebula,
    wisps,
    carcass: bakeCarcass(t, seed + 200),
    body: bakeBody(t, seed + 300),
    wallTop: t.walls ? bakeWall(t, seed + 400, true) : null,
    wallBot: t.walls ? bakeWall(t, seed + 500, false) : null,
  };
}
