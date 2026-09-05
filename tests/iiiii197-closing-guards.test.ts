// IIIII197 终局回归资产固化审计·行为面守卫（收官波 12 刀中可单元驱动的 9 面）。
// 配套结构锁见 tests/iiiii197-structure-locks.test.ts（闭包内刀：柱冠/画额/IF 支/表支等）。
// 每刀对应 src 内 ★IIII18x/★IIIII19x 批注锚：
//   ②AttemptFossilShattering（CLXXI/IIII194，TrapsPass killTileWhole 链）
//   ③mayan dual 下扫界+num17 锚（CLXXI/IIII194，TemplePass.mayanTrap）
//   ⑤AddManaCrystal 臂（IIIII183，StructuresPass.runLifeCrystalsPass 第二臂）
//   ⑥③提炼机 642 派发（IIIII184，CaveHousePass.placeFurniture case 642）
//   ⑦placeTilePrologueClear 预清臂（CLVI/CL 章，WorldGenTileHelpers）
//   ⑧③Quick_Cleanup 动态 tileSolid（IIIII187 #70，QuickCleanupPass）
//   ⑨Pots 巨石尾支+Check2x2 尾 4×4 补帧扫（CLXX/IIII192，PilesPass/TrapsPass）
//   ⑩C3 吊灯两段化（CXLV/IIII169·R5，CaveHousePass case 34）
//   ⑫GenSolid 轨段时线补播机制原语（CLXIX/IIII193，GenSolid snapshot/restore）
import { describe, it, expect, beforeEach } from 'vitest';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { newGenState, type GenState } from '../src/world/gen/vanilla/GenState';
import {
  resetGenSolid, flipGenSolid, genSolidType, snapshotGenSolid, restoreGenSolid,
} from '../src/world/gen/vanilla/GenSolid';
import { killTileWhole } from '../src/world/gen/vanilla/TrapsPass';
import { runLifeCrystalsPass } from '../src/world/gen/vanilla/StructuresPass';
import { mayanTrap } from '../src/world/gen/vanilla/TemplePass';
import { placeFurniture } from '../src/world/gen/vanilla/CaveHousePass';
import { placeTilePrologueClear } from '../src/world/gen/vanilla/WorldGenTileHelpers';
import { runQuickCleanupPass } from '../src/world/gen/vanilla/QuickCleanupPass';
import { runBoulderPileSection } from '../src/world/gen/vanilla/PilesPass';

// ---- sheet/内部 id 域换算助手（本仓内部 id ≠ 原版 sheet id，见 GenSolid 头注） ----
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
const ID_OF_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SHEET_OF[i] = s;
    if (!ID_OF_SHEET.has(s)) ID_OF_SHEET.set(s, i);
  }
}
const T = (sheet: number): number => {
  const v = ID_OF_SHEET.get(sheet);
  if (v === undefined) throw new Error(`no internal tile id for sheet ${sheet}`);
  return v;
};
const sheetOfT = (t: number | undefined): number => (t == null ? -1 : SHEET_OF[t] ?? -1);

/** 掷形计数 RNG：记录每次掷的界,值恒 0（命中各 1/N 门;同 worldgen-1457-rewire 手法） */
function countingRng(): { rng: RNG; rolls: string[] } {
  const rolls: string[] = [];
  const rng = {
    int(min: number, max: number): number { rolls.push(`int(${min},${max})`); return min; },
    nextInt(n: number): number { rolls.push(`nextInt(${n})`); return 0; },
    next(): number { rolls.push('next()'); return 0; },
  } as unknown as RNG;
  return { rng, rolls };
}

const DIRT = T(0);
const STONE = T(1);
const FOSSIL = T(404);
const HEART = TILE_BY_KEY['crystal_heart']!;
const MANA = TILE_BY_KEY['v_639_mana_crystal']!;
const BOULDER = TILE_BY_KEY['v_138_boulder']!;
const CHANDELIER = TILE_BY_KEY['chandelier']!;
const EXTRACT642 = TILE_BY_KEY['v_642_chlorophyte_extractinator']!;
const BUBBLE379 = T(379);

beforeEach(() => { resetGenSolid(); });

