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
    let struck = false;
    for (const t of boss.targets()) {
      if (within(b.x, b.y, t.x, t.y, b.radius + t.r)) {
        g.hitBoss(t.id, b.damage, b.x, b.y);
        struck = true;
        break;
      }
    }
    if (struck) {
      if (b.hits) b.hits.add(boss);
      else b.dead = true;
      continue;
    }
    // The carcass itself is armour: ordinary shots spark off it; piercing
    // lance shots spark but keep going so they can still reach the eye.
    const a = boss.armor();
    if (within(b.x, b.y, a.x, a.y, a.r)) {
      if (!b.hits) {
        g.fx.spark(b.x, b.y);
        b.dead = true;
      } else if (Math.random() < 0.25) {
        g.fx.spark(b.x, b.y);
      }
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
    if (boss.rams(p.x, p.y, PLAYER.bodyRadius) || boss.laserHits(p.x, p.y, PLAYER.hitRadius)) {
      g.hurtPlayer();
    }
  }
}
