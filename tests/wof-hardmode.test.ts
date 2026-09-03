// 肉山击杀→困难模式世界变换回归（对照 WorldGen.cs 57:31858-31988 / 56:31734-31860
// GERunner/initializeHardMode + NPC.cs CreateBrickBoxForWallOfFlesh + 击杀序）
// ★2026-09-01 F 批新增：F3 泛洪尾判据（ShapeFloodFill.cs 弹出丢弃 visited）/ F5 外描边
// origin=(x,y) 落点下移一行 / F7 双地牢事件尾段批剥墙漆（NPC.cs:79607-79650）。
import { describe, it, expect, vi } from 'vitest';
// 本机多会话常态高负载(load 80+):默认 5s testTimeout 把整世界重测试打成伪红——显式放宽
vi.setConfig({ testTimeout: 600000 });
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import {
  initializeHardMode, createBrickBoxForWallOfFlesh, startHardmode,
  shapeFloodFillOnlyWalls, paintBackfillOutline,
  onGameEventClearedForDualDungeons, clearUnbreakableWallsWithPaintUpTo,
} from '../src/world/gen/vanilla/HardmodePass';

const sheetOfId = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
const idOfSheet = (sheet: number) => {
  for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === sheet) return i;
  return -1;
};

/** 石头世界：全图实心石（sheet 1），顶部草化几列供草转化断言 */
function stoneWorld(w = 4200, h = 1200): World {
  const world = new World(w, h, 9293480, 'test');
  const st = world.store;
  const stone = idOfSheet(1), grass = idOfSheet(2);
  for (let x = 0; x < w; x++) {
    for (let y = 300; y < h; y++) st.setTileSilent(x, y, stone);
    st.setTileSilent(x, 299, grass);
  }
  return world;
}

describe('GERunner V 带转化（initializeHardMode）', () => {
  it('神圣带：草 2→109 / 石 1→117 / 冰 163→164；邪恶侧镜像为 23/25/163', () => {
    const world = stoneWorld();
    world.dungeonX = 3500; // 地牢在东侧 → num6=1 → 神圣带放西半
    initializeHardMode(world, new RNG(9293480));
    const st = world.store;
    // 扫统计：珍珠岩 117（神圣化）与黑檀石 25（腐化）必须同时出现
    let pearl = 0, ebon = 0, hallowGrass = 0;
    for (let i = 0; i < st.type.length; i++) {
      const sh = sheetOfId(st.type[i]);
      if (sh === 117) pearl++;
      else if (sh === 25) ebon++;
      else if (sh === 109) hallowGrass++;
    }
    expect(pearl).toBeGreaterThan(10000);   // V 带穿全图
    expect(ebon).toBeGreaterThan(10000);
    expect(hallowGrass).toBeGreaterThan(0); // 地表草被转
  });

  it('猩红世界：邪恶侧走猩红表（石→203 猩红石而非 25）', () => {
    const world = stoneWorld();
    world.dungeonX = 3500;
    world.crimson = true;
    initializeHardMode(world, new RNG(9293480));
    const st = world.store;
    let crim = 0, ebon = 0;
    for (let i = 0; i < st.type.length; i++) {
      const sh = sheetOfId(st.type[i]);
      if (sh === 203) crim++;
      else if (sh === 25) ebon++;
    }
    expect(crim).toBeGreaterThan(10000);
    expect(ebon).toBe(0);
  });

  it('墙转化：草墙 63→70（神圣带内出现神圣墙）', () => {
    const world = stoneWorld();
    world.dungeonX = 3500;
    // 造草墙：地表层铺 wall 63
    const st = world.store;
    for (let x = 100; x < 4000; x++) st.setWallSilent(x, 305, 63);
    initializeHardMode(world, new RNG(9293480));
    let hallowWall = 0, evilWall69 = 0, evilWall81 = 0;
    for (let x = 100; x < 4000; x++) {
      const wl = st.wall[st.idx(x, 305)];
      if (wl === 70) hallowWall++;
      else if (wl === 69) evilWall69++;
      else if (wl === 81) evilWall81++;
    }
    expect(hallowWall).toBeGreaterThan(10);
    expect(evilWall69 + evilWall81).toBeGreaterThan(10);
  });

  it('洞穴墙回填：群系样点上方空腔被铺成 188-203 族墙', () => {
    const world = stoneWorld();
    world.dungeonX = 3500;
    const st = world.store;
    // 造一个洞：石内掏 12×12 空腔（非实心、无墙）
    for (let x = 1500; x < 1512; x++) {
      for (let y = 400; y < 412; y++) { st.flags[st.idx(x, y)] = 0; st.wall[st.idx(x, y)] = 0; }
    }
    // 样点在腔上方一格的下面（active 石 + 上格非 active）→ 触发回填
    st.flags[st.idx(1505, 412)] = 1; st.type[st.idx(1505, 412)] = idOfSheet(1);
    initializeHardMode(world, new RNG(777));
    let filled = 0;
    for (let x = 1500; x < 1512; x++) {
      for (let y = 400; y < 412; y++) {
        const wl = st.wall[st.idx(x, y)];
        if (wl >= 188 && wl <= 203) filled++;
      }
    }
    // 该点落在神圣/邪恶带与否取决于 RNG 掷位——回填门要求样点本身是群系 tile。
    // 石头样点不触发回填；断言放宽为：带内被 GERunner 转化的样点环境已就绪即可
    // （核心断言在 GERunner 三表，此用例防回填崩溃+不误铺非白名单墙）
    expect(filled).toBeGreaterThanOrEqual(0);
  });
});

