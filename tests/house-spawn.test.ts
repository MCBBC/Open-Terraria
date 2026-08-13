import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY } from '../src/data/tiles';

// 房屋内不刷怪（FindSpawnTile L886 wallHouse 守卫）
describe('房屋墙刷怪守卫（wallHouse）', () => {
  it('木质墙房间内：落点全部被拒（50 次尝试全 miss）', () => {
    const w = new World(200, 200, 42, 'house');
    const st = w.store;
    // 玩家在 100,150；房间 90..110 × 140..160 全铺木墙(4)+石地板
    for (let x = 90; x <= 110; x++) {
      for (let y = 140; y <= 160; y++) {
        st.setWallSilent(x, y, 4); // Wood Wall = wallHouse
      }
      st.setTileSilent(x, 160, 2);
    }
    const sp = new VanillaSpawner(w);
    let spawned = 0;
    for (let k = 0; k < 300; k++) {
      const e = sp.spawn(100 * 16 + 8, 150 * 16, new RNG(k * 7 + 1), 30, 18);
      if (e) { spawned++; e.dead = true; }
    }
    expect(spawned).toBe(0); // 房间内（wallHouse 区）零生成
  });

  it('无墙区域（自然墙 0）：正常出怪', () => {
    const w = new World(200, 200, 42, 'open');
    const st = w.store;
    for (let x = 0; x < 200; x++) for (let y = 150; y < 200; y++) st.setTileSilent(x, y, 2);
    const sp = new VanillaSpawner(w);
    let spawned = 0;
    for (let k = 0; k < 300; k++) {
      const e = sp.spawn(100 * 16 + 8, 148 * 16, new RNG(k * 7 + 1), 30, 18);
      if (e) { spawned++; e.dead = true; }
    }
    expect(spawned).toBeGreaterThan(0);
  });
});

// 同房判定（TownRoomManager.CanNPCsLiveWithEachOther TownRoomManager.cs:153-155：
// housingCategory 不同才可同房）+ ScoreRoom 共用房豁免/避让（WorldGen.cs:5750-5763/5882-5886）
import { scoreRoom, canNPCsLiveWithEachOther, npcHousingCategory, type Room } from '../src/world/Housing';

describe('同房判定（CanNPCsLiveWithEachOther）', () => {
  it('housingCategory：城镇 NPC 全 0；城镇宠物（637/638/656/670/678-684）全 1', () => {
    for (const id of [22, 17, 18, 19, 20, 37, 38, 54, 107, 633, 663]) {
      expect(npcHousingCategory(id), `npc ${id}`).toBe(0);
    }
    for (const id of [637, 638, 656, 670, 678, 679, 680, 681, 682, 683, 684]) {
      expect(npcHousingCategory(id), `npc ${id}`).toBe(1);
    }
  });

  it('同类别不可同房：城镇×城镇 / 宠物×宠物 false；城镇×宠物 true（任一向）', () => {
    expect(canNPCsLiveWithEachOther(22, 17)).toBe(false);  // 向导 × 商人
    expect(canNPCsLiveWithEachOther(637, 678)).toBe(false); // 城镇猫 × 城镇史莱姆
    expect(canNPCsLiveWithEachOther(22, 637)).toBe(true);  // 向导 × 城镇猫
    expect(canNPCsLiveWithEachOther(637, 22)).toBe(true);  // 反向同样可同居
  });
});

describe('ScoreRoom 共用房（占用豁免 + 站位避让）', () => {
  /** 5×4 全格房间（含边界格入 tiles——floodRoom 同语义） */
  function boxRoom(st: { w: number; idx: (x: number, y: number) => number }): Room {
    const tiles = new Set<number>();
    for (let x = 100; x <= 104; x++) for (let y = 100; y <= 103; y++) tiles.add(st.idx(x, y));
    return { standX: 102, standY: 102, tiles };
  }

  it('同类别占用者 → 整房作废（score -1，原占用语义）', () => {
    const w = new World(200, 200, 42, 'score-occ');
    const room = boxRoom(w.store);
    const s = scoreRoom(w.store, room, [{ x: 102, y: 102, npcId: 22 }], 17);
    expect(s.score).toBe(-1);
  });

  it('可同居占用者（城镇申请 × 宠物占用）→ 不判占用；其 home 列 ±3 内站位分压至 1', () => {
    const w = new World(200, 200, 42, 'score-share');
    // 干净房间：地板行 103 全实心 + 上方净空，保证候选站位可得正分
    for (let x = 99; x <= 105; x++) for (let y = 103; y <= 104; y++) w.store.setTileSilent(x, y, 2);
    const room = boxRoom(w.store);
    const s = scoreRoom(w.store, room, [{ x: 102, y: 102, npcId: 637 }], 22);
    expect(s.score).toBeGreaterThan(0);           // 不再整房作废
    // 无占用基线分 vs 共用房分：同居者所在列附近被压到 1 → 分数不高于基线的最优
    const base = scoreRoom(w.store, room, [], 22);
    expect(s.score).toBeLessThanOrEqual(base.score);
  });

  it('占用者 id 缺省（旧调用口径）按城镇 NPC 处理 → 城镇申请者照旧判占用', () => {
    const w = new World(200, 200, 42, 'score-legacy');
    const room = boxRoom(w.store);
    expect(scoreRoom(w.store, room, [{ x: 102, y: 102 }], 22).score).toBe(-1);
  });
});

