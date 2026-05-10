import { Sprite } from 'pixi.js';
import { Entity } from './Entity';
import type { Game } from '../Game';
import { tex, type SpriteKey } from '../assets/sprites';

export type PowerUpKind =
  | 'shield' | 'spread' | 'speed' | 'life'
  | 'bomb'   | 'multi'  | 'laser' | 'coin';

export const POWERUP_SPRITE: Record<PowerUpKind, SpriteKey> = {
  shield: 'puShield',
  spread: 'puSpread',
  speed:  'puSpeed',
  life:   'puLife',
  bomb:   'puBomb',
  multi:  'puMulti',
  laser:  'puLaser',
  coin:   'puCoin',
};

export const POWERUP_POOL: PowerUpKind[] = [
  'shield', 'spread', 'speed', 'life',
  'bomb', 'multi', 'laser', 'coin',
];

export class Pickup extends Entity {
  radius = 18;
  readonly kind: PowerUpKind;
  private sprite: Sprite;
  private t = 0;
  private baseY: number;

  constructor(game: Game, kind: PowerUpKind, x: number, y: number) {
    super(game);
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.baseY = y;

    this.sprite = new Sprite(tex(POWERUP_SPRITE[kind]));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.7);
    this.view.addChild(this.sprite);
  }

  override update(dt: number): void {
    this.t += dt;
    this.x -= 1.4 * dt;
    this.y = this.baseY + Math.sin(this.t * 0.08) * 8;
    this.sprite.rotation += 0.025 * dt;
    this.sprite.alpha = 0.85 + Math.sin(this.t * 0.18) * 0.15;
    if (this.x < -40) this.dead = true;
  }
}
