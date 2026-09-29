import { STAGE } from '../../config';
import type { Rig } from '../art/Rig';
import type { Game } from '../Game';
import type { Renderer } from '../Renderer';
import { Bullet, type BulletSpec } from './Bullet';

// CARRION IX — Mother of Engines.
// A ribcage the size of a cathedral, a heart-eye inside it.
//   Phase 1 "Carapace":  core sealed under two shells. Destroy both turret pods.
//   Phase 2 "Unsealed":  shells split open, four bone arms unfurl, the eye fires its lance.
//   Phase 3 "Heart of Engines": shells blown off, the heart races — rings, spirals, whipping claws.

export type BossStage = 1 | 2 | 3;

export const BOSS_HP = { pod: 80, core2: 150, core3: 150 } as const;

const ORB: BulletSpec = { art: 'projBoss', radius: 6 };
const ORB_SMALL: BulletSpec = { art: 'projBoss', scale: 0.8, radius: 5 };
const ORB_PINK: BulletSpec = { art: 'projBossPink', radius: 6 };

const CORE: [number, number] = [30, 0];
const HINGE_T: [number, number] = [150, -6];
const HINGE_B: [number, number] = [150, 6];
const POD_REST: Array<[number, number]> = [[-130, -210], [-130, 210]];
const ARM_ROOTS: Array<{ at: [number, number]; base: number; ph: number }> = [
  { at: [90, -140], base: Math.PI + 0.28, ph: 0 },
  { at: [90, 140], base: Math.PI - 0.28, ph: 1.7 },
  { at: [150, -210], base: Math.PI + 0.5, ph: 3.1 },
  { at: [150, 210], base: Math.PI - 0.5, ph: 4.4 },
];
const ARM_SEGS = 6;
const SEG_LEN = 38;

const LASER_COOLDOWN = 230;
const LASER_CHARGE = 62;
const LASER_FIRE = 52;
const LASER_LENGTH = STAGE.width * 1.6;
const LASER_HALF = 22;
const ENTRY_FRAMES = 120;
const TRANSITION = 80;

interface Pod { hp: number; max: number; alive: boolean; x: number; y: number; timer: number; flash: number }

export interface BossTarget { id: 'pod0' | 'pod1' | 'core'; x: number; y: number; r: number }

export class Boss {
  x = STAGE.width + 460;
  y = STAGE.height / 2;
  dead = false;
  stage: BossStage = 1;
  hp: number;
  /** Invulnerability frames (entry, transitions). */
  shielded = ENTRY_FRAMES;

  private t = 0;
  private entry = ENTRY_FRAMES;
  private readonly startX = STAGE.width + 460;
  private readonly cx = STAGE.width - 300;
  private readonly cy = STAGE.height / 2;
  private readonly pods: Pod[];
  private coreFlash = 0;
  private shellOpen = 0;
  private shellsGone = false;
  private armGrow = 0;
  private fanTimer = 120;
  private fireTimer = 60;
  private burstLeft = 0;
  private burstTimer = 0;
  private clawTimer = 90;
  private clawIdx = 0;
  private spiral = 0;
  private spiralTimer = 0;
  private beat = 0;

  private laser: 'idle' | 'charge' | 'fire' = 'idle';
  private laserTimer = 0;
  private laserCooldown: number;
  private laserAngle = 0;
  private laserX = 0;
  private laserY = 0;

  constructor(private game: Game) {
    const m = game.muls.bossHp;
    const podHp = Math.ceil(BOSS_HP.pod * m);
    this.pods = POD_REST.map(() => ({ hp: podHp, max: podHp, alive: true, x: 0, y: 0, timer: 0, flash: 0 }));
    this.pods[1]!.timer = 40;
    this.hp = Math.ceil(BOSS_HP.core2 * m);
    this.laserCooldown = (LASER_COOLDOWN + 60) * game.muls.bossFire;
    this.placePods();
  }

  // ── HP bookkeeping for the HUD ────────────────────────────────────────────

  private get podMaxTotal(): number { return this.pods.reduce((s, p) => s + p.max, 0); }
  private get c2(): number { return Math.ceil(BOSS_HP.core2 * this.game.muls.bossHp); }
  private get c3(): number { return Math.ceil(BOSS_HP.core3 * this.game.muls.bossHp); }

  get totalMaxHp(): number { return this.podMaxTotal + this.c2 + this.c3; }

