// 翅膀爬升复现（2026-08-13 报障"飞不高，像被限死在跳跃高度"）：
// 装天使之翼（493/槽2/FlyTime=100）按住跳 300t——原版应爬到 ~35+ 格
// （JS×1.5≈-9.9px/t 持续 100t），而非跳跃的 ~6 格。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

function makePlayer() {
  const w = new World(160, 300, 30, 'open');   // 高 300：避开下 40 格边框死区（原版 KillMe 语义）
  for (let x = 0; x < 120; x++) w.store.setTile(x, 100, 1);
  const p = new Player(50 * TILE, 90 * TILE, new Inventory());
  p.hp = 100;                              // hp 字段构造默认 100；冻结是 hp 0（旧模拟误判已清）
  p.x = 50 * TILE; p.y = 96 * TILE;        // 地面(100)上 4 格悬空
  const iid = ITEM_BY_KEY['vi_493_天使之翼'];
  p.inv.armor[3] = { id: iid, stack: 1 };
  const enemies: unknown[] = [];
  const hooks = {
    world: { store: w.store } as never,
    player: p as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
  } as unknown as GameHooks;
  return { w, p, hooks };
}

describe('翅膀爬升', () => {
  it('按住跳：天使之翼应爬远超跳跃高度（≥25 格）', () => {
    const { p, hooks } = makePlayer();
    expect(p.equipStats.wing?.logic).toBe(2);          // 装备链生效
    // 先落地站稳
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(p.onGround).toBe(true);
    const y0 = p.y;
    p.inputJump = true;
    let minY = Infinity;
    for (let t = 0; t < 300; t++) {
      p.fixedUpdate(1 / 60, hooks);
      minY = Math.min(minY, p.y);
    }
    const riseTiles = (y0 - minY) / TILE;
    // 跳跃本体 ~6 格；翅膀 100t 应 ~30-45 格（曾 6.2 格：重力未让位根因）
    console.log(`爬升 ${riseTiles.toFixed(1)} 格（wingTime 余 ${p.wingTime.toFixed(0)}/${p.equipStats.wing?.time}）`);
    expect(riseTiles).toBeGreaterThan(25);
    expect(p.wingTime).toBe(0);                     // 全额耗尽（曾 300t 只耗 2）
  });

  it('断翅滑翔：wingTime 耗尽后按住跳 = 重力/3 + 终端 maxFall/3（:27015-27027）', () => {
    const { p, hooks } = makePlayer();
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    p.wingTime = 0;                                  // 直接入滑翔态
    p.inputJump = true;
    for (let t = 0; t < 200; t++) p.fixedUpdate(1 / 60, hooks);
    // 终端速度 = MAX_FALL_SPEED/3 ≈ 16/3 ≈ 5.3
    expect(Math.abs(p.vy)).toBeLessThan(6.5);
  });
});








