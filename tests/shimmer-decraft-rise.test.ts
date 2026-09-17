// FX63（2026-09-17 用户拍板三刀）回归：微光 decraft 产物上浮域。
//   ① D1 散射初速对账修正：1457 SpawnShimmeredItem（WorldItem.cs:629-645）:631
//      `itemNumber * (itemNumber % 2 * 2 - 1)` = 整值 ±num7、Y 恒 0、RequestNewItem
//      全量覆盖；1457 num7 0 基（:1846/:1855），本仓 slots 1 基（1456 忠实移植）
//      → vx = (slots−1) 式。曾用 1456 旧式 n×(1+n·0.05)+父速×0.1（基线切换漏网）。
//   ② 偏差2（明令分歧）：decraftSpawnX 出生列预扫——通畅列出生/同距先右/|offset|≤6
//      钳/整湖有盖回退原位（=原版 SpawnShimmeredItem Center=center）。
//   ③ 偏差1（明令分歧）：上浮顶板钉死 ≥300t → tileCollide=false 穿块，脱离微光柱
//      （③支悬停）恢复。原版=永久钉死无超时（TileCollision 上行钳制 Collision.cs:2446）。
// 几何：池 cols 10..29,液 rows 33..39（满 255）,底 row 40;产物盒 12×12 居中出生列。
import { describe, it, expect } from 'vitest';
import { ItemDrop } from '../src/entities/ItemDrop';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { decraftOutcome, vanillaIdOfItem } from '../src/stats/Shimmer';
import type { GameHooks } from '../src/entities/types';

const W = 60, H = 256;

interface SpawnRec { x: number; y: number; vx: number; vy: number }

function poolWorld(): World {
  const w = new World(W, H, 11, 'shimmer-rise');
  const st = w.store;
  // 清空池上空（世界生成残面隔离,顶板几何全确定性）
  for (let x = 8; x < 48; x++) for (let y = 24; y <= 32; y++) st.setTile(x, y, 0);
  for (let x = 10; x < 30; x++) {
    st.setTile(x, 40, 1);                                              // 池底
    for (let y = 33; y < 40; y++) st.setLiquid(x, y, 255, 4);          // 微光满格
  }
  for (let x = 30; x < 46; x++) st.setTile(x, 40, 1);                  // 池外实地
  return w;
}

function hooks(w: World, p: Player, drops: ItemDrop[], spawns: SpawnRec[]): GameHooks {
  return {
    world: w, player: p,
    enemies: () => [], critters: () => [],
    // 镜像 Game.spawnDrop 落位语义（(x,y)=中心 → 左上 −6）;spawn 原始参全录
    spawnDrop: (x: number, y: number, key: string, stack: number, vx: number, vy: number) => {
      spawns.push({ x, y, vx, vy });
      const d = new ItemDrop(x - 6, y - 6, ITEM_BY_KEY[key], stack);
      d.vx = vx; d.vy = vy;
      drops.push(d);
      return d;
    },
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {},
  } as unknown as GameHooks;
}

/** 木镐位铜镐 3509（木材×12 + 铜矿×9,双材料无锁）投池底分解 → 产物垛 */
function decraft(w: World, h: GameHooks, drops: ItemDrop[], x = 20 * TILE, y = 36 * TILE): void {
  const d = new ItemDrop(x, y, ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3509]], 1);
  d.vx = 0; d.vy = 0;
  for (let i = 0; i < 400 && !d.dead; i++) d.fixedUpdate(1, h);
  expect(d.dead).toBe(true);                    // 分解完成（stack 归零 TurnToAir）
  expect(drops.length).toBe(2);
}

describe('D1 散射初速对齐 1457（SpawnShimmeredItem WorldItem.cs:631 整值 ±num7,0 基,Y=0）', () => {
  it('铜镐 3509 → 两垛 vx 由 (slots−1) 式给出 = [0,+1],vy 恒 0;出生 x=原物中心（无顶板 off=0 零偏差）', () => {
    const w = poolWorld();
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const drops: ItemDrop[] = [];
    const spawns: SpawnRec[] = [];
    const h = hooks(w, p, drops, spawns);
    decraft(w, h, drops);
    // 材料序金标：slots 1 基 [1,2]（Shimmer.decraftOutcome num7 按材料递增）
    const out = decraftOutcome(3509, 1, false, () => 0)!;
    expect(out.slots).toEqual([1, 2]);
    // 1457 :631 逐字（n = num7 = slots−1,0 基）→ [0,+1]；曾 1456 旧式 [1.05,−2.2]
    const expectVx = out.slots.map((s) => {
      const n = s - 1;
      return n * (n % 2 * 2 - 1) || 0;
    });
    expect(spawns.map((s) => s.vx)).toEqual(expectVx);
    expect(spawns.map((s) => s.vx)).toEqual([0, 1]);
    expect(spawns.every((s) => s.vy === 0)).toBe(true);   // :631 Y 恒 0（曾 =父速×0.1）
    expect(spawns.every((s) => s.x === 20 * TILE + 6)).toBe(true);  // off=0 保持原版中心像素
    expect(new Set(spawns.map((s) => s.y)).size).toBe(1);           // 同高出生（=原 cy）
    expect(drops.map((x) => vanillaIdOfItem(x.itemId)).sort((a, b) => a - b)).toEqual([9, 12]);
    expect(drops.every((x) => x.shimmered)).toBe(true);
  });
});