  get totalHp(): number {
    if (this.stage === 1) return this.pods.reduce((s, p) => s + Math.max(0, p.hp), 0) + this.c2 + this.c3;
    if (this.stage === 2) return Math.max(0, this.hp) + this.c3;
    return Math.max(0, this.hp);
  }

  get phaseMarks(): number[] {
    const total = this.totalMaxHp;
    return [this.c3 / total, (this.c3 + this.c2) / total];
  }

  get entering(): boolean { return this.entry > 0; }

  /** Local (boss-space) → world. */
  private w(lx: number, ly: number): [number, number] { return [this.x + lx, this.y + ly]; }

  // ── collision geometry ────────────────────────────────────────────────────

  targets(): BossTarget[] {
    if (this.entering || this.dead) return [];
    if (this.stage === 1) {
      const out: BossTarget[] = [];
      this.pods.forEach((p, i) => { if (p.alive) out.push({ id: i ? 'pod1' : 'pod0', x: p.x, y: p.y, r: 44 }); });
      return out;
    }
    const [x, y] = this.w(...CORE);
    return [{ id: 'core', x, y, r: this.stage === 3 ? 86 : 72 }];
  }

  /** Solid carcass: absorbs shots that miss a weak point. */
  armor(): { x: number; y: number; r: number } {
    const [x, y] = this.w(90, 0);
    return { x, y, r: 185 };
  }

  rams(px: number, py: number, pr: number): boolean {
    if (this.entering || this.dead) return false;
    const [x, y] = this.w(110, 0);
    if (Math.hypot(px - x, py - y) < pr + 150) return true;
    return this.stage === 1 && this.pods.some((p) => p.alive && Math.hypot(px - p.x, py - p.y) < pr + 34);
  }

  laserHits(px: number, py: number, pr: number): boolean {
    if (this.laser !== 'fire') return false;
    const dx = px - this.laserX, dy = py - this.laserY;
    const c = Math.cos(-this.laserAngle), s = Math.sin(-this.laserAngle);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    return rx > -20 && rx < LASER_LENGTH && Math.abs(ry) < LASER_HALF + pr;
  }

  // ── update ────────────────────────────────────────────────────────────────

  private placePods(): void {
    this.pods.forEach((p, i) => {
      const [rx, ry] = POD_REST[i]!;
      const bob = Math.sin(this.t * 0.04 + i * 2) * 14;
      [p.x, p.y] = this.w(rx + Math.cos(this.t * 0.03 + i) * 10, ry + bob);
    });
  }

  update(dt: number): void {
    this.t += dt;
    this.beat += dt * (this.stage === 3 ? (this.desperate ? 0.2 : 0.14) : 0.08);
    if (this.coreFlash > 0) this.coreFlash -= dt;
    if (this.shielded > 0) this.shielded -= dt;
    for (const p of this.pods) if (p.flash > 0) p.flash -= dt;

    if (this.dead) {
      this.x = this.cx + (Math.random() - 0.5) * 14;
      this.y = this.cy + (Math.random() - 0.5) * 14;
      this.coreFlash = 2;
      return;
    }

    if (this.entry > 0) {
      this.entry -= dt;
      const k = 1 - Math.max(0, this.entry) / ENTRY_FRAMES;
      this.x = this.startX + (this.cx - this.startX) * (1 - Math.pow(1 - k, 3));
      this.placePods();
      return;
    }

    const wob = this.stage === 3 ? 1.5 : 1;
    this.y = this.cy + Math.sin(this.t * 0.028) * 36 * wob;
    this.x = this.cx + Math.cos(this.t * 0.021) * 18 * wob;
    this.placePods();

    const open = this.stage >= 2 ? 1 : 0;
    this.shellOpen += (open - this.shellOpen) * Math.min(1, 0.05 * dt);
    this.armGrow += (open - this.armGrow) * Math.min(1, 0.03 * dt);

    if (this.shielded > 0) return;

    if (this.stage === 1) this.phase1(dt);
    else if (this.stage === 2) this.phase2(dt);
    else this.phase3(dt);

    this.updateLaser(dt);
  }

  private get desperate(): boolean { return this.stage === 3 && this.hp < this.c3 * 0.4; }