// =====================================================================
// ⑤ AddManaCrystal 臂（StructuresPass.runLifeCrystalsPass 第二臂,errorWorld/
//    noSurface 门,area×1E-05 颗×4 格——CLVI 章 #57 Life_Crystals A200/T200 定谳刀）
// =====================================================================
describe('⑤ runLifeCrystalsPass 第二臂 AddManaCrystal（IIIII183）', () => {
  /** 全宽实心地板（y=200 起）的合成世界：锚行恒 199、底座恒 200 ⇒ 每 attempt 首掷即成 */
  function flatWorld(): { st: TileStore; gs: GenState } {
    const w = 400, h = 420;
    const st = new TileStore(w, h);
    for (let x = 0; x < w; x++) for (let y = 200; y < h; y++) st.setTileSilent(x, y, DIRT);
    const gs = newGenState(w, h);
    gs.worldSurface = 50; gs.rockLevel = 60;
    return { st, gs };
  }
  const count = (st: TileStore, t: number): number => {
    let n = 0;
    for (let i = 0; i < st.type.length; i++) if (st.type[i] === t) n++;
    return n;
  };

  it('errorWorld 门开：法力水晶 639 落额 = 4×floor(area×1E-05),心晶 345 面不变', () => {
    const { st, gs } = flatWorld();
    gs.seedFlags.errorWorld = true;
    // 400×420:心 count=floor(3.36)=3(12 格),法力 count=floor(1.68)=1(4 格)
    runLifeCrystalsPass(st, new RNG(20260905), gs);
    expect(count(st, HEART)).toBe(12);
    expect(count(st, MANA)).toBe(4);
    // 法力水晶 2×2 帧式（frameX/frameY ∈ {0,18}）
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === MANA) {
        expect([0, 18]).toContain(st.frameX[i]);
        expect([0, 18]).toContain(st.frameY[i]);
      }
    }
    // pass 尾 flipGenSolid([225],false) 的全局面还原（hive 回 pristine 实心）
    flipGenSolid([225], true);
  });

  it('noSurface 门同样开臂;两旗全关 ⇒ 法力水晶恒 0（臂整缺=旧债脸）', () => {
    {
      const { st, gs } = flatWorld();
      gs.seedFlags.noSurface = true;
      runLifeCrystalsPass(st, new RNG(20260905), gs);
      expect(count(st, MANA)).toBe(4);
      flipGenSolid([225], true);
    }
    {
      const { st, gs } = flatWorld();
      runLifeCrystalsPass(st, new RNG(20260905), gs);
      expect(count(st, MANA)).toBe(0);
      expect(count(st, HEART)).toBe(12);   // 首臂不受门控
      flipGenSolid([225], true);
    }
  });
});

