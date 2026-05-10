import { Bullet } from '../entities/Bullet';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { Pickup } from '../entities/Pickup';
import type { Entity } from '../entities/Entity';
import type { Game } from '../Game';

export function resolveCollisions(game: Game, entities: readonly Entity[]): void {
  const playerBullets: Bullet[] = [];
  const enemyBullets: Bullet[] = [];
  const enemies: Enemy[] = [];
  const pickups: Pickup[] = [];
  let boss: Boss | null = null;

  for (const e of entities) {
    if (e.dead) continue;
    if (e instanceof Bullet) {
      if (e.side === 'player') playerBullets.push(e);
      else enemyBullets.push(e);
    } else if (e instanceof Enemy) enemies.push(e);
    else if (e instanceof Pickup) pickups.push(e);
    else if (e instanceof Boss) boss = e;
  }

  // Player bullets vs enemies
  for (const b of playerBullets) {
    if (b.dead) continue;
    let hit = false;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (b.pierce && b.hitTargets.has(enemy)) continue;
      const dx = b.x - enemy.x;
      const dy = b.y - enemy.y;
      const r = b.radius + enemy.radius;
      if (dx * dx + dy * dy <= r * r) {
        const killed = enemy.damage(b.damage);
        if (b.pierce) {
          b.hitTargets.add(enemy);
        } else {
          b.destroy();
        }
        game.onHit(enemy.x, enemy.y, killed, enemy.kind);
        hit = true;
        if (!b.pierce) break;
      }
    }
    if ((hit && !b.pierce) || b.dead) continue;

    if (boss && !boss.dead && !(b.pierce && b.hitTargets.has(boss))) {
      const dx = b.x - boss.x;
      const dy = b.y - boss.y;
      const r = b.radius + boss.radius;
      if (dx * dx + dy * dy <= r * r) {
        const killed = boss.damage(b.damage);
        if (b.pierce) {
          b.hitTargets.add(boss);
        } else {
          b.destroy();
        }
        game.onBossHit(boss.x, boss.y, killed);
      }
    }
  }

  const player = game.player;
  if (player && !player.dead) {
    for (const p of pickups) {
      if (p.dead) continue;
      const dx = player.x - p.x;
      const dy = player.y - p.y;
      const r = player.radius + p.radius;
      if (dx * dx + dy * dy <= r * r) {
        game.applyPowerUp(p.kind);
        p.dead = true;
      }
    }
  }

  if (player && !player.dead && !player.invincible) {
    // Enemy bullets vs player
    for (const b of enemyBullets) {
      if (b.dead) continue;
      const dx = player.x - b.x;
      const dy = player.y - b.y;
      const r = player.radius + b.radius;
      if (dx * dx + dy * dy <= r * r) {
        b.destroy();
        game.onPlayerHit(null);
        return;
      }
    }
    // Enemy ramming
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const r = player.radius + enemy.radius;
      if (dx * dx + dy * dy <= r * r) {
        game.onPlayerHit(enemy);
        return;
      }
    }
    // Boss ram
    if (boss && !boss.dead) {
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const r = player.radius + boss.radius;
      if (dx * dx + dy * dy <= r * r) {
        game.onPlayerHit(null);
        return;
      }
    }
    // Boss laser
    if (boss && !boss.dead && boss.laserHits(player.x, player.y, player.radius)) {
      game.onPlayerHit(null);
    }
  }
}
