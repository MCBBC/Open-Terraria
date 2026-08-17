// 笨笨气球史莱姆 686（AI_125，NPC.cs:44009-44139）——用户报障"下到地面以下/
// 卡地底下"触发：曾把 686 转成 bound 站地 TownNPC（丢失漂浮语义），现为真
// Enemy 漂浮 AI。断言：
//   ① 平地上方悬停：长跑 600t 恒在地表之上（永不下穿/卡地底）
//   ② 纯空域缓降：下方 8+ 格无遮挡 → vy 钳 ≤2/tick
//   ③ 湿（入水）→ 当 tick 爆裂死亡（原版 wet 支 :44032-44047）
//   ④ 前方近地遮挡 → 上升（flag2 −0.2 档）
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 160, H = 140, FLOOR = 100;

function makeWorld(opts?: { water?: boolean; wallAhead?: number }): World {
  const w = new World(W, H, 11, 'balloon-slime');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  if (opts?.water) {
    // 一格深水池在地板上（FLOOR-1 行液体）
    for (let x = 0; x < W; x++) st.setLiquid(x, FLOOR - 1, 255, 1);
  }
  if (opts?.wallAhead) {
    // 前方一列高墙（近距遮挡）
    for (let y = FLOOR - 12; y < FLOOR; y++) st.setTile(opts.wallAhead, y, 1);
  }
  return w;
}

function makeHooks(w: World, playerAt = { x: 5, y: 5 }) {
  const player = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    scene: {},
  } as unknown as GameHooks;
}

function balloon(w: World, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(686, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  return e!;
}

describe('AI_125 笨笨气球史莱姆（漂浮悬停）', () => {
  it('① 平地上方悬停 600t：恒在地表之上（不卡地底），留有悬停间隙', () => {
    // 玩家放地面同高远处（玩家在高空时 num2 加深会追平玩家高度=原版行为，另案）
    const w = makeWorld();
    const g = makeHooks(w, { x: 5, y: FLOOR - 2 });
    const e = balloon(w, 100, 60);
    const ai = (e as unknown as { balloonSlimeAI(h: GameHooks, p: Player | null): void }).balloonSlimeAI.bind(e);
    let minGap = Infinity;
    for (let t = 0; t < 600; t++) {
      ai(g, g.player);
      const gap = FLOOR * TILE - (e.y + e.h);
      if (gap < minGap) minGap = gap;
      expect(gap, `t=${t} 底边距地表 gap=${gap}`).toBeGreaterThanOrEqual(-0.5);
    }
    // 收尾悬停间隙：≥1 格（不贴地）且 ≤14 格（飘着不飞走）
    const finalGap = (FLOOR * TILE - (e.y + e.h)) / TILE;
    expect(finalGap).toBeGreaterThanOrEqual(1);
    expect(finalGap).toBeLessThanOrEqual(14);
    expect(e.dead).toBe(false);
    expect(minGap).toBeGreaterThanOrEqual(-0.5);
  });

  it('② 纯空域（下方 8+ 格无遮挡）：缓降 vy 钳 ≤2', () => {
    const w = makeWorld();
    const g = makeHooks(w);
    const e = balloon(w, 100, 20);   // 距地 80 格：前 8+ 格全空
    const ai = (e as unknown as { balloonSlimeAI(h: GameHooks, p: Player | null): void }).balloonSlimeAI.bind(e);
    for (let t = 0; t < 30; t++) ai(g, g.player);
    expect(e.vy).toBeLessThanOrEqual(2);
    expect(e.vy).toBeGreaterThan(0);
  });

  it('③ 湿（入水）→ 当 tick 爆裂死亡', () => {
    const w = makeWorld({ water: true });
    const g = makeHooks(w);
    const e = balloon(w, 100, FLOOR - 1);   // 直接泡进水格
    e.inWater = true;
    const ai = (e as unknown as { balloonSlimeAI(h: GameHooks, p: Player | null): void }).balloonSlimeAI.bind(e);
    ai(g, g.player);
    expect(e.dead).toBe(true);
  });

  it('④ 前方近地遮挡（高墙贴近前方）→ 上升档 vy<0', () => {
    const w = makeWorld({ wallAhead: 101 });
    const g = makeHooks(w);
    const e = balloon(w, 100, FLOOR - 10);
    e.facing = 1;                            // 朝墙
    const ai = (e as unknown as { balloonSlimeAI(h: GameHooks, p: Player | null): void }).balloonSlimeAI.bind(e);
    e.vx = 2;                                // 已达巡航速，纯看垂直档
    for (let t = 0; t < 10; t++) ai(g, null); // 无玩家 → 地形分支
    expect(e.vy).toBeLessThan(0);
  });
});