// =====================================================================
// ② AttemptFossilShattering（TrapsPass,cs:63526——杀化石 404 的 3×3 邻化石
//    掷 Next(maxValue)==0 连锁杀;maxValue=邻下格非实心/正上格(!fail) 4,余 15）
// =====================================================================
describe('② AttemptFossilShattering（IIII194/CLXXI;经 killTileWhole 驱动）', () => {
  /** 3×3 化石 (10..12,20..22),中心 (11,21);地板 y≥30;(11,23)/(12,23) 垫土
   *  ⇒ (10,22) 邻下格非实心(maxValue=4),(11,20) 正上格(maxValue=4),余 15 */
  function fossilWorld(): TileStore {
    const st = new TileStore(40, 48);
    for (let x = 0; x < 40; x++) for (let y = 30; y < 48; y++) st.setTileSilent(x, y, DIRT);
    st.setTileSilent(11, 23, DIRT);
    st.setTileSilent(12, 23, DIRT);
    for (let x = 10; x <= 12; x++) for (let y = 20; y <= 22; y++) st.setTileSilent(x, y, FOSSIL);
    return st;
  }

  it('掷形=逐活邻化石 1 掷,界按 maxValue 二分（3×3 全化石 → 8 掷,int(0,14)×6+int(0,3)×2）', () => {
    const st = fossilWorld();
    const { rng, rolls } = countingRng();
    killTileWhole(st, 11, 21, rng);
    // 扫序 k 外 l 内:(10,20)15 (10,21)15 (10,22)4 (11,20)4(正上,!fail) (11,21)心跳过
    //              (11,22)15 (12,20)15 (12,21)15 (12,22)15
    expect(rolls).toEqual([
      'int(0,14)', 'int(0,14)', 'int(0,3)', 'int(0,3)',
      'int(0,14)', 'int(0,14)', 'int(0,14)', 'int(0,14)',
    ]);
    // 计数 RNG 恒 0 → 全邻连锁杀:9 格全灭（fossilBreakT 再入闸保证恰 8 掷不发散）
    for (let x = 10; x <= 12; x++) {
      for (let y = 20; y <= 22; y++) {
        const i = st.idx(x, y);
        expect(st.flags[i]).toBe(0);
        expect(st.type[i]).toBe(0);
      }
    }
  });

  it('maxValue=4 支行为面:掷值恒 1 ⇒ 零碎裂,仅本格杀（Next(maxValue)==0 才杀的负证）', () => {
    const st = fossilWorld();
    const rngAllMiss = {
      int(_min: number, _max: number): number { return 1; },
      nextInt(_n: number): number { return 1; },
      next(): number { return 0.999; },
    } as unknown as RNG;
    killTileWhole(st, 11, 21, rngAllMiss);
    expect(st.flags[st.idx(11, 21)]).toBe(0);      // 本格照杀
    for (const [x, y] of [[10, 20], [12, 20], [10, 22], [12, 22]] as const) {
      expect(st.flags[st.idx(x, y)]).toBe(1);      // 邻化石存活
      expect(st.type[st.idx(x, y)]).toBe(FOSSIL);
    }
  });

  it('无 rng(生成期兜底外直调)=旧路径:零掷且不触发碎裂', () => {
    const st = fossilWorld();
    killTileWhole(st, 11, 21);
    expect(st.flags[st.idx(11, 21)]).toBe(0);
    expect(st.flags[st.idx(10, 20)]).toBe(1);      // 邻化石无碎裂
    expect(st.flags[st.idx(12, 22)]).toBe(1);
  });
});

// =====================================================================
// ③ mayan dual 下扫界（UnderworldLayer-5=h-205 替 h-300）+num17 锚（232 替 48）
//    （TemplePass.mayanTrap,IIII194/CLXXI——掷形判别:扫界拒=1 掷,过扫=3 掷）
// =====================================================================
describe('③ mayanTrap dual 支（IIII194:mayanScanCap+num17）', () => {
  function mayanWorld(floorY: number, anchorSheet: number): { st: TileStore; gs: GenState } {
    const w = 200, h = 1200;
    const st = new TileStore(w, h);
    for (let x = 0; x < w; x++) for (let y = floorY; y < h; y++) st.setTileSilent(x, y, STONE);
    // 两侧锚柱（悬挑一行,落点行走首实心）
    st.setTileSilent(90, floorY - 1, anchorSheet);
    st.setTileSilent(110, floorY - 1, anchorSheet);
    const gs = newGenState(w, h);
    return { st, gs };
  }

  it('下扫界:非 dual 档 h-300 提前拒(1 掷),dual 档 h-205 放行(3 掷后墙 87 拒)', () => {
    // 地板 y=940:非 dual 界=900 < 940(扫越界拒);dual 界=995 > 940(过扫进 case0)
    const a = mayanWorld(940, STONE);
    {
      const { rng, rolls } = countingRng();
      const ok = mayanTrap(a.st, rng, a.gs, 100, 930);
      expect(ok).toBe(false);
      expect(rolls).toEqual(['nextInt(3)']);          // num2 掷后即被 h-300 界拒
    }
    {
      a.gs.seedFlags.dualDungeons = true;
      const { rng, rolls } = countingRng();
      const ok = mayanTrap(a.st, rng, a.gs, 100, 930);
      expect(ok).toBe(false);                          // 锚墙≠87 拒（已过扫界/锚选）
      expect(rolls).toEqual(['nextInt(3)', 'nextInt(3)', 'nextInt(2)']);
    }
  });

  it('num17 锚:dual 档 232 木刺锚拒(2 掷),非 dual 档 48 门不咬 232(3 掷)', () => {
    {
      const a = mayanWorld(500, T(232));
      a.gs.seedFlags.dualDungeons = true;
      const { rng, rolls } = countingRng();
      const ok = mayanTrap(a.st, rng, a.gs, 100, 490);
      expect(ok).toBe(false);
      expect(rolls).toEqual(['nextInt(3)', 'nextInt(3)']);   // 双锚被 232 拒→case 分派前即退
    }
    {
      const b = mayanWorld(500, T(232));                     // 独立 gs(防 dual 旗泄漏)
      const { rng, rolls } = countingRng();
      const ok = mayanTrap(b.st, rng, b.gs, 100, 490);
      expect(ok).toBe(false);                          // 232≠48 锚不拒→墙 87 拒
      expect(rolls).toEqual(['nextInt(3)', 'nextInt(3)', 'nextInt(2)']);
    }
  });
});

