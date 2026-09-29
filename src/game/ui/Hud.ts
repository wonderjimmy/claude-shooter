import { CHAIN, COLORS, PLAYER, POWERUP_FRAMES, STAGE } from '../../config';
import { art } from '../../core/Art';
import type { Game, TimedPower } from '../Game';
import { PICKUP_ART } from '../entities/Pickup';
import type { Renderer } from '../Renderer';

const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const DISPLAY = '"Space Grotesk", system-ui, sans-serif';

interface Banner { kicker: string; title: string; sub: string; color: string; t: number; life: number }

const TIMED: TimedPower[] = ['shield', 'spread', 'speed', 'multi', 'laser'];

export class Hud {
  private bannerState: Banner | null = null;
  private warningT = 0;
  private displayScore = 0;
  private hpShake = 0;
  private lastHp = 0;
  hintT = 0;

  constructor(private game: Game) {}

  reset(): void {
    this.bannerState = null;
    this.warningT = 0;
    this.displayScore = 0;
    this.lastHp = this.game.hp;
  }

  banner(kicker: string, title: string, sub: string, color: string, life = 170): void {
    this.bannerState = { kicker, title, sub, color, t: 0, life };
  }

  warning(): void {
    this.warningT = 200;
    this.bannerState = null;
  }

  update(dt: number): void {
    const g = this.game;
    if (this.bannerState) {
      this.bannerState.t += dt;
      if (this.bannerState.t > this.bannerState.life) this.bannerState = null;
    }
    if (this.warningT > 0) this.warningT -= dt;
    if (this.hintT > 0) this.hintT -= dt;
    const diff = g.score - this.displayScore;
    this.displayScore += diff > 0 ? Math.max(1, Math.ceil(diff * 0.2 * dt)) : diff;
    if (this.displayScore > g.score) this.displayScore = g.score;
    if (g.hp < this.lastHp) this.hpShake = 18;
    this.lastHp = g.hp;
    if (this.hpShake > 0) this.hpShake -= dt;
  }

  draw(r: Renderer, fps: number | null): void {
    const g = this.game;
    const ctx = r.ctx;
    r.hudTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';

    // ── score (top-left) ──
    ctx.textAlign = 'left';
    ctx.font = `700 26px ${MONO}`;
    ctx.fillStyle = COLORS.ice;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 10;
    ctx.fillText(this.displayScore.toString().padStart(8, '0'), 26, 44);
    ctx.shadowBlur = 0;
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = COLORS.boneDim;
    ctx.fillText(`HI ${Math.max(g.best, g.score).toString().padStart(8, '0')}`, 28, 64);

    // ── chain meter ──
    if (g.chain > 1) {
      const mul = g.chainMul;
      const k = Math.max(0, g.chainTimer / CHAIN.window);
      ctx.font = `800 18px ${DISPLAY}`;
      ctx.fillStyle = mul >= 4 ? COLORS.gold : COLORS.bone;
      ctx.fillText(`${g.chain} CHAIN`, 28, 92);
      ctx.font = `800 22px ${DISPLAY}`;
      ctx.fillStyle = mul >= 4 ? COLORS.orange : COLORS.magenta;
      ctx.fillText(`×${mul}`, 150, 93);
      ctx.fillStyle = 'rgba(230,216,184,0.15)';
      ctx.fillRect(28, 100, 160, 3);
      ctx.fillStyle = mul >= 4 ? COLORS.gold : COLORS.magenta;
      ctx.fillRect(28, 100, 160 * k, 3);
    }

    // ── hull (top-right) ──
    const sx = this.hpShake > 0 ? (Math.random() - 0.5) * this.hpShake * 0.5 : 0;
    const pipW = 22, gap = 5;
    const maxHp = g.maxHp;
    const hx = STAGE.width - 26 - maxHp * (pipW + gap) + gap + sx;
    ctx.font = `600 11px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.boneDim;
    ctx.fillText('HULL', hx - 8, 38);
    for (let i = 0; i < maxHp; i++) {
      const on = i < g.hp;
      const x = hx + i * (pipW + gap);
      const low = g.hp <= 1;
      ctx.fillStyle = on ? (low ? COLORS.red : COLORS.ice) : 'rgba(230,216,184,0.12)';
      if (on && low && Math.floor(g.gameTime / 10) % 2) ctx.fillStyle = '#ffffff';
      this.skew(ctx, x, 26, pipW, 14);
    }

    // ── bombs + power ──
    const bombArt = art('puBomb');
    ctx.fillStyle = COLORS.boneDim;
    ctx.fillText('BOMB', hx - 8, 64);
    for (let i = 0; i < PLAYER.maxBombs; i++) {
      ctx.globalAlpha = i < g.bombs ? 1 : 0.15;
      ctx.drawImage(bombArt.img, hx + i * 26 - 12, 41, 38, 38);
    }
    ctx.globalAlpha = 1;
    ctx.fillText('PWR', hx - 8, 90);
    for (let i = 0; i < PLAYER.maxPower; i++) {
      const on = i < g.player.power;
      ctx.fillStyle = on ? (g.player.power === PLAYER.maxPower ? COLORS.gold : COLORS.orange) : 'rgba(230,216,184,0.12)';
      this.skew(ctx, hx + i * 30, 80, 26, 9);
    }
    if (g.player.power === PLAYER.maxPower) {
      ctx.font = `700 10px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.gold;
      ctx.fillText('MAX', hx + 4 * 30 + 2, 89);
    }

