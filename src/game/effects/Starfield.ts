import { Container, TilingSprite } from 'pixi.js';
import { STAGE } from '../../config';
import { tex, type SpriteKey } from '../assets/sprites';

export interface Layer { tile: TilingSprite; speed: number; }

const LAYERS: Array<{ key: SpriteKey; speed: number; tileScale: number; alpha: number }> = [
  { key: 'bgStarsFar',   speed: 0.3, tileScale: 1.0, alpha: 0.9 },
  { key: 'bgNebulaMid',  speed: 0.55, tileScale: 2.4, alpha: 0.45 },
  { key: 'bgDebrisNear', speed: 1.0, tileScale: 1.5, alpha: 0.22 },
];

export class Starfield {
  readonly view = new Container();
  readonly layers: Layer[] = [];

  constructor() {
    for (const cfg of LAYERS) {
      const tile = new TilingSprite({
        texture: tex(cfg.key),
        width: STAGE.width,
        height: STAGE.height,
      });
      tile.tileScale.set(cfg.tileScale);
      tile.alpha = cfg.alpha;
      this.view.addChild(tile);
      this.layers.push({ tile, speed: cfg.speed });
    }
  }

  update(dt: number): void {
    for (const l of this.layers) {
      l.tile.tilePosition.x -= l.speed * dt;
    }
  }
}