// =====================================================================
// ⑦ placeTilePrologueClear 惰性落点预清臂（WorldGenTileHelpers,CL/CLVI 章;
//    Clear(131) 五通道+块漆/块涂层方块侧两位,wall/液/wire 全保,零掷）
// =====================================================================
describe('⑦ placeTilePrologueClear（IIIII179 共享 helper）', () => {
  it('flags==0 残型格:清 type/帧X/帧Y/slope/half/paint/块涂层方块侧,保 wall/液/wire', () => {
    const st = new TileStore(20, 20);
    const i = st.idx(10, 10);
    st.type[i] = T(2);          // 残型（幽灵格,type≠0/flags=0）
    st.flags[i] = 0;
    st.frameX[i] = 137; st.frameY[i] = 91;
    st.slope[i] = 1; st.half[i] = 1;
    st.paint[i] = 7;
    st.coat[i] = 0xff;
    st.wall[i] = 55;
    st.liquid[i] = 128; st.liquidType[i] = LIQUID_TYPE.LAVA;
    st.wire[i] = 0xff;          // 含 inActive bit5/actuator 等全部保留
    placeTilePrologueClear(st, 10, 10);
    expect(st.type[i]).toBe(0);
    expect(st.frameX[i]).toBe(0);
    expect(st.frameY[i]).toBe(0);
    expect(st.slope[i]).toBe(0);
    expect(st.half[i]).toBe(0);
    expect(st.paint[i]).toBe(0);
    expect(st.coat[i]).toBe(0xff & ~TileStore.COAT_BLOCK_MASK);   // 仅方块侧两位清
    expect(st.wall[i]).toBe(55);
    expect(st.liquid[i]).toBe(128);
    expect(st.liquidType[i]).toBe(LIQUID_TYPE.LAVA);
    expect(st.wire[i]).toBe(0xff);
  });

  it('活性格(flags!=0)=no-op;界外格安全', () => {
    const st = new TileStore(20, 20);
    const i = st.idx(10, 10);
    st.type[i] = STONE; st.flags[i] = 1;
    st.frameX[i] = 137; st.frameY[i] = 91; st.slope[i] = 2; st.half[i] = 1; st.paint[i] = 3;
    placeTilePrologueClear(st, 10, 10);
    expect(st.type[i]).toBe(STONE);
    expect(st.frameX[i]).toBe(137);
    expect(st.slope[i]).toBe(2);
    expect(st.half[i]).toBe(1);
    expect(st.paint[i]).toBe(3);
    expect(() => placeTilePrologueClear(st, -5, -5)).not.toThrow();
  });
});