    // ── timed power-ups (bottom-left) ──
    let px = 34;
    for (const kind of TIMED) {
      const left = g.timeLeft(kind);
      if (left <= 0) continue;
      const a = art(PICKUP_ART[kind]);
      const k = left / POWERUP_FRAMES[kind];
      const y = STAGE.height - 38;
      ctx.globalAlpha = left < 120 && Math.floor(left / 8) % 2 ? 0.35 : 1;
      ctx.drawImage(a.img, px - 20, y - 20, 40, 40);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
      ctx.globalAlpha = 1;
      px += 54;
    }

    // ── boss bar ──
    const boss = g.boss;
    if (boss && !boss.dead) {
      const w = 720, h = 12;
      const x = STAGE.width / 2 - w / 2, y = STAGE.height - 34;
      const k = boss.totalHp / boss.totalMaxHp;
      ctx.textAlign = 'left';
      ctx.font = `800 15px ${DISPLAY}`;
      ctx.fillStyle = COLORS.red;
      ctx.fillText('CARRION IX', x, y - 10);
      ctx.textAlign = 'right';
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = COLORS.boneDim;
      const phaseName = ['CARAPACE', 'UNSEALED', 'HEART OF ENGINES'][boss.stage - 1];
      ctx.fillText(`PHASE ${boss.stage}/3 · ${phaseName}`, x + w, y - 10);
      ctx.fillStyle = 'rgba(29,24,40,0.85)';
      ctx.fillRect(x, y, w, h);
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#a83232');
      grad.addColorStop(1, '#ff6b6b');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * k), h - 4);
      ctx.fillStyle = COLORS.void;
      for (const m of boss.phaseMarks) ctx.fillRect(x + w * m - 1, y, 2, h);
      ctx.strokeStyle = 'rgba(255,107,107,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
    }

    // ── difficulty badge (bottom-right) ──
    ctx.textAlign = 'right';
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = g.difficulty === 'hard' ? COLORS.red : g.difficulty === 'easy' ? COLORS.toxic : COLORS.ice;
    ctx.globalAlpha = 0.75;
    const loopTag = g.loop > 1 ? `  LOOP ${g.loop}` : '';
    ctx.fillText(`${g.muls.label}${loopTag}`, STAGE.width - 26, STAGE.height - 18);
    if (fps !== null) {
      ctx.fillStyle = COLORS.boneDim;
      ctx.fillText(`${fps} FPS · ${g.fx.particleCount}p · ${g.enemyBullets.length}b`, STAGE.width - 26, STAGE.height - 36);
    }
    ctx.globalAlpha = 1;

    this.drawBanner(r);
    this.drawWarning(r);
    this.drawHint(r);
  }

  private skew(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.beginPath();
    ctx.moveTo(x + 4, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w - 4, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  }

  private drawBanner(r: Renderer): void {
    const b = this.bannerState;
    if (!b) return;
    const ctx = r.ctx;
    const inT = Math.min(1, b.t / 18);
    const outT = Math.min(1, Math.max(0, (b.life - b.t) / 24));
    const a = Math.min(inT, outT);
    const slide = (1 - inT) * 60;
    const cx = STAGE.width / 2, cy = STAGE.height / 2 - 40;

    ctx.globalAlpha = a * 0.65;
    const band = ctx.createLinearGradient(0, 0, STAGE.width, 0);
    band.addColorStop(0, 'rgba(4,3,10,0)');
    band.addColorStop(0.5, 'rgba(4,3,10,0.85)');
    band.addColorStop(1, 'rgba(4,3,10,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, cy - 64, STAGE.width, 128);

    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = `600 14px ${MONO}`;
    ctx.fillStyle = b.color;
    ctx.fillText(spaced(b.kicker), cx - slide, cy - 30);
    ctx.font = `800 54px ${DISPLAY}`;
    ctx.fillStyle = COLORS.bone;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 24;
    ctx.fillText(b.title, cx + slide, cy + 22);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = `italic 500 15px ${MONO}`;
      ctx.fillStyle = COLORS.boneDim;
      ctx.fillText(b.sub, cx - slide * 0.5, cy + 50);
    }
    ctx.globalAlpha = 1;
  }

  private drawWarning(r: Renderer): void {
    if (this.warningT <= 0) return;
    const ctx = r.ctx;
    const t = 200 - this.warningT;
    const a = Math.min(1, t / 15, this.warningT / 20);
    const blink = Math.floor(t / 14) % 2 === 0 ? 1 : 0.55;
    const cy = STAGE.height / 2 - 20;

    ctx.globalAlpha = a * 0.28;
    ctx.fillStyle = '#a83232';
    ctx.fillRect(0, cy - 70, STAGE.width, 140);
    // Hazard stripes.
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#ff3b3b';
    const off = (t * 3) % 40;
    for (const yy of [cy - 70, cy + 62]) {
      for (let x = -40 + off; x < STAGE.width + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x + 20, yy);
        ctx.lineTo(x + 12, yy + 8);
        ctx.lineTo(x - 8, yy + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = a * blink;
    ctx.textAlign = 'center';
    ctx.font = `900 64px ${DISPLAY}`;
    ctx.fillStyle = '#ff6b6b';
    ctx.shadowColor = '#ff3b3b';
    ctx.shadowBlur = 30;
    ctx.fillText('WARNING', STAGE.width / 2, cy + 14);
    ctx.shadowBlur = 0;
    ctx.font = `600 14px ${MONO}`;
    ctx.fillStyle = COLORS.bone;
    ctx.fillText(spaced('CARRION IX APPROACHING'), STAGE.width / 2, cy + 44);
    ctx.globalAlpha = 1;
  }

  private drawHint(r: Renderer): void {
    if (this.hintT <= 0) return;
    const g = this.game;
    const ctx = r.ctx;
    const a = Math.min(1, this.hintT / 30, (420 - this.hintT) / 30);
    const lines = g.input.usingTouch
      ? ['DRAG anywhere to fly — the ship follows your finger', 'Firing is automatic · tap ✹ to bomb', 'Only the glowing core is your hitbox']
      : g.input.usingPad
        ? ['Stick / D-pad to fly · A to fire · B to bomb', 'Hold a shoulder button to FOCUS (slow + show hitbox)', 'Graze bullets for points — only the core can be hit']
        : ['ARROWS / WASD to fly · SPACE to fire · X to bomb', 'Hold SHIFT to FOCUS: slow flight, visible hitbox', 'Graze bullets for points · F toggles auto-fire'];
    ctx.globalAlpha = Math.max(0, a) * 0.9;
    ctx.textAlign = 'center';
    ctx.font = `500 15px ${MONO}`;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? COLORS.ice : COLORS.bone;
      ctx.fillText(line, STAGE.width / 2, STAGE.height - 150 + i * 24);
    });
    ctx.globalAlpha = 1;
  }
}

function spaced(s: string): string {
  return s.split('').join(' ');
}
