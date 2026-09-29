import { art, type Art, type ArtKey } from '../../core/Art';
import type { Game } from '../Game';
import type { Renderer } from '../Renderer';

export type PickupKind =
  | 'power' | 'shield' | 'spread' | 'speed' | 'multi'
  | 'laser' | 'life' | 'bomb' | 'coin' | 'gem';

export const PICKUP_ART: Record<PickupKind, ArtKey> = {
  power: 'puPower',
  shield: 'puShield',
  spread: 'puSpread',
  speed: 'puSpeed',
  multi: 'puMulti',
  laser: 'puLaser',
  life: 'puLife',
  bomb: 'puBomb',
  coin: 'puCoin',
  gem: 'gem',
};

export const PICKUP_LABEL: Record<PickupKind, string> = {
  power: 'POWER UP',
  shield: 'SHIELD',
  spread: 'SPREAD',
  speed: 'BOOST',
  multi: 'RAPID',
  laser: 'LANCE',
  life: '+1 HULL',
  bomb: '+1 BOMB',
  coin: '+500',
  gem: '',
};

/** Weighted drop table for ordinary kills. */
export const DROP_TABLE: Array<[PickupKind, number]> = [
  ['power', 26], ['coin', 14], ['shield', 9], ['spread', 10], ['speed', 7],
  ['multi', 10], ['laser', 8], ['bomb', 9], ['life', 7],
];

export class Pickup {
  x: number;
  y: number;
  dead = false;
  readonly radius: number;
  private readonly a: Art;
  private t = 0;
  private vx: number;
  private vy: number;
  private magnet = false;

  constructor(private game: Game, readonly kind: PickupKind, x: number, y: number, vx = -1.4, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.a = art(PICKUP_ART[kind]);
    this.radius = kind === 'gem' ? 10 : 20;
  }

  update(dt: number): void {
    this.t += dt;
    const p = this.game.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const isGem = this.kind === 'gem';
    // Gems always home after popping out; items home when you get close (or while focusing).
    if (p.alive && ((isGem && this.t > 22) || d < 150 || (p.focusing && d < 420))) this.magnet = true;

    if (this.magnet && p.alive) {
      const pull = isGem ? Math.min(18, 3 + this.t * 0.25) : 9;
      this.vx += (dx / d * pull - this.vx) * Math.min(1, 0.2 * dt);
      this.vy += (dy / d * pull - this.vy) * Math.min(1, 0.2 * dt);
    } else if (isGem) {
      this.vx *= Math.pow(0.9, dt);
      this.vy *= Math.pow(0.9, dt);
    } else {
      this.vx += (-1.4 - this.vx) * Math.min(1, 0.05 * dt);
      this.vy = Math.sin(this.t * 0.08) * 0.6;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -40 || (isGem && this.t > 600)) this.dead = true;
  }

  draw(r: Renderer): void {
    const rot = this.kind === 'gem' ? this.t * 0.2 : (this.kind === 'power' ? 0 : Math.sin(this.t * 0.05) * 0.3);
    const blink = this.t > 480 && this.kind !== 'gem' ? (Math.floor(this.t / 6) % 2 ? 0.4 : 1) : 1;
    r.sprite(this.a, this.x, this.y, rot, 1, blink);
  }

  drawGlow(r: Renderer): void {
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 0.18);
    r.glow(this.a, this.x, this.y, 0, 1.15, pulse);
  }
}