// =====================================================================
// ⑥③ 叶绿素提炼机 642 派发（CaveHousePass.placeFurniture case 642,IIIII184;
//    缺 case 曾致 cascadePlace 十掷全败零写+bt 段多耗 9 掷）——同时覆盖 placeFurniture
//    头 placeTilePrologueClear 插入点（CaveHouse 组⑤）
// =====================================================================
describe('⑥③ placeFurniture case 642（IIIII184）', () => {
  function houseWorld(): TileStore {
    const st = new TileStore(40, 40);
    for (let x = 5; x < 35; x++) for (let y = 30; y < 34; y++) st.setTileSilent(x, y, STONE);
    return st;
  }

  it('642 走 Place3x3 几何:(x-1,y-2) 3×3,帧 (style*54+dx*18, dy*18);受理前预清残型', () => {
    const st = houseWorld();
    const gi = st.idx(20, 29);            // 落点锚格（placeFurniture 预清位）
    st.type[gi] = T(4); st.flags[gi] = 0; st.frameX[gi] = 99; st.frameY[gi] = 88;
    const ok = placeFurniture(st, new RNG(7), 'v_642_chlorophyte_extractinator', 20, 29, 0);
    expect(ok).toBe(true);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const i = st.idx(19 + dx, 27 + dy);
        expect(st.type[i]).toBe(EXTRACT642);
        expect(st.frameX[i]).toBe(dx * 18);
        expect(st.frameY[i]).toBe(dy * 18);
      }
    }
  });

  it('未收录型别保守拒绝（缺 case=旧债脸:零写）', () => {
    const st = houseWorld();
    const before = st.type.slice();
    const ok = placeFurniture(st, new RNG(7), 'v_999_no_such_tile', 20, 29, 0);
    expect(ok).toBe(false);
    expect(st.type).toEqual(before);
  });
});

// =====================================================================
// ⑩-C3 吊灯两段化（CaveHousePass case 34,CXLV/IIII169·R5:①门成立才写本体;
//    ②不论成败九格 frameX += 54 原始加法,含幽灵/失活格 stale 帧）
// =====================================================================
describe('⑩-C3 chandelier case 34 两段化（IIII169·R5）', () => {
  function roomWorld(ceiling: boolean): TileStore {
    const st = new TileStore(40, 40);
    if (ceiling) for (let x = 5; x < 35; x++) st.setTileSilent(x, 19, STONE);
    return st;
  }

  it('成功面:本体 3×3 落位且九格 frameX 带 +54（列差 18/风格带在 frameY）', () => {
    const st = roomWorld(true);
    const ok = placeFurniture(st, new RNG(7), 'chandelier', 20, 20, 3);
    expect(ok).toBe(true);
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        expect(st.type[st.idx(19 + dx, 20 + dy)]).toBe(CHANDELIER);
      }
    }
    const fx = [0, 1, 2].map((dx) => st.frameX[st.idx(19 + dx, 20)]);
    expect(fx[1] - fx[0]).toBe(18);                 // 列步长 18 保持在
    expect(fx[0] % 18).toBe(0);                     // +54 后仍 18 对齐（54=3×18）
  });

  it('失败面(无承顶):零写本体,但九格 stale 帧【仍】+54（HouseBuilder.cs:461-465）', () => {
    const st = roomWorld(false);
    const gi = st.idx(19, 20);
    st.type[gi] = T(4); st.flags[gi] = 0; st.frameX[gi] = 100; st.frameY[gi] = 21;
    const ok = placeFurniture(st, new RNG(7), 'chandelier', 20, 20, 3);
    expect(ok).toBe(false);
    expect(st.type[gi]).toBe(T(4));                 // 幽灵保型（ClearTile 语义）
    expect(st.frameX[gi]).toBe(154);                // 100+54:成败皆达的原始 +=
    expect(st.frameY[gi]).toBe(21);                 // frameY 不动
  });
});

