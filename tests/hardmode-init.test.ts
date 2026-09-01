// 困难模式激活回归（HardmodePass = StartHardmode/initializeHardMode/GERunner）
// ★2026-09-01 F 批新增：F2 重复激活早退门 / F4 三特例分支（dualDungeons·remix·skyblock
// lowTiles）/ F1 抖动区间抽查锚（Next(-10,11) 含 +10 端点）。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { startHardmode, initializeHardMode } from '../src/world/gen/vanilla/HardmodePass';
import { doStartInHardmode } from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

interface Fixture { store: TileStore; crimson: boolean; seed: number; dungeonX: number; groundLevel: number; flags: Record<string, boolean>; seedFlags?: Record<string, boolean>; skyblockLowTiles?: boolean }

function makeWorld(w = 420, h = 220, crimson = false, seed = 20260813): Fixture {
  const store = new TileStore(w, h);
  const stone = TILE_BY_KEY['stone']!;
  const grass = TILE_BY_KEY['grass']!;
  const dirt = TILE_BY_KEY['dirt']!;
  for (let x = 0; x < w; x++) {
    store.setTileSilent(x, 70, grass);
    for (let y = 71; y < 90; y++) store.setTileSilent(x, y, dirt);
    for (let y = 90; y < h - 10; y++) store.setTileSilent(x, y, stone);
    for (let y = 72; y < h - 10; y++) store.setWallSilent(x, y, 63); // 地下泥墙族 63（GERunner 墙表成员）
  }
  return { store, crimson, seed, dungeonX: Math.floor(w / 2), groundLevel: 70, flags: {} };
}

/** sheet → 出现次数（活性 tile 口径） */
function sheetCounts(st: TileStore): Map<number, number> {
  const m = new Map<number, number>();
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      m.set(sh, (m.get(sh) ?? 0) + 1);
    }
  }
  return m;
}

/** UnifiedRandom InternalSample 观察钩计数窗（core/rng.ts __swOnRoll；观测不消费状态） */
function countRolls<T>(fn: () => T): { value: T; rolls: number } {
  const g = globalThis as { __swOnRoll?: (value: number, inst: object) => void };
  const prev = g.__swOnRoll;
  let n = 0;
  g.__swOnRoll = () => { n++; };
  try {
    return { value: fn(), rolls: n };
  } finally {
    g.__swOnRoll = prev;
  }
}

/** 全库位移摘要（type/wall 逐格拼接——二次调用零变换的强判定） */
function digestOf(st: TileStore): string {
  return `${Array.from(st.type).join(',')}|${Array.from(st.wall).join(',')}`;
}

describe('StartHardmode / initializeHardMode / GERunner', () => {
  it('激活置位 + 神圣/邪恶条带生成（腐化世界）', () => {
    const world = makeWorld(420, 220, false);
    const st = world.store;
    const { wasHard } = startHardmode(world as never);
    expect(wasHard).toBe(false);
    expect(world.flags.hardMode).toBe(true);
    const sheets = sheetCounts(st);
    expect((sheets.get(117) ?? 0)).toBeGreaterThan(0);   // 珍珠岩（神圣带 1/25/203→117）
    expect((sheets.get(109) ?? 0)).toBeGreaterThan(0);   // 神圣草（2→109）
    expect((sheets.get(25) ?? 0)).toBeGreaterThan(0);    // 魔岩石（腐化带 1/117→25）
    expect((sheets.get(23) ?? 0)).toBeGreaterThan(0);    // 腐化草（2→23）
    // 墙转换：条带路径泥墙 1 → 神圣 70 / 腐化 69
    let hallowWall = 0, corruptWall = 0;
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        const wl = st.wall[st.idx(x, y)];
        if (wl === 70) hallowWall++;
        else if (wl === 69) corruptWall++;
      }
    }
    expect(hallowWall).toBeGreaterThan(0);
    expect(corruptWall).toBeGreaterThan(0);
  });

  it('幂等：已激活再调返回 wasHard=true 且不再变换（全库 type/wall 位级）', () => {
    const world = makeWorld(420, 220, false, 42);
    startHardmode(world as never);
    const before = digestOf(world.store);
    const { wasHard } = startHardmode(world as never);
    expect(wasHard).toBe(true);
    expect(digestOf(world.store)).toBe(before);
  });

  it('猩红世界条带走猩红表（203/199 而非 25/23）', () => {
    const world = makeWorld(420, 220, true, 7);
    startHardmode(world as never);
    const sheets = sheetCounts(world.store);
    expect((sheets.get(203) ?? 0)).toBeGreaterThan(0);   // 猩红石
    expect((sheets.get(199) ?? 0)).toBeGreaterThan(0);   // 猩红草
    expect((sheets.get(25) ?? 0)).toBe(0);               // 腐化表不应出现
    expect((sheets.get(23) ?? 0)).toBe(0);
  });

  it('★F1 抖动端点：Next(-10,11) 含 +10（初速上档可达 1.0）', () => {
    // 直接构造 GERunner 同款分布探针：nextIntRange(-10,11) 必须 ≥-10 且 ≤10 且三段齐现
    for (let s = 0; s < 8; s++) {
      const rng = new RNG(1000 + s);
      let seenMax = -99, seenMin = 99;
      for (let k = 0; k < 400; k++) {
        const v = rng.nextIntRange(-10, 11);
        seenMax = Math.max(seenMax, v); seenMin = Math.min(seenMin, v);
      }
      expect(seenMin).toBeGreaterThanOrEqual(-10);
      expect(seenMax).toBeLessThanOrEqual(10);
      expect(seenMax).toBe(10);                            // 右开区间含 +10（旧 (-10,10) 恒 ≤9）
    }
  });
});

