import { Sprite } from 'pixi.js';
import { Entity } from './Entity';
import { Bullet, laserBullet, playerBullet } from './Bullet';
import type { Game } from '../Game';
import { BULLET, PLAYER, STAGE } from '../../config';
import { tex } from '../assets/sprites';

const I_FRAMES = 90;

export class Player extends Entity {
  radius = 18;
  private cooldown = 0;
  private sprite: Sprite;
  private invincibleTimer = 0;
  private flashTimer = 0;

  constructor(game: Game) {
    super(game);
    this.x = PLAYER.startX;
    this.y = PLAYER.startY;

    this.sprite = new Sprite(tex('ship'));
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.55);
    this.view.addChild(this.sprite);
  }

  get invincible(): boolean {
    return this.invincibleTimer > 0 || this.game.gameTime < this.game.shieldUntil;
  }

  reset(): void {
    this.x = PLAYER.startX;
    this.y = PLAYER.startY;
    this.cooldown = 0;
    this.invincibleTimer = 0;
    this.flashTimer = 0;
    this.sprite.tint = 0xffffff;
    this.sprite.alpha = 1;
    this.dead = false;
  }

  takeHit(): void {
    this.invincibleTimer = I_FRAMES;
    this.flashTimer = 8;
    this.sprite.tint = 0xffffff;
  }

  override update(dt: number): void {
    const game = this.game;
    const t = game.gameTime;
    const shieldActive = t < game.shieldUntil;

    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      this.sprite.alpha = (Math.floor(this.invincibleTimer / 4) % 2 === 0) ? 0.4 : 1;
      if (this.invincibleTimer <= 0) this.sprite.alpha = 1;
    } else if (shieldActive) {
      this.sprite.alpha = 0.6 + Math.sin(t * 0.2) * 0.2;
      this.sprite.tint = 0x9be7ff;
    } else {
      this.sprite.alpha = 1;
      if (this.flashTimer <= 0) this.sprite.tint = 0xffffff;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.sprite.tint = 0xff8888;
    }

    const input = game.input;
    let dx = 0, dy = 0;
    if (input.held('ArrowLeft') || input.held('KeyA')) dx -= 1;
    if (input.held('ArrowRight') || input.held('KeyD')) dx += 1;
    if (input.held('ArrowUp') || input.held('KeyW')) dy -= 1;
    if (input.held('ArrowDown') || input.held('KeyS')) dy += 1;

    const speedMul = (t < game.speedUntil) ? 1.9 : 1;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * PLAYER.speed * speedMul * dt;
      this.y += (dy / len) * PLAYER.speed * speedMul * dt;
    }

    this.x = Math.max(20, Math.min(STAGE.width - 20, this.x));
    this.y = Math.max(20, Math.min(STAGE.height - 20, this.y));

    game.particles.emit(this.x - 50, this.y, {
      count: 2,
      speed: [1, 3.5],
      life: [10, 22],
      size: [2, 5],
      color: shieldActive ? 0x9be7ff : 0x5dd9e8,
      angle: [Math.PI - 0.25, Math.PI + 0.25],
      additive: true,
    });

    const fireRateMul = (t < game.fireRateUntil) ? 3 : 1;
    this.cooldown -= dt;
    if (this.cooldown <= 0 && (input.held('Space') || input.held('KeyJ'))) {
      this.cooldown = (60 / PLAYER.fireRate) / fireRateMul;
      this.fire();
      game.shake.add(0.12);
      game.audio.playSfx('shoot');
      game.particles.emit(this.x + 56, this.y, {
        count: 10,
        speed: [2, 6],
        life: [6, 14],
        size: [2, 5],
        color: 0x9be7ff,
        angle: [-0.5, 0.5],
        additive: true,
      });
    }
  }

  private fire(): void {
    const game = this.game;
    const t = game.gameTime;
    const useLaser = t < game.laserUntil;
    const useSpread = t < game.spreadUntil;
    const baseSpec = useLaser ? laserBullet() : playerBullet();
    const spec = useSpread ? { ...baseSpec, damage: 0.35 } : baseSpec;
    const speed = BULLET.speed;
    const x = this.x + 52;
    const y = this.y;

    if (useSpread) {
      for (const a of [-0.26, -0.13, 0, 0.13, 0.26]) {
        game.spawn(new Bullet(game, x, y, Math.cos(a) * speed, Math.sin(a) * speed, spec));
      }
    } else {
      game.spawn(new Bullet(game, x, y, speed, 0, spec));
    }
  }
}