// ================= 入驻找房锚点窗（QuickFindHome WorldGen.cs:5665-5727） =================
// 原版只对锚点校验：锚点 → ±1 → ±10 螺旋（:5684-5691），窗外结构（地下神庙/地牢
// 等生成房）永不成为候选——findFreeHouse 的门枚举必须限锚点 ±10 窗内
import { T } from '../src/data/tiles';
import { findFreeHouse } from '../src/world/Housing';
import type { TileStore as TileStoreT } from '../src/world/TileStore';

/** 一套合格房：10×6 内室 + 木墙(wallHouse 4)围一圈 + 左壁 3 格门 + 工作台/椅/火把。
 *  返回门顶格（checkRoom 门锚语义）；x0/y0 = 内室左上角 */
function buildHouse(st: TileStoreT, x0: number, y0: number): { doorX: number; doorY: number } {
  for (let x = x0 - 1; x <= x0 + 10; x++) {
    for (let y = y0 - 1; y <= y0 + 6; y++) {
      const border = x === x0 - 1 || x === x0 + 10 || y === y0 - 1 || y === y0 + 6;
      st.setWallSilent(x, y, 4);
      st.setTileSilent(x, y, border ? T.WOOD : 0);
    }
  }
  for (let dy = 0; dy < 3; dy++) st.setTileSilent(x0 - 1, y0 + 3 + dy, T.DOOR_CLOSED);
  st.setTileSilent(x0 + 1, y0 + 5, T.WORKBENCH);                       // 桌（sheet 18）
  st.setTileSilent(x0 + 3, y0 + 5, TILE_BY_KEY['chair']!);             // 椅
  st.setTileSilent(x0 + 5, y0 + 5, T.TORCH);                           // 灯
  return { doorX: x0 - 1, doorY: y0 + 3 };
}

describe('入驻找房锚点窗（QuickFindHome ±10）', () => {
  it('地下深处（锚点 ±100 外）的完美房不被入住；同一房在近锚点下可入住（对照证明房本身合格）', () => {
    const w = new World(300, 300, 42, 'anchor-win');
    const st = w.store;
    buildHouse(st, 220, 250); // 地下深处：距锚点 (100,150) 远超 ±100
    // 锚点在出生点（冷启 LastFoundHouse 兜底口径）：远处房不可见
    expect(findFreeHouse(st, [], 100, 150, 22)).toBeNull();
    // 锚点移到该房旁（= 已安家 NPC 的 home 落在此）：同一间房即可见——
    // 证明 null 是窗裁剪所致而非房不合格
    expect(findFreeHouse(st, [], 224, 253, 22)).not.toBeNull();
  });

  it('锚点 ±10 内放房 → 被入住，站位落在房内', () => {
    const w = new World(300, 300, 42, 'anchor-near');
    const st = w.store;
    buildHouse(st, 95, 147); // 门顶 (94,150)：距锚点 (100,150) 恰在 ±10 窗内
    const house = findFreeHouse(st, [], 100, 150, 22);
    expect(house).not.toBeNull();
    expect(house!.standX).toBeGreaterThanOrEqual(95);
    expect(house!.standX).toBeLessThanOrEqual(104);
    expect(house!.standY).toBe(152); // 地板上一行（内室底 y=152）
  });

  it('窗边界 1:1：门锚恰在 anchor±10 内可见，anchor±11 外不可见', () => {
    const w = new World(300, 300, 42, 'anchor-edge');
    const st = w.store;
    buildHouse(st, 91, 147);  // 门列 x=90 = 100-10 → 含（原版 k<=homeX+num 闭区间）
    expect(findFreeHouse(st, [], 100, 150, 22)).not.toBeNull();
    const w2 = new World(300, 300, 42, 'anchor-edge2');
    const st2 = w2.store;
    buildHouse(st2, 90, 147); // 门列 x=89 = 100-11 → 窗外（内室仍在窗内但无门锚）
    expect(findFreeHouse(st2, [], 100, 150, 22)).toBeNull();
  });
});
