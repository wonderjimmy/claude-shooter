import { Sprite, type Ticker } from 'pixi.js';
import type { Game } from '../Game';
import { tex } from '../assets/sprites';

export function spawnExplosion(game: Game, x: number, y: number, scale = 1.4): void {
  const sprite = new Sprite(tex('fxExplosion'));
  sprite.anchor.set(0.5);
  sprite.x = x;
  sprite.y = y;
  sprite.scale.set(0.15);
  sprite.rotation = Math.random() * Math.PI * 2;
  sprite.blendMode = 'add';
  game.layers.fx.addChild(sprite);

  const lifetime = 28;
  let life = lifetime;
  const handler = (ticker: Ticker): void => {
    life -= ticker.deltaTime;
    const t = 1 - life / lifetime;
    sprite.scale.set(0.15 + t * scale);
    sprite.alpha = Math.max(0, 1 - t);
    sprite.rotation += 0.05 * ticker.deltaTime;
    if (life <= 0) {
      game.app.ticker.remove(handler);
      sprite.destroy();
    }
  };
  game.app.ticker.add(handler);
}
