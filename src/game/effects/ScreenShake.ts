import type { Container } from 'pixi.js';

export class ScreenShake {
  private trauma = 0;
  private maxOffset = 24;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  apply(target: Container, dt: number): void {
    if (this.trauma <= 0) {
      target.x = 0;
      target.y = 0;
      return;
    }
    const shake = this.trauma * this.trauma;
    target.x = (Math.random() * 2 - 1) * this.maxOffset * shake;
    target.y = (Math.random() * 2 - 1) * this.maxOffset * shake;
    this.trauma = Math.max(0, this.trauma - 0.04 * dt);
  }
}
