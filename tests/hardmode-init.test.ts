// 困难模式激活回归（HardmodePass = StartHardmode/initializeHardMode/GERunner）
import { describe, it, expect } from 'vitest';
import { startHardmode } from '../src/world/gen/vanilla/HardmodePass';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

interface Fixture { store: TileStore; crimson: boolean; seed: number; dungeonX: number; groundLevel: number; flags: Record<string, boolean> }

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

  it('幂等：已激活再调返回 wasHard=true 且不再变换', () => {
    const world = makeWorld(420, 220, false, 42);
    startHardmode(world as never);
    const before = world.store.type.slice(0, 4096).join(',');
    const { wasHard } = startHardmode(world as never);
    expect(wasHard).toBe(true);
    expect(world.store.type.slice(0, 4096).join(',')).toBe(before);
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
});