// =====================================================================
// ⑧③ Quick_Cleanup 动态 tileSolid（QuickCleanupPass,IIIII187 #70:
//    SaveSlopes[t]=tileSolid[t]∪NonSolidSaveSlopes 读生成期动态值;
//    errorWorld 窗口 379 幻影块 flip=true ⇒ 坡/半砖保留+SolidTile 真）
// =====================================================================
describe('⑧③ runQuickCleanupPass 动态 SaveSlopes（IIIII187 #70）', () => {
  function cleanWorld(): { st: TileStore; gs: GenState } {
    const st = new TileStore(80, 60);
    // 379 测试格落 y=35(扫窗 j∈[20,h-20)= [20,40) 内),支撑行 36 起实心
    for (let x = 0; x < 80; x++) for (let y = 36; y < 60; y++) st.setTileSilent(x, y, DIRT);
    const gs = newGenState(80, 60);
    gs.worldSurface = 25; gs.rockLevel = 35;
    return { st, gs };
  }

  it('errorWorld 窗口(379 flip=true):379 topSlope/半砖格存活保位,379 底座 SolidTile 真', () => {
    const { st, gs } = cleanWorld();
    const a = st.idx(30, 35);
    st.setTileSilent(30, 35, BUBBLE379); st.slope[a] = 1;        // topSlope,下格 dirt 实心
    const b = st.idx(40, 35);
    st.setTileSilent(40, 35, BUBBLE379); st.half[b] = 1;         // halfBrick,下格 379
    st.setTileSilent(40, 36, BUBBLE379);
    flipGenSolid([379], true);                                    // UndergroundJungleTrees 头 cs:17956
    runQuickCleanupPass(st, new RNG(3), gs);
    expect(st.flags[a]).toBe(1);
    expect(st.slope[a]).toBe(1);                                  // SaveSlopes 动态支=保坡
    expect(st.flags[b]).toBe(1);
    expect(st.half[b]).toBe(1);                                   // solidTile(40,41) 经 genSolidType 真
    expect(genSolidType(BUBBLE379)).toBe(true);
  });

  it('pristine 窗口(无 flip):379 不在 SaveSlopes ⇒ 走 ClearSlope 支(坡清零,格保活)', () => {
    const { st, gs } = cleanWorld();
    const c = st.idx(50, 35);
    st.setTileSilent(50, 35, BUBBLE379); st.slope[c] = 1; st.half[c] = 1;
    runQuickCleanupPass(st, new RNG(3), gs);
    expect(st.flags[c]).toBe(1);
    expect(st.slope[c]).toBe(0);
    expect(st.half[c]).toBe(0);
  });
});

// =====================================================================
// ⑨-a Pots 巨石三角段尾支（PilesPass.runBoulderPileSection→placeTileBoulder,
//    CLXX/IIII192:PlaceTile 全语义=尾支 SquareTileFrame 九宫级联+result=true ⇒
//    errorWorld invisibleBlock 三连可达）
// =====================================================================
describe('⑨-a runBoulderPileSection（IIII192 巨石臂）', () => {
  function flatDeep(): { st: TileStore; gs: GenState } {
    const w = 220, h = 310;
    const st = new TileStore(w, h);
    for (let x = 0; x < w; x++) for (let y = 60; y < h; y++) st.setTileSilent(x, y, DIRT);
    const gs = newGenState(w, h);
    gs.worldSurface = 40; gs.rockLevel = 90;
    return { st, gs };
  }
  const boulderCells = (st: TileStore): number[] => {
    const out: number[] = [];
    for (let i = 0; i < st.type.length; i++) if (st.type[i] === BOULDER) out.push(i);
    return out;
  };

  it('noTraps:三角堆落位,2×2 帧式(0/18),无 invisible 涂层', () => {
    const { st, gs } = flatDeep();
    gs.seedFlags.noTraps = true;
    runBoulderPileSection(st, new RNG(4242), gs);
    const cells = boulderCells(st);
    expect(cells.length).toBeGreaterThanOrEqual(10);
    for (const i of cells) {
      expect([0, 18]).toContain(st.frameX[i]);
      expect([0, 18]).toContain(st.frameY[i]);
      expect(st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK).toBe(0);
    }
  });

  it('errorWorld:同一臂跑且落 invisibleBlock 涂层位（result=true 尾支可达面）', () => {
    const { st, gs } = flatDeep();
    gs.seedFlags.errorWorld = true;
    runBoulderPileSection(st, new RNG(4242), gs);
    const cells = boulderCells(st);
    expect(cells.length).toBeGreaterThanOrEqual(10);
    expect(cells.some((i) => (st.coat[i] & TileStore.COAT_INVISIBLE_BLOCK) !== 0)).toBe(true);
  });

  it('双旗全关:段恒空转（零巨石,零掷面）', () => {
    const { st, gs } = flatDeep();
    runBoulderPileSection(st, new RNG(4242), gs);
    expect(boulderCells(st).length).toBe(0);
  });
});

