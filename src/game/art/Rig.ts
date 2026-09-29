import { art } from '../../core/Art';
import type { Renderer } from '../Renderer';
import { PIVOT, type DrawnKey } from './Sprites';

export type Pass = 'solid' | 'glow' | 'white';

/**
 * Places multi-part characters. Set the entity frame with `frame()`, then
 * `part()` draws a baked part at a local offset/rotation in the chosen pass.
 */
export class Rig {
  pass: Pass = 'solid';
  alpha = 1;
  private x = 0;
  private y = 0;
  private c = 1;
  private s = 0;
  private scale = 1;
  private rot = 0;

  constructor(private r: Renderer) {}

  begin(pass: Pass, alpha = 1): this {
    this.pass = pass;
    this.alpha = alpha;
    return this;
  }

  frame(x: number, y: number, rot = 0, scale = 1): this {
    this.x = x;
    this.y = y;
    this.rot = rot;
    this.scale = scale;
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
    return this;
  }

  /** Local → world. */
  at(lx: number, ly: number): [number, number] {
    const k = this.scale;
    return [this.x + (lx * this.c - ly * this.s) * k, this.y + (lx * this.s + ly * this.c) * k];
  }

  part(key: DrawnKey, lx = 0, ly = 0, lrot = 0, ls = 1, alpha = 1): void {
    const a = art(key);
    const [wx, wy] = this.at(lx, ly);
    const pv = (PIVOT as Partial<Record<DrawnKey, readonly [number, number]>>)[key];
    const px = pv ? pv[0] : 0, py = pv ? pv[1] : 0;
    const rot = this.rot + lrot, s = this.scale * ls, al = this.alpha * alpha;
    if (this.pass === 'solid') this.r.sprite(a, wx, wy, rot, s, al, px, py);
    else if (this.pass === 'glow') this.r.glow(a, wx, wy, rot, s, al, px, py);
    else this.r.white(a, wx, wy, rot, s, al, px, py);
  }
}