describe('偏差2 出生列预扫选择表（明令分歧 2026-09-17;原版对照 = 恒分解点出生）', () => {
  it('通畅列在 |offset|≤6 内 → 取最近（同距先右）;恰 ±7 拒取回退原位', () => {
    // 案1:顶板盖 15..29 → 最近通畅 = col 14（offset −6,右侧全盖）→ 取
    {
      const w = poolWorld();
      const st = w.store;
      for (let x = 15; x <= 29; x++) st.setTile(x, 32, 1);
      const p = new Player(45 * TILE, 30 * TILE, new Inventory());
      const drops: ItemDrop[] = [];
      const spawns: SpawnRec[] = [];
      const h = hooks(w, p, drops, spawns);
      decraft(w, h, drops);
      expect(spawns.every((s) => s.x === (14 + 0.5) * TILE)).toBe(true);
    }
    // 案2:顶板盖 14..29 → 最近通畅 = col 13（offset −7）→ 超钳,回退原物中心
    {
      const w = poolWorld();
      const st = w.store;
      for (let x = 14; x <= 29; x++) st.setTile(x, 32, 1);
      const p = new Player(45 * TILE, 30 * TILE, new Inventory());
      const drops: ItemDrop[] = [];
      const spawns: SpawnRec[] = [];
      const h = hooks(w, p, drops, spawns);
      decraft(w, h, drops);
      expect(spawns.every((s) => s.x === 20 * TILE + 6)).toBe(true);
    }
    // 案3:右侧全盖至钳外（21..26）,左侧近端 −3 通畅 → 取 col 17
    {
      const w = poolWorld();
      const st = w.store;
      for (let x = 18; x <= 27; x++) st.setTile(x, 32, 1);
      const p = new Player(45 * TILE, 30 * TILE, new Inventory());
      const drops: ItemDrop[] = [];
      const spawns: SpawnRec[] = [];
      const h = hooks(w, p, drops, spawns);
      decraft(w, h, drops);
      expect(spawns.every((s) => s.x === (17 + 0.5) * TILE)).toBe(true);
    }
  });

  it('部分顶板（18..22）→ 产物在通畅列 23 出生并浮出顶板上方悬停,全程零穿块', () => {
    const w = poolWorld();
    const st = w.store;
    for (let x = 18; x <= 22; x++) st.setTile(x, 32, 1);
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const drops: ItemDrop[] = [];
    const spawns: SpawnRec[] = [];
    const h = hooks(w, p, drops, spawns);
    decraft(w, h, drops);
    expect(spawns.every((s) => s.x === (23 + 0.5) * TILE)).toBe(true);  // col0=20,+3 取右
    for (let i = 0; i < 700; i++) drops.forEach((d) => d.fixedUpdate(1, h));
    for (const d of drops) {
      expect(d.tileCollide).toBeUndefined();        // 通畅列 → 兜底全程未启用
      expect(d.cy).toBeLessThan(32 * TILE);         // 浮出顶板上方（平衡 ~row 31）
      expect(d.shimmered).toBe(true);
    }
  });
});

describe('偏差1 钉死超时穿块（明令分歧 2026-09-17;原版 = 永久钉死无超时无恢复）', () => {
  it('整湖有盖:钉死期逐位原版（tileCollide 缺省+位置钳死）→ 恰 300 拍连锁翻 false → 浮出恢复悬停', () => {
    const w = poolWorld();
    const st = w.store;
    for (let x = 10; x <= 29; x++) st.setTile(x, 32, 1);   // 整湖顶板
    const p = new Player(45 * TILE, 30 * TILE, new Inventory());
    const drops: ItemDrop[] = [];
    const spawns: SpawnRec[] = [];
    const h = hooks(w, p, drops, spawns);
    decraft(w, h, drops);
    expect(spawns.every((s) => s.x === 20 * TILE + 6)).toBe(true);  // 整盖 → 回退原位
    const prod = drops[0];
    // 自由上浮 → 首次顶头（钳到 33*16 格底）→ 连锁计数
    let firstPin = -1, flipT = -1;
    for (let t = 0; t < 1200; t++) {
      prod.fixedUpdate(1, h);
      if (firstPin < 0 && prod.hitHead) firstPin = t;
      if (prod.tileCollide === false) { flipT = t; break; }
    }
    expect(firstPin).toBeGreaterThanOrEqual(0);
    expect(flipT).toBeGreaterThan(0);
    expect(flipT - firstPin).toBe(299);   // 恰 300 拍连锁（阈值±1 变异在此爆红）
    // 钉死期逐位原版（翻拍回看）:位置钳在顶板格底 + vy 上行被钳归零
    // （=原版 TileCollision 上行支同款;连锁断言已锚 300 拍内无早翻）
    expect(prod.y).toBe(33 * TILE);
    expect(prod.vy).toBe(0);
    for (let t = 0; t < 400 && prod.tileCollide === false; t++) prod.fixedUpdate(1, h);
    expect(prod.tileCollide).toBeUndefined();   // ③支悬停 → 恢复原版碰撞
    expect(prod.cy).toBeLessThan(32 * TILE);    // 已浮出顶板
    expect(prod.cy).toBeGreaterThan(28 * TILE); // 悬停不冲天（③支 vy×0.9 终止）
    for (let k = 0; k < 90; k++) prod.fixedUpdate(1, h);   // ③支 ×0.9 无截断,先衰尽动量
    const yHold = prod.cy;
    for (let k = 0; k < 60; k++) prod.fixedUpdate(1, h);
    expect(prod.tileCollide).toBeUndefined();
    expect(Math.abs(prod.cy - yHold)).toBeLessThan(2);   // 悬停稳定（动量已衰尽）
  });
});
