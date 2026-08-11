// Boss 战模拟:冰女王 345 发射 FrostWave 348 → 敌弹命中玩家掉血（端到端链路）。
// 链路:iceQueenAI → shootE（hostile:true Arrow）→ Arrow.fixedUpdate →
// hitPlayer → GameHooks.damagePlayer → Player.damage（防御减算 + iframes）。
// 此前全仓敌弹只判敌人桶,该链在 hitPlayer 一环断开——本探针锁定回归。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 120, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 7, 'icequeen-sim');
  const st = w.store;
  w.groundLevel = 50;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9; // 夜间（isDay = 0.25..0.75 之外）
  return w;
}

describe('冰女王敌弹命中玩家（端到端）', () => {
  it('FrostWave 348 命中玩家:玩家掉血 + damagePlayer 结算', () => {
    const world = makeWorld();
    const p = new Player(70 * TILE, 96 * TILE, new Inventory());
    const hp0 = p.hp;
    const hits: number[] = [];
    const enemies: Enemy[] = [];
    const projectiles: Array<{ fixedUpdate: (dt: number, g: GameHooks) => void; dead: boolean }> = [];
    const em = {
      nextId: 1,
      add: (e: unknown, bucket: string) => {
        const ent = e as { id: number };
        ent.id = em.nextId++;
        if (bucket === 'enemies') enemies.push(e as Enemy);
        else projectiles.push(e as typeof projectiles[number]);
      },
    };
    const hooks = {
      world, player: p, entities: em,
      enemies: () => enemies,
      critters: () => [],
      spawnDrop: () => null,
      damagePlayer: (dmg: number, sx: number, sy: number) => { hits.push(dmg); p.damage(dmg, sx, sy); },
      addDamageNumber: () => {},
      cutTile: () => {},
      onEnemyKilled: () => {},
      spawnEnemy: () => {},
      spawnParticles: () => {},
      notifyInventoryChanged: () => {},
      playSfx: () => {},
      playSfxFiles: () => {},
    } as unknown as GameHooks;

    // 冰女王悬在玩家上方（dxAbs<500 触发 FrostWave 节拍）
    const queen = Enemy.fromVanilla(345, 70 * TILE, 88 * TILE)!;
    queen.id = em.nextId++;
    enemies.push(queen);

    // 推进女王直到射出第一发敌弹（13 拍循环节奏,余量 1200 tick）
    let fired = 0;
    for (let t = 0; t < 1200 && fired === 0; t++) {
      if (!queen.dead) queen.fixedUpdate(1 / 60, hooks);
      fired = projectiles.length;
    }
    expect(fired).toBeGreaterThan(0); // 女王确实开火

    // 只推弹体（女王离场不再接触伤）,命中等在前方弹道上
    queen.dead = true;
    p.iframes = 0;
    for (let t = 0; t < 600 && hits.length === 0; t++) {
      for (const proj of [...projectiles]) {
        if (!proj.dead) proj.fixedUpdate(1 / 60, hooks);
      }
    }
    expect(hits.length).toBeGreaterThan(0); // 敌弹命中 → damagePlayer 结算
    expect(p.hp).toBeLessThan(hp0);          // 实际掉血
    expect(p.iframes).toBeGreaterThan(0);    // 无敌帧生效（后续命中去重）
  });
});