// =====================================================================
// ⑨-b Check2x2 杀块尾 4×4 TileFrame 补帧扫（TrapsPass.check2x2Gen 尾支,IIII192:
//    destroyObject 还 false 后对碎片域 (num2-1..+2, num6-1..+2) 补帧扫=贴邻对象级联
//    真源头——iamerror #76 三座巨石级联自毁实证）
// =====================================================================
describe('⑨-b check2x2Gen 尾 4×4 补帧扫（IIII192）', () => {
  function place2x2(st: TileStore, ox: number, oy: number): void {
    st.setTileSilent(ox, oy, BOULDER, 0, 0);
    st.setTileSilent(ox + 1, oy, BOULDER, 18, 0);
    st.setTileSilent(ox, oy + 1, BOULDER, 0, 18);
    st.setTileSilent(ox + 1, oy + 1, BOULDER, 18, 18);
  }

  it('锚失守下巨石:经杀块尾 4×4 扫级联自毁（旧无尾支=巨石存留 4 格）', () => {
    const st = new TileStore(60, 60);
    for (let x = 0; x < 60; x++) for (let y = 30; y < 60; y++) st.setTileSilent(x, y, DIRT);
    place2x2(st, 20, 20);          // 下巨石(锚=(20..21,22) 空气→失守)
    place2x2(st, 20, 18);          // 上巨石(锚=下巨石格——下巨石死后经 4×4 扫失守)
    place2x2(st, 40, 20);          // 对照组（无触发窗,应存活）
    // 触发:杀下巨石邻格 dirt → cascade3x3T → (20,21) Check2x2 杀块 → 尾扫 → 上巨石
    st.setTileSilent(19, 21, DIRT);
    killTileWhole(st, 19, 21, new RNG(11));
    for (let x = 20; x <= 21; x++) {
      for (const y of [18, 19, 20, 21]) {
        expect(st.flags[st.idx(x, y)]).toBe(0);    // 两座巨石全灭
      }
    }
    for (let x = 40; x <= 41; x++) {
      for (const y of [20, 21]) {
        expect(st.flags[st.idx(x, y)]).toBe(1);    // 对照组存活（非全局 annihilate）
        expect(st.type[st.idx(x, y)]).toBe(BOULDER);
      }
    }
  });

  it('锚完好的巨石组:Check2x2 判存活（同族负证）', () => {
    const st = new TileStore(60, 60);
    for (let x = 0; x < 60; x++) for (let y = 30; y < 60; y++) st.setTileSilent(x, y, DIRT);
    // 巨石坐在地板上（锚=(20..21,30) 实心）
    st.setTileSilent(20, 28, BOULDER, 0, 0);
    st.setTileSilent(21, 28, BOULDER, 18, 0);
    st.setTileSilent(20, 29, BOULDER, 0, 18);
    st.setTileSilent(21, 29, BOULDER, 18, 18);
    st.setTileSilent(19, 29, DIRT);
    killTileWhole(st, 19, 29, new RNG(11));        // 邻格触发尾环
    for (let x = 20; x <= 21; x++) {
      for (const y of [28, 29]) {
        expect(st.flags[st.idx(x, y)]).toBe(1);
        expect(st.type[st.idx(x, y)]).toBe(BOULDER);
      }
    }
  });
});

// =====================================================================
// ⑫ GenSolid 轨段时线补播机制原语（CLXIX/IIII193:save/set/restore 严格限定
//    读写域;接线锁见 structure-locks 文件）
// =====================================================================
describe('⑫ GenSolid snapshot/restore 原语（IIII193）', () => {
  it('快照-翻转-回放:回放后逐键还原,未登记键回落 pristine 静态值', () => {
    resetGenSolid();
    expect(genSolidType(T(379))).toBe(false);      // pristine:379 幻影块非实心
    expect(genSolidType(T(162))).toBe(true);       // pristine:薄冰实心
    flipGenSolid([379], true);
    flipGenSolid([162], false);
    const snap = snapshotGenSolid();
    flipGenSolid([379], false);
    flipGenSolid([162], true);
    expect(genSolidType(T(379))).toBe(false);
    expect(genSolidType(T(162))).toBe(true);
    restoreGenSolid(snap);
    expect(genSolidType(T(379))).toBe(true);       // 轨段域补播态
    expect(genSolidType(T(162))).toBe(false);
    resetGenSolid();
    expect(genSolidType(T(379))).toBe(false);      // 生成开始清零语义
    expect(genSolidType(T(162))).toBe(true);
  });
});
