import { Container } from 'pixi.js';
import type { Game } from '../Game';

export abstract class Entity {
  readonly view = new Container();
  dead = false;

  constructor(protected game: Game) {}

  get x(): number { return this.view.x; }
  set x(v: number) { this.view.x = v; }
  get y(): number { return this.view.y; }
  set y(v: number) { this.view.y = v; }

  abstract radius: number;

  abstract update(dt: number): void;

  destroy(): void {
    this.dead = true;
    this.view.destroy({ children: true });
  }
}
