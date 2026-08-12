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
