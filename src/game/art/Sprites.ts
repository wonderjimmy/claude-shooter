// Hand-authored, canvas-drawn character art for Carrion IX.
// Characters are split into parts (bodies, wings, blades, shards, shells…)
// that entities animate at runtime — every piece is baked once to a bitmap.
// All enemies face LEFT; the player faces RIGHT.

import { bakeDrawn, registerArt } from '../../core/Art';

type Ctx = CanvasRenderingContext2D;

const INK = '#0a070f';
const BONE_HI = '#fff6e0';
const BONE = '#e6d8b8';
const BONE_MID = '#b8a684';
const BONE_LO = '#6b5a44';
const CHITIN = '#2b2238';
const CHITIN_LO = '#140f1c';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: Array<[number, string]>, fx = x, fy = y): CanvasGradient {
  const g = ctx.createRadialGradient(fx, fy, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/** ctx.roundRect is missing on older Safari/Firefox — trace it ourselves. */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function outline(ctx: Ctx, w = 1.4, color = INK): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string, a = 1): void {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = rad(ctx, x, y, 0, r, [[0, '#ffffff'], [0.3, color], [1, 'rgba(0,0,0,0)']]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function flipY(ctx: Ctx, h: number, draw: (ctx: Ctx) => void): void {
  ctx.save();
  ctx.translate(0, h);
  ctx.scale(1, -1);
  draw(ctx);
  ctx.restore();
}

// ═══ PLAYER — the Vespertine ═════════════════════════════════════════════════

function plHull(ctx: Ctx): void {
  // Engine block.
  ctx.beginPath();
  roundRect(ctx, 4, 22, 20, 18, 5);
  ctx.fillStyle = lin(ctx, 0, 22, 0, 40, [[0, '#3a2f4a'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#9be7ff';
  ctx.fillRect(5, 27, 3, 8);

  // Dorsal spines.
  ctx.fillStyle = BONE_MID;
  for (const [x, h] of [[30, 9], [40, 7], [49, 5]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x - 7, 20 - h);
    ctx.lineTo(x + 5, 19);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1);
  }

  // Fuselage: a bone blade.
  ctx.beginPath();
  ctx.moveTo(132, 31);
  ctx.bezierCurveTo(114, 22, 84, 15, 54, 16);
  ctx.bezierCurveTo(36, 17, 22, 21, 14, 26);
  ctx.lineTo(14, 36);
  ctx.bezierCurveTo(22, 41, 36, 45, 54, 45);
  ctx.bezierCurveTo(84, 46, 114, 39, 132, 31);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 16, 0, 46, [[0, BONE_HI], [0.35, BONE], [0.75, BONE_MID], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 1.6);

  // Sinew keel along the belly.
  ctx.beginPath();
  ctx.moveTo(24, 38);
  ctx.bezierCurveTo(60, 44, 100, 40, 126, 32);
  ctx.strokeStyle = '#a83232';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.strokeStyle = '#e85dc9';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Panel seams.
  ctx.strokeStyle = 'rgba(10,7,15,0.55)';
  ctx.lineWidth = 0.9;
  for (const x of [58, 68, 104, 114]) {
    ctx.beginPath();
    ctx.moveTo(x, 18 + Math.abs(x - 85) * 0.02);
    ctx.lineTo(x - 3, 25);
    ctx.stroke();
  }

  // Canopy.
  ctx.beginPath();
  ctx.ellipse(86, 25, 18, 6, -0.07, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 70, 19, 90, 31, [[0, '#e8fdff'], [0.45, '#5dd9e8'], [1, '#15405a']]);
  ctx.fill();
  outline(ctx, 1.2);
  ctx.beginPath();
  ctx.ellipse(82, 22.5, 7, 1.6, -0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  // Nose lens.
  glowDot(ctx, 124, 31, 6, '#5dd9e8', 0.9);
}

function plWing(ctx: Ctx): void {
  // Root is at (60, 34); the tip sweeps back and out to the upper-left.
  ctx.beginPath();
  ctx.moveTo(64, 34);
  ctx.quadraticCurveTo(44, 12, 8, 2);
  ctx.lineTo(2, 7);
  ctx.quadraticCurveTo(18, 20, 26, 34);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 64, 34, 4, 4, [[0, 'rgba(93,217,232,0.55)'], [1, 'rgba(232,93,201,0.25)']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(155,231,255,0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Bone spars.
  ctx.strokeStyle = BONE;
  ctx.lineCap = 'round';
  for (const [x0, x1, y1, w] of [[62, 8, 3, 2.4], [52, 16, 12, 1.6], [42, 22, 22, 1.3]] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, 33);
    ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 12, x1, y1);
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.fillStyle = BONE_MID;
  ctx.beginPath();
  ctx.ellipse(60, 33, 6, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  outline(ctx, 1);
}

function plPod(ctx: Ctx): void {
  ctx.beginPath();
  roundRect(ctx, 2, 3, 28, 10, 5);
  ctx.fillStyle = lin(ctx, 0, 3, 0, 13, [[0, BONE_HI], [0.5, BONE_MID], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 1.1);
  ctx.fillStyle = '#1d1828';
  ctx.fillRect(10, 3.5, 3, 9);
  glowDot(ctx, 30, 8, 5, '#5dd9e8');
}

// ═══ WASP — sting-drone ═════════════════════════════════════════════════════

function waBody(ctx: Ctx): void {
  // Legs.
  ctx.strokeStyle = CHITIN_LO;
  ctx.lineWidth = 1.4;
  for (const x of [30, 38, 46]) {
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x + 4, 36);
    ctx.lineTo(x + 1, 42);
    ctx.stroke();
  }

  // Abdomen with bone bands and a hooked stinger.
  ctx.save();
  ctx.translate(66, 25);
  ctx.rotate(0.18);
  ctx.beginPath();
  ctx.ellipse(0, 0, 23, 11.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 0, -12, 0, 12, [[0, '#4a3d5e'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx);
  ctx.clip();
  ctx.fillStyle = BONE;
  for (const x of [-10, 0, 10]) {
    ctx.beginPath();
    ctx.ellipse(x, 0, 3.2, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(86, 28);
  ctx.quadraticCurveTo(96, 32, 92, 40);
  ctx.lineTo(88, 32);
  ctx.closePath();
  ctx.fillStyle = BONE;
  ctx.fill();
  outline(ctx, 1);

  // Thorax.
  ctx.beginPath();
  ctx.ellipse(38, 22, 13, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, 34, 17, 1, 14, [[0, '#5a4a70'], [1, CHITIN]]);
  ctx.fill();
  outline(ctx);

  // Head + mandibles.
  ctx.fillStyle = BONE;
  for (const dy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(12, 22 + dy * 3);
    ctx.quadraticCurveTo(2, 22 + dy * 5, 4, 22 + dy * 1);
    ctx.lineTo(10, 22 + dy * 1.5);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 0.9);
  }
  ctx.beginPath();
  ctx.arc(20, 22, 10, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, 18, 18, 1, 10, [[0, '#3a2f4a'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx);
  // Compound eye.
  ctx.beginPath();
  ctx.ellipse(16, 20, 6.5, 5.5, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, 14, 18, 0.5, 7, [[0, '#f4ffd0'], [0.4, '#a8e85d'], [1, '#2f5a14']]);
  ctx.fill();
  outline(ctx, 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(14, 18, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Antenna.
  ctx.beginPath();
  ctx.moveTo(22, 13);
  ctx.quadraticCurveTo(20, 4, 28, 1);
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function waWing(ctx: Ctx): void {
  // Root at (46, 20).
  ctx.beginPath();
  ctx.moveTo(46, 20);
  ctx.bezierCurveTo(34, 2, 10, 0, 3, 8);
  ctx.bezierCurveTo(10, 16, 30, 20, 46, 20);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 46, 20, 3, 6, [[0, 'rgba(155,231,255,0.5)'], [1, 'rgba(168,232,93,0.22)']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,255,255,0.75)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,255,255,0.45)';
  ctx.lineWidth = 0.6;
  for (const [x, y] of [[10, 6], [20, 5], [30, 8]] as const) {
    ctx.beginPath();
    ctx.moveTo(44, 19);
    ctx.quadraticCurveTo((44 + x) / 2, y + 8, x, y);
    ctx.stroke();
  }
}

// ═══ CYBORG — bone warden ═══════════════════════════════════════════════════

function cyBody(ctx: Ctx): void {
  // Thruster block at the back.
  ctx.beginPath();
  roundRect(ctx, 70, 26, 30, 28, 6);
  ctx.fillStyle = lin(ctx, 0, 26, 0, 54, [[0, '#3a2f4a'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#5dd9e8';
  for (const y of [32, 40, 48]) ctx.fillRect(94, y - 1, 5, 2);

  // Jaw with teeth.
  ctx.beginPath();
  ctx.moveTo(12, 48);
  ctx.quadraticCurveTo(30, 70, 62, 66);
  ctx.lineTo(70, 52);
  ctx.closePath();
  ctx.fillStyle = CHITIN;
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = BONE;
  for (let i = 0; i < 6; i++) {
    const x = 18 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x, 50 + i * 0.6);
    ctx.lineTo(x + 3, 57 + i * 0.6);
    ctx.lineTo(x + 6, 51 + i * 0.6);
    ctx.fill();
  }

  // Skull carapace.
  ctx.beginPath();
  ctx.moveTo(8, 46);
  ctx.bezierCurveTo(6, 22, 30, 6, 56, 8);
  ctx.bezierCurveTo(78, 10, 92, 24, 88, 46);
  ctx.bezierCurveTo(70, 52, 30, 54, 8, 46);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 8, 0, 52, [[0, BONE_HI], [0.4, BONE], [0.8, BONE_MID], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 1.6);

  // Plate seams + rivets.
  ctx.strokeStyle = 'rgba(10,7,15,0.5)';
  ctx.lineWidth = 1;
  for (const x of [34, 58, 76]) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.quadraticCurveTo(x - 6, 30, x - 2, 50);
    ctx.stroke();
  }
  ctx.fillStyle = BONE_LO;
  for (const [x, y] of [[40, 16], [64, 18], [70, 38], [46, 44]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Visor slit.
  ctx.beginPath();
  roundRect(ctx, 12, 30, 40, 9, 4.5);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, 15, 32.5, 34, 4, 2);
  ctx.fillStyle = lin(ctx, 15, 0, 49, 0, [[0, '#e8fdff'], [0.5, '#5dd9e8'], [1, '#1b4e6b']]);
  ctx.fill();
}

function cyRing(ctx: Ctx): void {
  const cx = 44, cy = 44;
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI * 2 + 0.08;
    const a1 = a0 + (Math.PI * 2) / 9 - 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 40, a0, a1);
    ctx.arc(cx, cy, 33, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = i % 3 === 0 ? BONE : BONE_MID;
    ctx.fill();
    outline(ctx, 1);
    if (i % 3 === 0) glowDot(ctx, cx + Math.cos((a0 + a1) / 2) * 36.5, cy + Math.sin((a0 + a1) / 2) * 36.5, 5, '#5dd9e8');
  }
}

// ═══ BRAIN — psi medusa ═════════════════════════════════════════════════════

function brBell(ctx: Ctx): void {
  const r = rng(7);
  // Bell outline: dome with a scalloped skirt.
  const bell = () => {
    ctx.beginPath();
    ctx.moveTo(6, 52);
    ctx.bezierCurveTo(2, 14, 30, 2, 52, 2);
    ctx.bezierCurveTo(78, 2, 104, 16, 98, 52);
    for (let i = 0; i <= 8; i++) {
      const x = 98 - i * 11.5;
      ctx.quadraticCurveTo(x - 5.75, 62 + (i % 2) * 3, x - 11.5, 52);
    }
    ctx.closePath();
  };
  bell();
  ctx.fillStyle = rad(ctx, 50, 40, 4, 60, [[0, '#ffd8f6'], [0.4, '#e85dc9'], [1, '#5a1454']], 40, 18);
  ctx.fill();
  outline(ctx, 1.6);

  // Brain folds.
  ctx.save();
  bell();
  ctx.clip();
  ctx.strokeStyle = 'rgba(90,20,84,0.75)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = 10 + r() * 84, y = 8 + r() * 40;
    ctx.lineWidth = 1 + r() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 20, x + (r() - 0.5) * 30, y + (r() - 0.5) * 20, x + (r() - 0.5) * 24, y + (r() - 0.5) * 16);
    ctx.stroke();
  }
  // Midline fissure.
  ctx.strokeStyle = 'rgba(60,10,56,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(52, 3);
  ctx.bezierCurveTo(46, 18, 58, 30, 52, 52);
  ctx.stroke();
  // Rim light.
  ctx.strokeStyle = 'rgba(255,220,250,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(52, 58, 52, Math.PI * 1.15, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();

  // Psi eye.
  ctx.beginPath();
  ctx.ellipse(34, 44, 11, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff0fb';
  ctx.fill();
  outline(ctx, 1.2);
  ctx.beginPath();
  ctx.arc(31, 44, 6, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, 31, 44, 0.5, 6, [[0, '#ffb0f0'], [1, '#8a1a7a']]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(30, 44, 1.6, 4.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(28.5, 41.5, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

// ═══ MANTIS — reaper ════════════════════════════════════════════════════════

function maBody(ctx: Ctx): void {
  // Legs.
  ctx.strokeStyle = CHITIN_LO;
  ctx.lineWidth = 1.8;
  for (const x of [48, 58, 70]) {
    ctx.beginPath();
    ctx.moveTo(x, 36);
    ctx.lineTo(x + 8, 50);
    ctx.lineTo(x + 2, 60);
    ctx.stroke();
  }

  // Abdomen.
  ctx.save();
  ctx.translate(88, 36);
  ctx.rotate(0.12);
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 0, -12, 0, 12, [[0, '#7a4a38'], [0.5, '#4a2a2e'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx);
  ctx.clip();
  ctx.strokeStyle = '#ff8a3d';
  ctx.lineWidth = 1.2;
  for (const x of [-18, -6, 6, 18]) {
    ctx.beginPath();
    ctx.moveTo(x, -13);
    ctx.quadraticCurveTo(x + 3, 0, x, 13);
    ctx.stroke();
  }
  ctx.restore();

  // Neck / thorax.
  ctx.beginPath();
  ctx.moveTo(24, 26);
  ctx.quadraticCurveTo(44, 20, 62, 30);
  ctx.quadraticCurveTo(44, 40, 24, 34);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 20, 0, 40, [[0, BONE], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx);

  // Triangular head.
  ctx.beginPath();
  ctx.moveTo(4, 30);
  ctx.lineTo(24, 16);
  ctx.quadraticCurveTo(32, 26, 26, 40);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 4, 16, 28, 40, [[0, BONE_HI], [1, BONE_MID]]);
  ctx.fill();
  outline(ctx, 1.4);
  for (const [x, y] of [[17, 23], [18, 33]] as const) {
    ctx.beginPath();
    ctx.ellipse(x, y, 4.5, 3.2, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = rad(ctx, x - 1, y - 1, 0.3, 5, [[0, '#fff2d0'], [0.4, '#ff8a3d'], [1, '#7a2a10']]);
    ctx.fill();
  }
}

function maScythe(ctx: Ctx): void {
  // Shoulder root at (70, 20); blade tip at (4, 26).
  ctx.beginPath();
  ctx.moveTo(72, 20);
  ctx.lineTo(46, 12);
  ctx.strokeStyle = BONE_MID;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(46, 12, 4, 0, Math.PI * 2);
  ctx.fillStyle = BONE;
  ctx.fill();
  outline(ctx, 1);

  // Crescent blade.
  ctx.beginPath();
  ctx.moveTo(48, 10);
  ctx.bezierCurveTo(30, 2, 10, 6, 2, 26);
  ctx.bezierCurveTo(14, 16, 30, 16, 44, 18);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 48, 6, 4, 26, [[0, BONE_HI], [0.6, BONE], [1, BONE_MID]]);
  ctx.fill();
  outline(ctx, 1.3);
  // Serrations along the inner edge.
  ctx.fillStyle = BONE_LO;
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.15;
    const x = 44 - t * 40, y = 18 - t * 2 + t * t * 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 4);
    ctx.lineTo(x - 5, y);
    ctx.fill();
  }
  // Hot edge.
  ctx.beginPath();
  ctx.moveTo(46, 9);
  ctx.bezierCurveTo(30, 2.5, 10, 6.5, 3, 25);
  ctx.strokeStyle = '#ff8a3d';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

// ═══ CRYSTAL — shard choir ══════════════════════════════════════════════════

function crCore(ctx: Ctx): void {
  const cx = 38, cy = 38, R = 32;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? R * 0.92 : R;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const shades = ['#e8fdff', '#9be7ff', '#5dd9e8', '#1b4e6b', '#0e2a3d', '#3aa8c0'];
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % 6]!;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.lineTo(nx, ny);
    ctx.closePath();
    ctx.fillStyle = shades[i]!;
    ctx.fill();
  });
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  outline(ctx, 1.6, '#0a1a24');
  ctx.strokeStyle = 'rgba(232,253,255,0.7)';
  ctx.lineWidth = 1;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  glowDot(ctx, cx, cy, 16, '#9be7ff');
}

function crShard(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(19, 16);
  ctx.lineTo(10, 44);
  ctx.lineTo(1, 16);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 1, 0, 19, 44, [[0, '#e8fdff'], [0.5, '#5dd9e8'], [1, '#0e2a3d']]);
  ctx.fill();
  outline(ctx, 1.1, '#0a1a24');
  ctx.beginPath();
  ctx.moveTo(10, 2);
  ctx.lineTo(10, 40);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// ═══ BOSS — Carrion IX, Mother of Engines ═══════════════════════════════════
// Local frame: art centre = boss origin offset noted where each part is placed.

function boBack(ctx: Ctx): void {
  const W = 560, H = 640, cy = H / 2;
  const spineX = 470;
  const r = rng(99);

  // Membranes between ribs.
  const ribEnd = (i: number): [number, number] => [150 + Math.abs(i) * 22, cy + i * 58];
  const ribCtrl = (i: number): [number, number] => [360, cy + i * 70];
  for (let i = -5; i < 5; i++) {
    if (i === -1 || i === 0) continue;
    const a = i, b = i + 1;
    ctx.beginPath();
    ctx.moveTo(spineX, cy + a * 52);
    ctx.quadraticCurveTo(...ribCtrl(a), ...ribEnd(a));
    ctx.lineTo(...ribEnd(b));
    ctx.quadraticCurveTo(...ribCtrl(b), spineX, cy + b * 52);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, spineX, 0, 150, 0, [[0, 'rgba(58,10,18,0.9)'], [1, 'rgba(110,24,40,0.55)']]);
    ctx.fill();
    // Veins in the membrane.
    ctx.strokeStyle = 'rgba(232,93,201,0.35)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const t = r();
      ctx.beginPath();
      ctx.moveTo(spineX - 20, cy + (a + t) * 52);
      ctx.quadraticCurveTo(300, cy + (a + t) * 66, 190 + Math.abs(a) * 20, cy + (a + t) * 58);
      ctx.stroke();
    }
  }

  // Ribs.
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const [ex, ey] = ribEnd(i);
    const [qx, qy] = ribCtrl(i);
    const draw = () => {
      ctx.beginPath();
      ctx.moveTo(spineX, cy + i * 52);
      ctx.quadraticCurveTo(qx, qy, ex, ey);
      ctx.quadraticCurveTo(ex - 16, ey - Math.sign(i) * 14, ex - 10, ey - Math.sign(i) * 34);
    };
    draw();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 17 - Math.abs(i);
    ctx.stroke();
    draw();
    ctx.strokeStyle = lin(ctx, spineX, 0, ex, 0, [[0, BONE_MID], [0.5, BONE], [1, BONE_HI]]);
    ctx.lineWidth = 12 - Math.abs(i);
    ctx.stroke();
    draw();
    ctx.strokeStyle = 'rgba(255,246,224,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Vertebral column.
  for (let y = 30; y < H - 20; y += 26) {
    const w = 46 - Math.abs(y - cy) * 0.04;
    ctx.beginPath();
    roundRect(ctx, spineX - w / 2, y, w, 22, 8);
    ctx.fillStyle = lin(ctx, spineX - w / 2, 0, spineX + w / 2, 0, [[0, BONE_HI], [0.6, BONE_MID], [1, BONE_LO]]);
    ctx.fill();
    outline(ctx, 1.5);
    // Spinous process.
    ctx.beginPath();
    ctx.moveTo(spineX + w / 2 - 2, y + 4);
    ctx.lineTo(spineX + w / 2 + 34, y + 14);
    ctx.lineTo(spineX + w / 2 - 2, y + 18);
    ctx.fillStyle = BONE_MID;
    ctx.fill();
    outline(ctx, 1.2);
  }

  // Engines buried in the spine.
  for (const y of [cy - 190, cy - 60, cy + 60, cy + 190]) {
    ctx.beginPath();
    ctx.arc(spineX, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    glowDot(ctx, spineX, y, 20, '#e85dc9');
  }
  void W;
}

function boShell(ctx: Ctx): void {
  // Upper carapace half. Hinge at the right (x≈300, y≈190); lip at the bottom.
  ctx.beginPath();
  ctx.moveTo(300, 196);
  ctx.bezierCurveTo(290, 60, 180, 6, 90, 20);
  ctx.bezierCurveTo(30, 30, 4, 110, 10, 196);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 10, 0, 196, [[0, BONE_HI], [0.35, BONE], [0.8, BONE_MID], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 2.4);

  // Armor plate ridges.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(10,7,15,0.45)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(310, 210, 50 + i * 48, Math.PI, Math.PI * 1.5);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,246,224,0.5)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(310, 212, 50 + i * 48, Math.PI, Math.PI * 1.5);
    ctx.stroke();
  }
  // Glyph channels glowing cyan.
  ctx.strokeStyle = '#5dd9e8';
  ctx.lineWidth = 2;
  for (const [x0, y0, x1, y1] of [[60, 150, 110, 110], [110, 110, 170, 120], [150, 70, 210, 60]] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
  // Lip teeth.
  ctx.fillStyle = BONE_HI;
  for (let x = 24; x < 290; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, 194);
    ctx.lineTo(x + 8, 210);
    ctx.lineTo(x + 16, 194);
    ctx.fill();
    outline(ctx, 1);
  }
  // Rivets.
  ctx.fillStyle = BONE_LO;
  for (const [x, y] of [[80, 60], [140, 40], [220, 70], [260, 140], [60, 120]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function boCore(ctx: Ctx): void {
  const c = 95;
  const r = rng(5);
  // Fleshy socket.
  ctx.beginPath();
  ctx.arc(c, c, 92, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, c, c, 40, 92, [[0, '#7a1420'], [0.7, '#3a0810'], [1, '#12030a']]);
  ctx.fill();
  outline(ctx, 2);
  ctx.strokeStyle = 'rgba(255,90,110,0.5)';
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    ctx.lineWidth = 1 + r() * 1.5;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 90, c + Math.sin(a) * 90);
    ctx.quadraticCurveTo(c + Math.cos(a + 0.3) * 75, c + Math.sin(a + 0.3) * 75, c + Math.cos(a) * 64, c + Math.sin(a) * 64);
    ctx.stroke();
  }
  // Iris.
  ctx.beginPath();
  ctx.arc(c, c, 62, 0, Math.PI * 2);
  ctx.fillStyle = rad(ctx, c, c, 10, 62, [[0, '#ffe0a8'], [0.3, '#ff8a3d'], [0.65, '#e85dc9'], [0.92, '#5a1454'], [1, '#1a0410']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,200,0.35)';
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    ctx.lineWidth = 0.6 + r();
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 20, c + Math.sin(a) * 20);
    ctx.lineTo(c + Math.cos(a + 0.05) * (46 + r() * 14), c + Math.sin(a + 0.05) * (46 + r() * 14));
    ctx.stroke();
  }
  // Slit pupil.
  ctx.beginPath();
  ctx.ellipse(c, c, 10, 44, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c - 20, c - 26, 12, 6, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}

function boPod(ctx: Ctx): void {
  // Sinew tubes trailing right.
  ctx.strokeStyle = '#5a1420';
  ctx.lineWidth = 6;
  for (const dy of [-10, 10]) {
    ctx.beginPath();
    ctx.moveTo(84, 38 + dy);
    ctx.bezierCurveTo(100, 38 + dy * 2, 110, 38 + dy, 124, 38 + dy * 1.5);
    ctx.stroke();
  }
  // Barrel.
  ctx.beginPath();
  roundRect(ctx, 0, 30, 44, 16, 4);
  ctx.fillStyle = lin(ctx, 0, 30, 0, 46, [[0, '#4a3d5e'], [1, CHITIN_LO]]);
  ctx.fill();
  outline(ctx, 1.4);
  ctx.beginPath();
  ctx.arc(4, 38, 7, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.strokeStyle = '#5dd9e8';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Housing.
  ctx.beginPath();
  ctx.moveTo(30, 38);
  ctx.bezierCurveTo(30, 6, 70, 2, 92, 14);
  ctx.bezierCurveTo(104, 24, 104, 52, 92, 62);
  ctx.bezierCurveTo(70, 74, 30, 70, 30, 38);
  ctx.closePath();
  ctx.fillStyle = lin(ctx, 0, 4, 0, 72, [[0, BONE_HI], [0.4, BONE], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 2);
  ctx.strokeStyle = 'rgba(10,7,15,0.45)';
  ctx.lineWidth = 1.4;
  for (const x of [50, 68, 84]) {
    ctx.beginPath();
    ctx.moveTo(x, 8 + (x - 50) * 0.1);
    ctx.quadraticCurveTo(x - 8, 38, x, 68 - (x - 50) * 0.1);
    ctx.stroke();
  }
  glowDot(ctx, 62, 38, 14, '#5dd9e8');
  ctx.beginPath();
  ctx.arc(62, 38, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#e8fdff';
  ctx.fill();
}

function boArmSeg(ctx: Ctx): void {
  ctx.beginPath();
  roundRect(ctx, 2, 4, 40, 16, 8);
  ctx.fillStyle = lin(ctx, 0, 4, 0, 20, [[0, BONE_HI], [0.5, BONE_MID], [1, BONE_LO]]);
  ctx.fill();
  outline(ctx, 1.4);
  ctx.beginPath();
  ctx.arc(40, 12, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#5a1420';
  ctx.fill();
  outline(ctx, 1.1);
  ctx.strokeStyle = 'rgba(10,7,15,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 5);
  ctx.lineTo(12, 19);
  ctx.moveTo(26, 5);
  ctx.lineTo(24, 19);
  ctx.stroke();
}

function boClaw(ctx: Ctx): void {
  // Base (joint) at the right (54, 18); talons hook left.
  ctx.fillStyle = lin(ctx, 0, 0, 0, 36, [[0, BONE_HI], [1, BONE_MID]]);
  for (const dy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(54, 18);
    ctx.bezierCurveTo(34, 18 + dy * 18, 10, 18 + dy * 18, 2, 18 + dy * 4);
    ctx.bezierCurveTo(14, 18 + dy * 8, 30, 18 + dy * 6, 44, 18);
    ctx.closePath();
    ctx.fill();
    outline(ctx, 1.3);
  }
  ctx.beginPath();
  ctx.arc(48, 18, 8, 0, Math.PI * 2);
  ctx.fillStyle = BONE_MID;
  ctx.fill();
  outline(ctx, 1.2);
  glowDot(ctx, 14, 18, 8, '#e85dc9');
}

// ═══ registry ═══════════════════════════════════════════════════════════════

interface Def { w: number; h: number; draw: (ctx: Ctx) => void; glow?: boolean; white?: boolean; bakeMul?: number }

const ENEMY = { glow: true, white: true, bakeMul: 1.35 };

const DRAWN = {
  plHull: { w: 136, h: 50, draw: plHull, glow: true, white: true },
  plWingT: { w: 68, h: 38, draw: plWing, glow: true, white: true },
  plWingB: { w: 68, h: 38, draw: (c: Ctx) => flipY(c, 38, plWing), glow: true, white: true },
  plPod: { w: 34, h: 16, draw: plPod, glow: true, white: true },

  waBody: { w: 98, h: 44, draw: waBody, ...ENEMY },
  waWing: { w: 48, h: 22, draw: waWing, glow: true, bakeMul: 1.35 },
  cyBody: { w: 102, h: 70, draw: cyBody, ...ENEMY },
  cyRing: { w: 88, h: 88, draw: cyRing, ...ENEMY },
  brBell: { w: 104, h: 66, draw: brBell, ...ENEMY },
  maBody: { w: 122, h: 62, draw: maBody, ...ENEMY },
  maScytheT: { w: 76, h: 30, draw: maScythe, ...ENEMY },
  maScytheB: { w: 76, h: 30, draw: (c: Ctx) => flipY(c, 30, maScythe), ...ENEMY },
  crCore: { w: 76, h: 76, draw: crCore, ...ENEMY },
  crShard: { w: 20, h: 44, draw: crShard, ...ENEMY },

  boBack: { w: 560, h: 640, draw: boBack, glow: true, white: true },
  boShellT: { w: 310, h: 212, draw: boShell, glow: true, white: true },
  boShellB: { w: 310, h: 212, draw: (c: Ctx) => flipY(c, 212, boShell), glow: true, white: true },
  boCore: { w: 190, h: 190, draw: boCore, glow: true, white: true },
  boPod: { w: 126, h: 76, draw: boPod, glow: true, white: true },
  boArmSeg: { w: 48, h: 24, draw: boArmSeg, glow: false, white: true },
  boClaw: { w: 58, h: 36, draw: boClaw, glow: true, white: true },
} satisfies Record<string, Def>;

export type DrawnKey = keyof typeof DRAWN;

/**
 * Pivots, as offsets from each part's centre, for parts that rotate around a
 * joint rather than their middle. Includes the bake padding symmetrically, so
 * it's just (joint − size/2).
 */
export const PIVOT = {
  plWingT: [60 - 34, 34 - 19],
  plWingB: [60 - 34, (38 - 34) - 19],
  waWing: [46 - 24, 20 - 11],
  maScytheT: [72 - 38, 20 - 15],
  maScytheB: [72 - 38, (30 - 20) - 15],
  boShellT: [300 - 155, 196 - 106],
  boShellB: [300 - 155, (212 - 196) - 106],
  boArmSeg: [4 - 24, 0],
  boClaw: [54 - 29, 0],
} as const satisfies Partial<Record<DrawnKey, readonly [number, number]>>;

export async function bakeSprites(onStep?: () => void): Promise<void> {
  for (const [key, d] of Object.entries(DRAWN) as Array<[DrawnKey, Def]>) {
    registerArt(key, bakeDrawn(d.w, d.h, d.draw, { glow: d.glow, white: d.white, bakeMul: d.bakeMul }));
    onStep?.();
    await new Promise((r) => setTimeout(r, 0));
  }
}

export const DRAWN_COUNT = Object.keys(DRAWN).length;
