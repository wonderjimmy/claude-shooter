import { BULLET, PLAYER, STAGE } from '../../config';
import type { Game } from '../Game';
import type { Rig } from '../art/Rig';
import type { Renderer } from '../Renderer';
import { Bullet, type BulletSpec } from './Bullet';

const PULSE: BulletSpec = { art: 'projPulse', radius: 5, damage: 1 };
const LANCE: BulletSpec = { art: 'projCharge', radius: 9, damage: 1.5, pierce: true };

export class Player {
  x: number = PLAYER.startX;
  y: number = PLAYER.startY;
  alive = true;
  focusing = false;
  /** Hit-invulnerability frames. */
  invuln = 0;
  power = 1;
  private fold = 0;
  private cooldown = 0;
  private flash = 0;
  private bank = 0;
  private lastY: number = PLAYER.startY;
  private t = 0;

  constructor(private game: Game) {}

  reset(): void {
    this.x = PLAYER.startX;
    this.y = PLAYER.startY;
    this.alive = true;
    this.invuln = 90;
    this.cooldown = 0;
    this.flash = 0;
    this.bank = 0;
    this.power = 1;
  }

  get shielded(): boolean { return this.game.timeLeft('shield') > 0; }
  get invulnerable(): boolean { return this.invuln > 0 || this.shielded || this.game.debugInvincible; }

  /** Touch drag, already converted to stage units. Applied once per rendered frame. */
  applyDrag(dx: number, dy: number): void {
    if (!this.alive) return;
    const max = 60;
    this.x += Math.max(-max, Math.min(max, dx));
    this.y += Math.max(-max, Math.min(max, dy));
    this.clamp();
  }

  private clamp(): void {
    this.x = Math.max(28, Math.min(STAGE.width - 28, this.x));
    this.y = Math.max(22, Math.min(STAGE.height - 22, this.y));
  }

  takeHit(): void {
    this.invuln = PLAYER.iFrames;
    this.flash = 10;
  }

  update(dt: number): void {
    if (!this.alive) return;
    const g = this.game;
    this.t += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;

    const input = g.input;
    this.focusing = input.held('focus');
    const [mx, my] = input.move();
    const speed = PLAYER.speed * (g.timeLeft('speed') > 0 ? 1.7 : 1) * (this.focusing ? PLAYER.focusMul : 1);
    this.x += mx * speed * dt;
    this.y += my * speed * dt;
    this.clamp();

    const vy = (this.y - this.lastY) / Math.max(dt, 0.001);
    this.lastY = this.y;
    this.bank += (Math.max(-0.22, Math.min(0.22, vy * 0.03)) - this.bank) * Math.min(1, 0.25 * dt);
    this.fold += ((this.focusing ? 1 : 0) - this.fold) * Math.min(1, 0.2 * dt);

    // Engine trail.
    if (Math.random() < 0.9 * dt) {
      g.fx.emit(this.x - 64, this.y - this.bank * 60, {
        count: 2, speed: [1.5, 4], life: [8, 18], size: [3, 6],
        color: this.shielded ? '#9be7ff' : '#5dd9e8',
        angle: [Math.PI - 0.3, Math.PI + 0.3],
      });
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0 && g.wantsFire()) {
      const rapid = g.timeLeft('multi') > 0 ? 2.2 : 1;
      this.cooldown = PLAYER.fireInterval / rapid;
      this.fire();
    }
  }

