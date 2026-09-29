import { PLAYER } from '../../config';
import type { Game } from '../Game';

const within = (ax: number, ay: number, bx: number, by: number, r: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy <= r * r;
};

export function collide(g: Game): void {
  const boss = g.boss;

  // Player shots → enemies / boss.
  for (const b of g.playerBullets) {
    if (b.dead) continue;
    for (const e of g.enemies) {
      if (e.dead || (b.hits && b.hits.has(e))) continue;
      if (!within(b.x, b.y, e.x, e.y, b.radius + e.radius)) continue;
      g.hitEnemy(e, b.damage, b.x, b.y);
      if (b.hits) b.hits.add(e);
      else { b.dead = true; break; }
    }
    if (b.dead || !boss || boss.dead || boss.entering || (b.hits && b.hits.has(boss))) continue;
    if (within(b.x, b.y, boss.x, boss.y, b.radius + boss.radius)) {
      g.hitBoss(b.damage, b.x, b.y);
      if (b.hits) b.hits.add(boss);
      else b.dead = true;
    }
  }

  const p = g.player;
  if (!p.alive) return;

  for (const pk of g.pickups) {
    if (!pk.dead && within(p.x, p.y, pk.x, pk.y, PLAYER.pickupRadius + pk.radius)) {
      pk.dead = true;
      g.collect(pk);
    }
  }

  if (p.invulnerable) return;

  for (const b of g.enemyBullets) {
    if (b.dead) continue;
    const dx = p.x - b.x, dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    const hit = PLAYER.hitRadius + b.radius;
    if (d2 <= hit * hit) {
      b.dead = true;
      g.hurtPlayer();
      return;
    }
    if (!b.grazed) {
      const gr = PLAYER.grazeRadius + b.radius;
      if (d2 <= gr * gr) {
        b.grazed = true;
        g.graze(b);
      }
    }
  }

  for (const e of g.enemies) {
    if (!e.dead && within(p.x, p.y, e.x, e.y, PLAYER.bodyRadius + e.radius * 0.75)) {
      g.hitEnemy(e, 4, e.x, e.y);
      g.hurtPlayer();
      return;
    }
  }

  if (boss && !boss.dead && !boss.entering) {
    if (within(p.x, p.y, boss.x, boss.y, PLAYER.bodyRadius + boss.radius * 0.8) || boss.laserHits(p.x, p.y, PLAYER.hitRadius)) {
      g.hurtPlayer();
    }
  }
}
