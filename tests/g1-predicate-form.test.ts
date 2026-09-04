// ★G1 谓词形态批（2026-09-04）回归锁：仓内谓词语义 st.hasTile()=active()、
// st.isActive()=nactive()（active∧!inActive）、st.isActuated()=inActive。
// 覆盖红队 G1 审计五组修复点：
//   ① 床 CheckSpawn 3×3 净空门 flags→isActive（Player.cs:55216 nactive）——致动格
//     不构成床净空障碍（"Housing 致动可住"）。
//   ② 陶罐 smashPotInner 2×2 完整性 isActive→hasTile（CheckPot :57303 裸 active）——
//     致动罐=完整件照收集（"陶罐致动保留"）。
//   ③ CrackedBricks 链扫掷前补 hasTile 门（:64330 tile3.active() 掷前短路）——幽灵
//     裂砖不消耗 genRand 掷（全仓唯一掷流序污染点封口）+活性裂砖照常掷照常链。
//   ④ G2-F1 drainSandQueue 消费侧补沙格自身 hasTile 门（TileFrame :82614-82628
//     inactive 早退先于 :82657 SpawnFallingBlockProjectile）——幽灵沙格不落沙。
//   ⑤ checkDecorSupport 簇抽 3 点两向：
//      · 'sunflower'（nactive 组,CheckSunflower :54209）——致动格仍判坏=保留 isActive;
//      · 'pot'（active 组,CheckPot :57303）——致动件照活/幽灵件判坏=hasTile 双向;
//      · 'oasisplant'（active 组,CheckOasisPlant :48055）——同上双向。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { crackedChainKill } from '../src/world/CrackedBricks';

const keyOf = (k: string) => {
  const id = TILE_BY_KEY[k];
  expect(id, `def ${k} 应存在`).toBeDefined();
  return id!;
};
const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

/** Game 壳（Object.create(Game.prototype) + decor/smash/sand 链所需最小桩） */
function mkShell(w: World, opts: { drops?: Array<{ key: string; n: number }> } = {}) {
  const drops = opts.drops ?? [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnParticles = () => {};
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.potLoot = () => {};
  g.entities = { add: () => {}, critters: [], drops: [] };
  g.player = null;             // 载入期同门（smashPot gore / potLoot 跳过）
  g.trackTile = 0;
  return { g, drops };
}

/** 置幽灵残型格（flags=0,type≠0——生成期 active(false) 留型同构） */
function ghostize(st: TileStore, x: number, y: number) {
  st.flags[st.idx(x, y)] = 0;
}

// ===================== ① 床：致动格不构成净空障碍 =====================
describe('G1-① 床 CheckSpawn 3×3 净空门（Player.cs:55216 nactive→isActive）', () => {
  function buildBedWorld(seed: number) {
    const w = new World(200, 200, seed, 'g1-bed');
    const st = w.store;
    for (let x = 80; x <= 109; x++) {
      st.setTileSilent(x, 131, 2);
      st.setTileSilent(x, 119, 2);
    }
    for (let y = 119; y <= 131; y++) {
      st.setTileSilent(79, y, 2);
      st.setTileSilent(110, y, 2);
    }
    for (let x = 80; x <= 109; x++) {
      for (let y = 120; y <= 131; y++) st.setWallSilent(x, y, 4);
    }
    return w;
  }

  it('3×3 净空区内致动实心格 → 不拦（可设重生点）', () => {
    const w = buildBedWorld(4242);
    const st = w.store;
    const BED = keyOf('bed');
    st.setTileSilent(95, 125, BED, 0, 0);
    const DIRT = idOfSheet(0);
    st.setTileSilent(96, 124, DIRT, 0, 0);
    st.setActuated(96, 124, true);                  // 致动：nactive=false
    const { g } = mkShell(w);
    const res = (g as unknown as { checkBedSpawn(x: number, y: number): null | '' | string })
      .checkBedSpawn(95, 126);
    expect(res).toBeNull();
  });

  it('同位置活格实心 → BedObstructed（门本体仍有效）', () => {
    const w = buildBedWorld(4243);
    const st = w.store;
    const BED = keyOf('bed');
    st.setTileSilent(95, 125, BED, 0, 0);
    const DIRT = idOfSheet(0);
    st.setTileSilent(96, 124, DIRT, 0, 0);          // 活格不致动
    const { g } = mkShell(w);
    const res = (g as unknown as { checkBedSpawn(x: number, y: number): null | '' | string })
      .checkBedSpawn(95, 126);
    expect(res).toBe('Game.BedObstructed');
  });
});

// ===================== ② 陶罐：致动罐=完整件照收集 =====================
describe('G1-② smashPotInner 完整性门（CheckPot :57303 裸 active→hasTile）', () => {
  /** 两罐共边：A=(10..11,9..10)、B=(12..13,9..10),各自帧自洽（fx=dx*18,fy=dy*18） */
  function buildTwoPots(w: World, actuateA: boolean) {
    const st = w.store;
    const POT = idOfSheet(28);
    for (const [ax] of [[10], [12]] as const) {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        st.setTileSilent(ax + dx, 9 + dy, POT, dx * 18, dy * 18);
      }
    }
    if (actuateA) {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setActuated(10 + dx, 9 + dy, true);
    }
    return { POT, st };
  }

  it('A 罐全致动 → 帧解码完整臂照走（只清 A 2×2,共边 B 罐不被洪泛收编）', () => {
    const w = new World(40, 40, 7, 'g1-pot-act');
    const { POT, st } = buildTwoPots(w, true);
    const { g } = mkShell(w);
    (g as unknown as { smashPot(x: number, y: number): void }).smashPot(10, 9);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(st.get(10 + dx, 9 + dy)).toBe(0);      // A 整罐清
    }
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(st.get(12 + dx, 9 + dy)).toBe(POT);    // B 完好（若完整性误判→洪泛会吞 B）
    }
  });

  it('对照：活罐同样只清本件（门修复不改变活性路径）', () => {
    const w = new World(40, 40, 7, 'g1-pot-live');
    const { POT, st } = buildTwoPots(w, false);
    const { g } = mkShell(w);
    (g as unknown as { smashPot(x: number, y: number): void }).smashPot(10, 9);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) expect(st.get(10 + dx, 9 + dy)).toBe(0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) expect(st.get(12 + dx, 9 + dy)).toBe(POT);
  });
});