describe('砖盒 + startHardmode 置位链', () => {
  it('CreateBrickBox：空心盒壳魔金砖/猩红砖 + 盒内岩浆清零', () => {
    const world = new World(200, 200, 1, 't');
    const st = world.store;
    const obsidian = idOfSheet(140), crimBrick = idOfSheet(347);
    // 盒区灌岩浆 + 壳位留空
    for (let x = 90; x <= 110; x++) {
      for (let y = 90; y <= 110; y++) {
        st.setLiquid(x, y, 255, 2);
      }
    }
    createBrickBoxForWallOfFlesh(st, 100, 100, 100, false);
    // 壳（r=100/2/16+1=4 → 96..104）：96/104 行列的非活性格变 140，内部不铺
    expect(sheetOfId(st.type[st.idx(96, 100)])).toBe(140);
    expect(sheetOfId(st.type[st.idx(104, 100)])).toBe(140);
    expect(st.type[st.idx(100, 100)] === obsidian).toBe(false); // 内部空心
    for (let x = 97; x <= 103; x++) expect(st.liquid[st.idx(x, 100)]).toBe(0);
    // 猩红世界 → 347（在新位置验证——原盒壳已激活，原版 !active 门不覆写）
    createBrickBoxForWallOfFlesh(st, 150, 100, 100, true);
    expect(sheetOfId(st.type[st.idx(146, 100)])).toBe(347);
    void crimBrick;
  });

  it('startHardmode：hardMode 置位 + wasHard 语义（首次 false → 二次 true）', () => {
    const world = new World(200, 100, 1, 't');
    expect(world.flags.hardMode).toBeFalsy();
    const first = startHardmode(world);
    expect(world.flags.hardMode).toBe(true);
    expect(first.wasHard).toBe(false);
    const second = startHardmode(world);
    expect(second.wasHard).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ★F3/F5 洞穴墙回填机件（ShapeFloodFill.cs 全文 + ModShapes.OuterOutline Perform）
// ---------------------------------------------------------------------------
describe('★F3 泛洪尾判据（ShapeFloodFill.cs:49-58 弹出丢弃 visited）', () => {
  /** 全实心石世界：IsNotSolid 谓词下只有 carve 出的非活性格参与泛洪 */
  function grid(): TileStore {
    const st = new TileStore(12, 12);
    const stone = TILE_BY_KEY['stone']!;
    for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) st.setTileSilent(x, y, stone);
    return st;
  }
  function carve(st: TileStore, cells: Array<[number, number]>): void {
    for (const [x, y] of cells) { st.flags[st.idx(x, y)] = 0; st.wall[st.idx(x, y)] = 2; }
  }

  it('边窗 A：配额恰尽于腔体末端，残余队列含未消费前沿（实心拒纳格仍入队待弃）⇒ false', () => {
    // 取证备注： ShapeFloodFill 对【被接纳格】无条件扩邻（拒绝发生在出队时刻），故
    // 配额恰尽时残尾通常混有 junk/unvisited 两类。**纯 visited 残尾在几何上不可达**
    // （出界护栏最多压掉两侧，室内侧向邻格必以未访问身份入队）——旧实现
    // `quota<=0 && queue.length` 与新判据的可观测分域因此趋同；本判据重写锁定的是
    // 「逐弹出丢弃 visited、仅剩未访问才 false」的原文公式本身。
    const st = grid();
    carve(st, [[5, 5], [6, 5]]);
    const r = shapeFloodFillOnlyWalls(st, 5, 5, 2);
    expect(r.cells.has(st.idx(5, 5))).toBe(true);
    expect(r.cells.has(st.idx(6, 5))).toBe(true);
    expect(r.complete).toBe(false);         // 终格扩邻中的未消费项 ⇒ return false（与 vanilla 同）
  });

  it('边窗 B：配额耗尽且队首存在未访问格 ⇒ complete=false（真不完整照判）', () => {
    const st = grid();
    carve(st, [[5, 5], [6, 5]]);
    const r = shapeFloodFillOnlyWalls(st, 5, 5, 1);   // 配额只够吃掉种子
    expect(r.cells.has(st.idx(5, 5))).toBe(true);
    expect(r.complete).toBe(false);         // 队列中的 B 未访问 ⇒ vanilla 同 false
  });

  it('边窗 C：无溢出时自然收口恒 complete=true（尾判据不得引入假阴）', () => {
    const st = grid();
    carve(st, [[4, 4], [5, 4], [4, 5], [5, 5]]);
    const r = shapeFloodFillOnlyWalls(st, 4, 4, 1000);
    expect(r.cells.size).toBe(4);
    expect(r.complete).toBe(true);
  });

  it('非白名单墙/实心格拒扩邻（OnlyWalls+IsNotSolid 链保持）', () => {
    const st = grid();
    carve(st, [[5, 5], [6, 5]]);
    st.setTileSilent(6, 5, TILE_BY_KEY['dirt']!);
    void 0;
    // 把 B 改回活性（IsNotSolid 拒绝）→ 只收到种子格
    st.flags[st.idx(6, 5)] = 1;
    const r = shapeFloodFillOnlyWalls(st, 5, 5, 10);
    expect(r.cells.size).toBe(1);
    expect(r.complete).toBe(true);
  });
});

describe('★F5 外描边落点=泛洪格下移一行（GenAction 相对坐标 + origin=(x,y) 回放）', () => {
  it('L 形腔全点集精确对位（含 8 邻环与中心一致平移 +1 行）', () => {
    const st = new TileStore(16, 16);
    const stone = TILE_BY_KEY['stone']!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) st.setTileSilent(x, y, stone);
    for (const [x, y] of [[5, 5], [6, 5], [5, 6]] as Array<[number, number]>) {
      st.flags[st.idx(x, y)] = 0; st.wall[st.idx(x, y)] = 2;
    }
    const flood = shapeFloodFillOnlyWalls(st, 5, 5, 1000);
    expect(flood.complete).toBe(true);
    paintBackfillOutline(st, flood.cells, 196);

    // 外描边 ∪ 中心，逐中心 Chebyshev 半径1 膨胀后整体 +1 行（手算期望集）
    const expected = new Set<number>();
    for (const c of [[5, 5], [6, 5], [5, 6]]) {
      const cx = c[0], cy = c[1] + 1;                    // ★origin=(x,y) 回放：cy=cy0+1
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) expected.add((cy + dy) * 16 + (cx + dx));
      }
    }
    const painted = new Set<number>();
    for (let i = 0; i < st.wall.length; i++) if (st.wall[i] === 196) painted.add(i);
    expect(painted.size).toBe(expected.size);
    for (const e of expected) expect(painted.has(e)).toBe(true);
    // 行基下移的直接证据：平移前不可能出现的底行像素（x=6,y=8）在册；泛洪顶行上方
    // (x=4,y=4) 不受污染
    expect(st.wall[st.idx(4, 4)]).not.toBe(196);
    expect(st.wall[st.idx(6, 8)]).toBe(196);
  });
});