describe('★F2 重复激活早退门（StartHardmode cs:31992-31993）', () => {
  it('首次激活消费 RNG 并完成 V 带变换；二次杀不再跑 initializeHardMode（零掷骰+零变换）', () => {
    const world = makeWorld(420, 220, false, 42);
    const first = countRolls(() => startHardmode(world as never));
    expect(first.value.wasHard).toBe(false);
    expect(first.rolls).toBeGreaterThan(0);                // 首次：V 带位置掷 + 回填选点掷全走
    expect((sheetCounts(world.store).get(109) ?? 0)).toBeGreaterThan(0);
    const before = digestOf(world.store);

    const second = countRolls(() => startHardmode(world as never));
    expect(second.value.wasHard).toBe(true);
    expect(second.rolls).toBe(0);                          // ★早退门：hardMode && !force return
    expect(digestOf(world.store)).toBe(before);            // 全库 type/wall 位级不变
    expect(world.flags.hardMode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ★F4 三特例分支（dualDungeons 门 / remix 边缘带臂 / Skyblock.lowTiles 早退）
// ---------------------------------------------------------------------------
const HALLOW_FAMILY = [109, 117, 116, 164];
const EVIL_FAMILY = [23, 25, 112, 163];

function bandWorld(w: number): Fixture & { store: TileStore } {
  const fw = makeWorld(w, 220, false, 20260901);
  return fw;
}

describe('★F4① dualDungeons 门（cs:31864-31867）', () => {
  it('flag=false：双 GERunner 整段跳过（零转化），V 带位置掷照耗、回填照跑', () => {
    const world = bandWorld(420);
    (world as { seedFlags?: Record<string, boolean> }).seedFlags = { dualDungeons: true };
    const r = countRolls(() => initializeHardMode(world as never, new RNG(314)));
    expect(r.rolls).toBeGreaterThan(0);                    // 位置三掷 + 回填两掷/样点照耗（非整函数早退）
    const sheets = sheetCounts(world.store);
    for (const sh of [...HALLOW_FAMILY, ...EVIL_FAMILY]) expect(sheets.get(sh) ?? 0).toBe(0);
    // 墙面同样零转化（69/70/81 三族恒 0；回填门只认群系样点，本造景无样点不铺新墙）
    const st = world.store;
    let evilOrHallowWall = 0;
    for (let x = 0; x < st.w; x++) {
      for (let y = 0; y < st.h; y++) {
        const wl = st.wall[st.idx(x, y)];
        if (wl === 69 || wl === 70 || wl === 81 || (wl >= 188 && wl <= 203)) evilOrHallowWall++;
      }
    }
    expect(evilOrHallowWall).toBe(0);
  });
});

describe('★F4② remix 边缘带臂（cs:31906-31941，Convert case2 表）', () => {
  it('地牢在左 → 右缘带 [w-num7-num8,w)：外侧翼无条件神圣化、内侧翼仅邪块转、带外带顶不动', () => {
    const world = bandWorld(420);
    const st = world.store;
    world.dungeonX = 60;                                   // 地牢西侧 → num6=-1 → 右缘带
    (world as { seedFlags?: Record<string, boolean> }).seedFlags = { remix: true };
    // 造三个对照样本：外侧翼沙 / 内侧翼黑檀石与沙——内外两翼的行为差即分臂判据
    const S = (sheet: number) => TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === sheet);
    st.setTileSilent(340, 120, S(25));                     // 黑檀石 → 神圣化 117
    st.setTileSilent(350, 130, S(53));                     // 沙 → 内侧翼保留 53
    st.setTileSilent(400, 130, S(53));                     // 沙 → 外侧翼转珍珠沙 116
    st.setTileSilent(320, 150, TILE_BY_KEY['stone']!);     // 带外石（x<330）不动
    initializeHardMode(world as never, new RNG(2718));

    const sheetAt = (x: number, y: number): number => {
      const i = st.idx(x, y);
      return st.flags[i] ? TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1 : -2;
    };
    expect(sheetAt(400, 150)).toBe(117);                   // 外侧翼石→珍珠岩
    expect(sheetAt(400, 130)).toBe(116);                   // 外侧翼沙→珍珠沙
    expect(sheetAt(340, 120)).toBe(117);                   // 内侧翼邪块→神圣化
    expect(sheetAt(350, 130)).toBe(53);                    // 内侧翼中沙不转
    expect(sheetAt(320, 150)).toBe(1);                     // 带外原样
    expect(st.wall[st.idx(400, 110)]).toBe(70);            // case2 墙半区：泥墙族 63→70
    // 列顶行=(int)ws+Next(-1,2)：首处理行 ≥ ws-1=69 ⇒ 行 ≤67 的带内全程无写入
    for (const x of [330, 345, 360, 375, 400]) {
      for (let y = 0; y <= 67; y++) {
        const i = st.idx(x, y);
        expect(st.flags[i]).toBe(0);
        expect(st.wall[i]).toBe(0);
      }
    }
  });

  it('地牢在右 → 左缘带 [0,num7+num8)；且 lowTilesGate 不豁免 remix 臂（F4③ 只封 GERunner）', () => {
    const world = bandWorld(420);
    const st = world.store;
    world.dungeonX = 360;                                  // 东侧 → 左缘带
    (world as { seedFlags?: Record<string, boolean> }).seedFlags = { remix: true };
    (world as { skyblockLowTiles?: boolean }).skyblockLowTiles = true;   // ★remix 臂不理会 lowTiles
    const S = (sheet: number) => TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === sheet);
    st.setTileSilent(70, 120, S(25));                      // 内侧翼 [60..89] 邪块 → 神圣化
    st.setTileSilent(80, 130, S(53));                      // 内侧翼沙保留
    st.setTileSilent(100, 150, TILE_BY_KEY['stone']!);     // 带外石不动
    initializeHardMode(world as never, new RNG(161));
    const sheetAt = (x: number, y: number): number => {
      const i = st.idx(x, y);
      return st.flags[i] ? TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1 : -2;
    };
    expect(sheetAt(30, 150)).toBe(117);                    // 外侧翼 k<num7 石→117
    expect(sheetAt(70, 120)).toBe(117);                    // 内侧翼邪块→117
    expect(sheetAt(80, 130)).toBe(53);                     // 内侧翼沙不转
    expect(sheetAt(100, 150)).toBe(1);                     // 带外原样
    // 列顶行=(int)ws+Next(-1,2)：首处理行 ≥69 ⇒ 行 ≤67 全程无写入
    for (const x of [5, 30, 60, 89]) {
      for (let y = 0; y <= 67; y++) {
        const i = st.idx(x, y);
        expect(st.flags[i]).toBe(0);
        expect(st.wall[i]).toBe(0);
      }
    }
  });

  it('doStartInHardmode 直调路径吃到同一分支（生成期镜像确认）', () => {
    const world = bandWorld(420);
    const st = world.store;
    (world as { seedFlags?: Record<string, boolean> }).seedFlags = { dualDungeons: true };
    doStartInHardmode(world as never, new RNG(88));
    expect((world as unknown as { flags: { hardMode?: boolean } }).flags.hardMode).toBe(true);
    const sheets = sheetCounts(st);
    for (const sh of [...HALLOW_FAMILY, ...EVIL_FAMILY]) expect(sheets.get(sh) ?? 0).toBe(0);
  });
});

describe('★F4③ Skyblock.lowTiles 早退（GERunner cs:76941-76943）', () => {
  it('lowTiles=true：两侧条带零变换（回填照走）；twin 对照照常出神圣+邪恶族', () => {
    const low = bandWorld(420);
    const hi = bandWorld(420);
    (low as { skyblockLowTiles?: boolean }).skyblockLowTiles = true;
    initializeHardMode(low as never, new RNG(2026));
    initializeHardMode(hi as never, new RNG(2026));
    const sheetsL = sheetCounts(low.store);
    for (const sh of [...HALLOW_FAMILY, ...EVIL_FAMILY]) expect(sheetsL.get(sh) ?? 0).toBe(0);
    const sheetsH = sheetCounts(hi.store);
    expect((sheetsH.get(109) ?? 0) + (sheetsH.get(117) ?? 0)).toBeGreaterThan(0);
    expect((sheetsH.get(23) ?? 0) + (sheetsH.get(25) ?? 0)).toBeGreaterThan(0);
  });
});