// ===================== ③ CrackedBricks：幽灵裂砖零掷 =====================
describe('G1-③ crackedChainKill 掷前 hasTile 门（WorldGen.cs:64330 裸 active 掷前短路）', () => {
  it('幽灵裂砖邻格：不消耗掷签、不被连锁清格', () => {
    const w = new World(40, 40, 7, 'g1-crack-ghost');
    const st = w.store;
    const C1 = idOfSheet(481), C2 = idOfSheet(482);
    const X = 20, Y = 20;
    st.setTileSilent(X, Y, C1, 0, 0);
    st.setTile(X, Y, 0);                     // 首格已被调用方清格（契约）
    st.setTileSilent(X - 1, Y, C1, 18, 0);   // 左邻=幽灵裂砖
    ghostize(st, X - 1, Y);
    st.setTileSilent(X + 1, Y, C2, 0, 0);    // 右邻=活性裂砖
    let rolls = 0;
    const rng = () => { rolls++; return 0; };  // Next(den)==0 恒命中
    const killed = crackedChainKill(st, X, Y, rng);
    expect(rolls).toBe(1);                    // 只有活性右邻消耗掷签（幽灵零掷）
    expect(killed).toContainEqual([X + 1, Y, 482]);
    expect(st.get(X - 1, Y)).toBe(C1);        // 幽灵裂砖留型不被清
    expect(st.flags[st.idx(X - 1, Y)]).toBe(0);
  });

  it('活性裂砖邻格：掷签照常消耗、未中签不链（活性路径不变）', () => {
    const w = new World(40, 40, 7, 'g1-crack-live');
    const st = w.store;
    const C1 = idOfSheet(481), C3 = idOfSheet(483);
    const X = 20, Y = 20;
    st.setTileSilent(X, Y, C1, 0, 0);
    st.setTile(X, Y, 0);                     // 首格已被调用方清格（契约）
    st.setTileSilent(X + 1, Y, C3, 0, 0);    // 右邻活性裂砖
    let rolls = 0;
    const rng = () => { rolls++; return 0.999; };  // Next(den)!=0 恒不中
    const killed = crackedChainKill(st, X, Y, rng);
    expect(rolls).toBe(1);                    // 活性邻格照常掷（哪怕不中）
    expect(killed).toEqual([]);
    expect(st.get(X + 1, Y)).toBe(C3);
  });
});