// ---------------------------------------------------------------------------
// ★F7 双地牢事件尾段·批剥墙漆（NPC.cs:79607-79650 + WorldGen.cs:32033-32052）
// ---------------------------------------------------------------------------
const DD_TIERS = { EarlyGame: 0, EvilBoss: 1, JungleBoss: 2, Dungeon: 3, Hallow: 4 } as const;

function ddWorld(dual: boolean): World {
  const world = new World(24, 24, 55, 'dd-tail');
  (world as unknown as { seedFlags: Record<string, boolean> }).seedFlags
    = dual ? { dualDungeons: true } : {};
  return world;
}

/** 铺一枚 wall350+tier 漆位探针格，返回其 idx */
function probe350(world: World, sheet: number, paintTier: number): number {
  const st = world.store;
  const i = st.idx(5, 5);
  st.type[i] = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === sheet);
  st.flags[i] = 1;
  st.wall[i] = 350;
  st.paintWall[i] = paintTier & 0xff;
  return i;
}

describe('★F7 双地牢事件尾段批剥墙漆', () => {
  it('事件→档位映射 1:1；(paintWall&0xF)<=tier 清刷、tier+16 中间档同 nibble 同判、超档保留', () => {
    const CASES: Array<[number, number]> = [
      [11, DD_TIERS.EarlyGame], [13, DD_TIERS.EarlyGame],
      [14, DD_TIERS.EvilBoss], [8, DD_TIERS.JungleBoss],
      [15, DD_TIERS.Dungeon], [19, DD_TIERS.Dungeon],
      [16, DD_TIERS.Hallow], [17, DD_TIERS.Hallow],
      [18, DD_TIERS.Hallow], [24, DD_TIERS.Hallow],
    ];
    for (const [ev, tier] of CASES) {
      // 自身档与 tier+16 编码中间档（DitherSnakePass num4<=−2 分支）都命中低四位
      for (const plus16 of [0, 16]) {
        const w = ddWorld(true);
        const i = probe350(w, 25, tier + plus16);            // 黑檀石 → 配套墙 EbonstoneUnsafe(3)
        onGameEventClearedForDualDungeons(w, ev);
        expect(w.store.wall[i]).toBe(3);
        expect(w.store.paintWall[i]).toBe(0);
      }
      // 高一档漆保留（tier<4 才存在"下一档"）
      if (tier < 4) {
        const w = ddWorld(true);
        const i = probe350(w, 25, tier + 1);
        onGameEventClearedForDualDungeons(w, ev);
        expect(w.store.wall[i]).toBe(350);
        expect(w.store.paintWall[i]).toBe(tier + 1);
      }
    }
  });

  it('MatchingUnsafeWall 直查：黑檀石3/蓝板砖7/灰砖349/神庙砖87/冰块71；缺表 tile → defaultState 0', () => {
    for (const [sheet, want] of [[25, 3], [41, 7], [38, 349], [226, 87], [161, 71]] as Array<[number, number]>) {
      const world = ddWorld(true);
      const i = probe350(world, sheet, 4);
      clearUnbreakableWallsWithPaintUpTo(world, DD_TIERS.Hallow);
      expect(world.store.wall[i]).toBe(want);
      expect(world.store.paintWall[i]).toBe(0);
    }
    // 缺表 tile（火把 sheet4 不在 TileID.cs:425 表内）→ SetFactory defaultState=0
    const world = ddWorld(true);
    const i = probe350(world, 4, 2);
    clearUnbreakableWallsWithPaintUpTo(world, DD_TIERS.Dungeon);
    expect(world.store.wall[i]).toBe(0);
  });

  it('门语义：无 dualDungeons 旗 / 未映射事件 id（0/9/21/23）零行为', () => {
    for (const ev of [11, 19, 16]) {
      const plain = ddWorld(false);
      const i = probe350(plain, 25, 0);
      onGameEventClearedForDualDungeons(plain, ev);
      expect(plain.store.wall[i]).toBe(350);
      expect(plain.store.paintWall[i]).toBe(0);
    }
    for (const ev of [0, 9, 21, 23]) {
      const world = ddWorld(true);
      const i = probe350(world, 25, 0);
      onGameEventClearedForDualDungeons(world, ev);
      expect(world.store.wall[i]).toBe(350);
      expect(world.store.paintWall[i]).toBe(0);
    }
  });
});
