import { Enemy, type EnemyKind } from '../entities/Enemy';
import type { Game } from '../Game';
import { STAGE } from '../../config';

const POOL: Array<[EnemyKind, number]> = [
  ['wasp', 0.30],
  ['cyborg', 0.22],
  ['brain', 0.18],
  ['mantis', 0.18],
  ['crystal', 0.12],
];

export class Spawner {
  private timer = 90;
  private interval = 75;
  paused = false;

  constructor(private game: Game) {}

  update(dt: number): void {
    if (this.paused) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval;
      const kind = this.pick();
      const y = 80 + Math.random() * (STAGE.height - 160);
      this.game.spawn(new Enemy(this.game, kind, y));
      if (this.interval > 26) this.interval -= 0.25;
    }
  }

  private pick(): EnemyKind {
    const r = Math.random();
    let acc = 0;
    for (const [kind, w] of POOL) {
      acc += w;
      if (r <= acc) return kind;
    }
    return POOL[0]![0];
  }
}