  private emit(x: number, y: number, a: number, sp: number, spec: BulletSpec): void {
    this.game.enemyBullets.push(new Bullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, spec));
  }

  private aim(x: number, y: number): number {
    const p = this.game.player;
    return Math.atan2(p.y - y, p.x - x);
  }

  private phase1(dt: number): void {
    const bf = this.game.muls.bossFire;
    const bs = this.game.muls.bulletSpeed;
    const alive = this.pods.filter((p) => p.alive).length;
    for (const p of this.pods) {
      if (!p.alive) continue;
      p.timer -= dt;
      if (p.timer <= 0) {
        p.timer = 78 * bf * (alive === 1 ? 0.65 : 1);
        const mx = p.x - 58, my = p.y;
        const a = this.aim(mx, my);
        for (const o of [-0.13, 0, 0.13]) this.emit(mx, my, a + o, 5.2 * bs, ORB_PINK);
        this.game.fx.emit(mx, my, { count: 8, speed: [1, 4], life: [6, 12], size: [3, 5], color: '#5dd9e8' });
      }
    }
    this.fanTimer -= dt;
    if (this.fanTimer <= 0) {
      this.fanTimer = 150 * bf;
      const [x, y] = this.w(-40, 0);
      for (let i = -3; i <= 3; i++) this.emit(x, y, Math.PI + i * 0.16, 3.4 * bs, ORB);
      this.game.audio.play('hit', { volume: 0.4, rate: 0.55 });
    }
  }

  private phase2(dt: number): void {
    const bf = this.game.muls.bossFire;
    const bs = this.game.muls.bulletSpeed;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        const [x, y] = this.w(CORE[0] - 30, (this.burstLeft % 2 ? -1 : 1) * 64);
        this.emit(x, y, this.aim(x, y), 6 * bs, ORB_PINK);
        this.burstLeft--;
        this.burstTimer = 6;
      }
    }
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.burstLeft === 0) {
      this.fireTimer = 110 * bf;
      this.burstLeft = 4;
      this.burstTimer = 0;
    }
    this.clawFire(dt, 105 * bf, 1);
  }

  private phase3(dt: number): void {
    const bf = this.game.muls.bossFire;
    const bs = this.game.muls.bulletSpeed;
    const [x, y] = this.w(...CORE);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 36 * bf * (this.desperate ? 1.4 : 1);
      const n = this.desperate ? 8 : 10;
      const ph = this.t * 0.04;
      for (let i = 0; i < n; i++) this.emit(x, y, (i / n) * Math.PI * 2 + ph, 4 * bs, ORB_SMALL);
      this.emit(x, y, this.aim(x, y), 6 * bs, { ...ORB, scale: 1.1, radius: 7 });
    }
    if (this.desperate) {
      this.spiralTimer -= dt;
      if (this.spiralTimer <= 0) {
        this.spiralTimer = 7 * bf;
        this.spiral += 0.37;
        for (const off of [0, Math.PI]) this.emit(x, y, this.spiral + off, 3.1 * bs, ORB_PINK);
      }
    }
    this.clawFire(dt, 80 * bf, 2);
  }

  private clawFire(dt: number, interval: number, shots: number): void {
    this.clawTimer -= dt;
    if (this.clawTimer > 0 || this.armGrow < 0.9) return;
    this.clawTimer = interval / ARM_ROOTS.length;
    const [x, y] = this.armChain(this.clawIdx % ARM_ROOTS.length).tip;
    this.clawIdx++;
    const a = this.aim(x, y);
    const bs = this.game.muls.bulletSpeed;
    if (shots === 1) this.emit(x, y, a, 4.6 * bs, ORB_SMALL);
    else for (const o of [-0.1, 0.1]) this.emit(x, y, a + o, 4.6 * bs, ORB_SMALL);
    this.game.fx.emit(x, y, { count: 6, speed: [1, 3], life: [6, 12], size: [2, 4], color: '#e85dc9' });
  }

  private updateLaser(dt: number): void {
    if (this.stage !== 2) { this.laser = 'idle'; return; }
    const p = this.game.player;
    if (this.laser === 'idle') {
      this.laserCooldown -= dt;
      if (this.laserCooldown <= 0) { this.laser = 'charge'; this.laserTimer = LASER_CHARGE; }
    } else if (this.laser === 'charge') {
      this.laserTimer -= dt;
      [this.laserX, this.laserY] = this.w(CORE[0] - 30, CORE[1]);
      // Stop tracking for the last 12 frames so the dodge window is honest.
      if (this.laserTimer > 12) this.laserAngle = Math.atan2(p.y - this.laserY, p.x - this.laserX);
      if (this.laserTimer <= 0) {
        this.laser = 'fire';
        this.laserTimer = LASER_FIRE;
        this.game.shake.add(0.35);
        this.game.audio.play('bossPhase', { volume: 0.6, rate: 1.4 });
      }
    } else {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laser = 'idle';
        this.laserCooldown = LASER_COOLDOWN * this.game.muls.bossFire;
      }
    }
  }

  // ── damage ────────────────────────────────────────────────────────────────

  damage(id: BossTarget['id'], amount: number): 'none' | 'hit' | 'part' | 'phase' | 'dead' {
    if (this.shielded > 0 || this.dead) return 'none';
    if (id === 'pod0' || id === 'pod1') {
      const pod = this.pods[id === 'pod0' ? 0 : 1]!;
      if (!pod.alive) return 'none';
      pod.hp -= amount;
      pod.flash = 3;
      if (pod.hp > 0) return 'hit';
      pod.alive = false;
      this.game.fx.debris('boPod', pod.x, pod.y, -2 + Math.random() * 2, pod.y < this.y ? -3 : 2, { life: 90, spin: 0.08 });
      if (this.pods.some((p) => p.alive)) return 'part';
      this.enterStage(2);
      return 'phase';
    }
    this.hp -= amount;
    this.coreFlash = 3;
    if (this.hp > 0) return 'hit';
    if (this.stage === 2) {
      this.enterStage(3);
      return 'phase';
    }
    this.dead = true;
    return 'dead';
  }

  podPosition(id: BossTarget['id']): [number, number] {
    const p = this.pods[id === 'pod1' ? 1 : 0]!;
    return [p.x, p.y];
  }

  private enterStage(s: BossStage): void {
    this.stage = s;
    this.shielded = TRANSITION;
    this.fireTimer = 50;
    this.burstLeft = 0;
    this.laser = 'idle';
    this.laserCooldown = (LASER_COOLDOWN + 60) * this.game.muls.bossFire;
    this.hp = s === 2 ? this.c2 : this.c3;
    if (s === 3) {
      this.shellsGone = true;
      const [tx, ty] = this.w(HINGE_T[0] - 145, HINGE_T[1] - 90);
      const [bx, by] = this.w(HINGE_B[0] - 145, HINGE_B[1] + 90);
      this.game.fx.debris('boShellT', tx, ty, -3, -6, { life: 110, spin: -0.04 });
      this.game.fx.debris('boShellB', bx, by, -3, 4, { life: 110, spin: 0.04 });
    }
    const [x, y] = this.w(...CORE);
    this.game.onBossPhase(x, y);
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  private armChain(i: number): { joints: Array<[number, number, number]>; tip: [number, number, number] } {
    const arm = ARM_ROOTS[i]!;
    const speed = this.stage === 3 ? 1.8 : 1;
    let [x, y] = this.w(...arm.at);
    let a = arm.base;
    const joints: Array<[number, number, number]> = [];
    const len = SEG_LEN * (0.2 + 0.8 * this.armGrow);
    for (let s = 0; s < ARM_SEGS; s++) {
      a += Math.sin(this.t * 0.035 * speed + s * 0.6 + arm.ph) * 0.2 * this.armGrow;
      joints.push([x, y, a]);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
    }
    return { joints, tip: [x, y, a] };
  }

  private rig(g: Rig, pass: 'solid' | 'glow' | 'white', alpha = 1): void {
    const beat = 1 + Math.pow(Math.max(0, Math.sin(this.beat)), 6) * (this.stage === 3 ? 0.09 : 0.04);
    g.begin(pass, alpha).frame(this.x, this.y);

    // Bone reads best un-bloomed: the glow pass only lights the living parts.
    const bloomBone = pass !== 'glow';
    if (bloomBone) g.part('boBack', 80, 0);

    if (this.armGrow > 0.02) {
      for (let i = 0; i < ARM_ROOTS.length; i++) {
        const { joints, tip } = this.armChain(i);
        g.frame(0, 0);
        for (const [x, y, a] of joints) g.part('boArmSeg', x, y, a, 0.6 + 0.4 * this.armGrow);
        g.part('boClaw', tip[0], tip[1], tip[2] - Math.PI, 0.5 + 0.5 * this.armGrow);
        g.frame(this.x, this.y);
      }
    }

    g.part('boCore', CORE[0], CORE[1], 0, beat * (this.stage === 3 ? 1.08 : 1));

    if (!this.shellsGone && bloomBone) {
      const o = this.shellOpen * 0.62;
      g.part('boShellT', HINGE_T[0], HINGE_T[1], o);
      g.part('boShellB', HINGE_B[0], HINGE_B[1], -o);
    }

    if (this.stage === 1) {
      g.frame(0, 0);
      for (const p of this.pods) if (p.alive && bloomBone) g.part('boPod', p.x, p.y);
    }
  }

  draw(r: Renderer, g: Rig): void {
    if (this.stage === 1) {
      // Sinew tethers to the pods.
      const ctx = r.ctx;
      r.resetTransform();
      ctx.globalAlpha = 1;
      for (const p of this.pods) {
        if (!p.alive) continue;
        const [ax, ay] = this.w(160, p.y < this.y ? -120 : 120);
        for (const [w, c] of [[9, '#3a0810'], [3, '#a83232']] as const) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.quadraticCurveTo((ax + p.x) / 2 + 30, (ay + p.y) / 2 + Math.sin(this.t * 0.05) * 20, p.x + 50, p.y);
          ctx.stroke();
        }
      }
    }

    this.rig(g, 'solid');
    if (this.coreFlash > 0 && this.stage >= 2) {
      g.begin('white', 0.55).frame(this.x, this.y);
      g.part('boCore', CORE[0], CORE[1]);
    }
    for (const p of this.pods) {
      if (p.alive && p.flash > 0) {
        g.begin('white', 0.6).frame(0, 0);
        g.part('boPod', p.x, p.y);
      }
    }
    if (this.shielded > 0 && !this.entering) this.rig(g, 'white', 0.12 + 0.1 * Math.sin(this.t * 0.8));
  }

  drawGlow(r: Renderer, g: Rig): void {
    const heartbeat = 0.35 + 0.35 * Math.pow(Math.max(0, Math.sin(this.beat)), 4);
    this.rig(g, 'glow', heartbeat);
    const [cx, cy] = this.w(...CORE);
    if (this.stage === 1) {
      for (const p of this.pods) {
        if (!p.alive) continue;
        r.dot('#5dd9e8', p.x - 1, p.y, 22, 0.7);
        r.dot('#5dd9e8', p.x - 58, p.y, 12, 0.6 + 0.4 * Math.max(0, 1 - p.timer / 20));
      }
      // Light leaking through the shell seam.
      r.dot('#e85dc9', cx - 60, cy, 60, 0.35 + heartbeat * 0.4);
    }
    // Engines burning along the spine.
    for (const y of [-190, -60, 60, 190]) r.dot('#e85dc9', this.x + 270, this.y + y, 26, heartbeat);
    if (this.stage >= 2) r.dot('#e85dc9', cx, cy, 120 * (0.8 + heartbeat), 0.25 + heartbeat * 0.3);
    if (this.laser !== 'idle') this.drawBeam(r);
  }

  private drawBeam(r: Renderer): void {
    const ctx = r.ctx;
    const charging = this.laser === 'charge';
    r.resetTransform();
    ctx.translate(this.laserX, this.laserY);
    ctx.rotate(this.laserAngle);
    const half = charging ? 1.5 + (1 - this.laserTimer / LASER_CHARGE) * 2 : LASER_HALF * Math.min(1, (LASER_FIRE - this.laserTimer) / 4 + 0.3);
    if (charging) {
      const locked = this.laserTimer <= 12;
      ctx.globalAlpha = locked ? 0.9 : 0.4 + Math.sin(this.t * 0.6) * 0.25;
      ctx.fillStyle = locked ? '#ffffff' : '#ff6b6b';
      ctx.fillRect(0, -half, LASER_LENGTH, half * 2);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(0, -half * 5, LASER_LENGTH, half * 10);
    } else {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(-20, -half * 2.4, LASER_LENGTH, half * 4.8);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#ffb0b0';
      ctx.fillRect(-20, -half, LASER_LENGTH, half * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-20, -half * 0.4, LASER_LENGTH, half * 0.8);
    }
    ctx.globalAlpha = 1;
    r.dot('#ff6b6b', this.laserX, this.laserY, charging ? 30 : 60, 0.9);
  }
}