// ===================== ④ drainSandQueue：幽灵沙格不落沙 =====================
describe('G1-④ drainSandQueue 消费侧 hasTile 门（TileFrame :82614-82628 inactive 早退）', () => {
  function sandShell(seed: number) {
    const w = new World(64, 48, seed, 'g1-sand');
    const st = w.store;
    const SAND = keyOf('sand');
    const X = 30, Y = 20;
    // 清列段：下方（Y+1）留空 = blockBelowMakesSandFall 对【活】沙成立（失撑即塌）
    for (let y = Y - 1; y <= Y + 1; y++) st.setTileSilent(X, y, 0, 0, 0);
    st.setTileSilent(X, Y, SAND, 0, 0);
    const added: Array<unknown> = [];
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & { world: World };
    g.world = w;
    g.entities = { add: (e: unknown) => { added.push(e); return e; }, critters: [], drops: [] };
    g.sandQueue = [] as Array<[number, number]>;
    return { g: g as unknown as { drainSandQueue(): void; sandQueue: Array<[number, number]> }, st, SAND, added, X, Y };
  }

  it('幽灵沙格在队 → 不落沙不生实体、格留型', () => {
    const { g, st, SAND, added, X, Y } = sandShell(5150);
    ghostize(st, X, Y);
    g.sandQueue.push([X, Y]);
    g.drainSandQueue();
    expect(added).toEqual([]);
    expect(st.get(X, Y)).toBe(SAND);          // 幽灵格不被清不被转换
  });

  it('活沙同位 → 照常转 FallingBlock（活性路径不变）', () => {
    const { g, st, added, X, Y } = sandShell(5151);
    g.sandQueue.push([X, Y]);
    g.drainSandQueue();
    expect(added.length).toBe(1);
    expect(st.get(X, Y)).toBe(0);             // 沙格移除（弹体承接）
  });
});

// ===================== ⑤ decor 簇抽 3 点两向 =====================
describe('G1-⑤ checkDecorSupport 谓词簇抽点（两向）', () => {
  /** 'sunflower'（nactive 组,CheckSunflower :54209 isActive 保持）：2×4 + 草基 */
  function sunflowerWorld(seed: number) {
    const w = new World(40, 40, seed, 'g1-sunflower');
    const st = w.store;
    const SF = idOfSheet(27), GRASS = idOfSheet(2);
    for (let dx = 0; dx < 2; dx++) st.setTileSilent(10 + dx, 10, GRASS, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) {
      st.setTileSilent(10 + dx, 6 + dy, SF, dx * 18, dy * 18);
    }
    return { w, st, SF, GRASS };
  }

  it('sunflower：活件存活（正向）', () => {
    const { w, st, SF } = sunflowerWorld(601);
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 6);
    expect(st.get(10, 6)).toBe(SF);
  });

  it('sunflower：伙伴格致动 → 整件判坏（nactive 组保持 isActive 杀致动件）', () => {
    const { w, st } = sunflowerWorld(602);
    st.setActuated(11, 8, true);              // 伙伴格致动：nactive=false
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 6);
    expect(st.get(10, 6)).toBe(0);
  });

  /** 'pot'（active 组,CheckPot :57303 hasTile）：2×2 + 实心底行 */
  function potDecorWorld(seed: number) {
    const w = new World(40, 40, seed, 'g1-potdecor');
    const st = w.store;
    const POT = idOfSheet(28), STONE = idOfSheet(1);
    for (let dx = 0; dx < 2; dx++) st.setTileSilent(10 + dx, 11, STONE, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(10 + dx, 9 + dy, POT, dx * 18, dy * 18);
    }
    return { w, st, POT };
  }

  it('pot：件体全致动 → 仍判完整存活（hasTile 含致动位,正向两向之"致动保留"）', () => {
    const { w, st, POT } = potDecorWorld(603);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setActuated(10 + dx, 9 + dy, true);
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 9);
    expect(st.get(10, 9)).toBe(POT);
  });

  it('pot：伙伴格幽灵残型 → 判坏整件（幽灵不冒充活性,两向之"幽灵判坏"）', () => {
    const { w, st } = potDecorWorld(604);
    ghostize(st, 11, 9);
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 9);
    expect(st.get(10, 9)).toBe(0);
  });

  /** 'oasisplant'（active 组,CheckOasisPlant :48055 hasTile）：3×2 + 沙族实心底行 */
  function oasisWorld(seed: number) {
    const w = new World(40, 40, seed, 'g1-oasis');
    const st = w.store;
    const OASIS = idOfSheet(530), SAND = idOfSheet(53);
    for (let dx = 0; dx < 3; dx++) st.setTileSilent(10 + dx, 11, SAND, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(10 + dx, 9 + dy, OASIS, dx * 18, dy * 18);
    }
    return { w, st, OASIS };
  }

  it('oasisplant：件体全致动 → 存活（hasTile）', () => {
    const { w, st, OASIS } = oasisWorld(605);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) st.setActuated(10 + dx, 9 + dy, true);
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 9);
    expect(st.get(10, 9)).toBe(OASIS);
  });

  it('oasisplant：伙伴格幽灵残型 → 整件判坏', () => {
    const { w, st } = oasisWorld(606);
    ghostize(st, 12, 10);
    const { g } = mkShell(w);
    (g as unknown as { checkFurnitureSupport(x: number, y: number): void }).checkFurnitureSupport(10, 9);
    expect(st.get(10, 9)).toBe(0);
  });
});