  private fire(): void {
    const g = this.game;
    const x = this.x + 56;
    const y = this.y + this.bank * 50;
    const sp = BULLET.speed;
    const shot = (dy: number, angle: number, spec: BulletSpec, dmgMul = 1, dx = 0) => {
      g.playerBullets.push(new Bullet(x + dx, y + dy, Math.cos(angle) * sp, Math.sin(angle) * sp,
        dmgMul === 1 ? spec : { ...spec, damage: (spec.damage ?? 1) * dmgMul }));
    };
    const lance = g.timeLeft('laser') > 0;
    const main = lance ? LANCE : PULSE;

    switch (this.power) {
      case 1:
        shot(0, 0, main);
        break;
      case 2:
        shot(-8, 0, main, 0.85);
        shot(8, 0, main, 0.85);
        break;
      case 3:
        shot(0, 0, main);
        shot(-25, -0.07, PULSE, 0.75, -58);
        shot(25, 0.07, PULSE, 0.75, -58);
        break;
      default:
        shot(-7, 0, main, 0.9);
        shot(7, 0, main, 0.9);
        shot(-25, -0.06, PULSE, 0.7, -58);
        shot(25, 0.06, PULSE, 0.7, -58);
        shot(-31, -0.14, PULSE, 0.6, -70);
        shot(31, 0.14, PULSE, 0.6, -70);
        break;
    }
    if (g.timeLeft('spread') > 0) {
      for (const a of [-0.34, -0.2, 0.2, 0.34]) shot(0, a, PULSE, 0.55);
    }

    g.audio.play('shoot', { rate: 0.95 + Math.random() * 0.1 });
    g.fx.emit(x + 6, y, { count: 4, speed: [2, 5], life: [5, 10], size: [2, 4], color: '#9be7ff', angle: [-0.5, 0.5] });
    g.shake.add(0.03);
  }

  /** Wings flex with banking and fold in while focusing; pods sprout with power. */
  private rig(g: Rig): void {
    g.frame(this.x, this.y, this.bank, 0.92);
    const flex = Math.sin(this.t * 0.08) * 0.04;
    const fold = this.fold * 0.38;
    const pods = this.power >= 3;
    if (pods) g.part('plPod', -20, 27 + this.fold * -6);
    if (this.power >= 4) g.part('plPod', -34, 34 + this.fold * -8, 0, 0.85);
    g.part('plWingB', -6, 7, -flex - fold + this.bank * 0.6);
    g.part('plHull', 0, 0);
    g.part('plWingT', -6, -7, flex + fold + this.bank * 0.6);
    if (pods) g.part('plPod', -20, -27 + this.fold * 6);
    if (this.power >= 4) g.part('plPod', -34, -34 + this.fold * 8, 0, 0.85);
  }

  draw(r: Renderer): void {
    if (!this.alive) return;
    const blink = this.invuln > 0 && !this.shielded && Math.floor(this.invuln / 4) % 2 === 0;
    const g = this.game.rig;
    this.rig(g.begin('solid', blink ? 0.35 : 1));
    if (this.flash > 0) this.rig(g.begin('white', this.flash / 10));
    void r;
  }

  drawGlow(r: Renderer): void {
    if (!this.alive) return;
    this.rig(this.game.rig.begin('glow', 0.5));
    // Engine flame.
    const fl = 0.8 + Math.random() * 0.4;
    const ex = this.x - 62 * Math.cos(this.bank), ey = this.y - 62 * Math.sin(this.bank);
    r.dot(this.shielded ? '#9be7ff' : '#5dd9e8', ex, ey, 16 * fl, 0.8);
    r.dot('#ffffff', ex + 2, ey, 6 * fl, 0.9);
    if (this.shielded) {
      const left = this.game.timeLeft('shield');
      const fading = left < 120 && Math.floor(left / 6) % 2 === 0;
      if (!fading) {
        r.dot('#5dd9e8', this.x, this.y, 70 + Math.sin(this.t * 0.2) * 4, 0.35);
        r.resetTransform();
        const ctx = r.ctx;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#9be7ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 50, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** The true hitbox, shown while focusing (and always on touch, where the finger hides nothing). */
  drawCore(r: Renderer, always: boolean): void {
    if (!this.alive || (!this.focusing && !always)) return;
    const ctx = r.ctx;
    r.resetTransform();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e85dc9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, PLAYER.hitRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (this.focusing) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(this.x, this.y, PLAYER.grazeRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
