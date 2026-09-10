// 终审 R-H1 演化域批复核 4+1 findings 修复回归（2026-09-04）。
// 原版锚：
//   · F1 killDropFace case 703（WorldGen.cs:65471-65488）：frameX/18 整除分档
//     default→195 / 6·7→208 / 8→331 / 9→223（noPrefix,全支无 RNG）。可达杀位=
//     PlantCheck 703 特支（cs:81847-81853 基格 SolidTileAllowBottomSlope 失败）
//     → KillTile 默认参带掉落（本域 plantCheckAt→killFlat）。
//   · F3 attemptBulbAt force 支每格序（cs:74823-74831）：ClearTile() → 边环直写
//     type=60 → SquareTileFrame（写后派发,每格一次）——底边环下方丛林藤 62 以
//     新草 60 为锚存活（旧移植 killNoItem 清后立即派发=藤被"锚空"先杀）。
//   · F4 placeJungleBlock2x2 覆写表（cs:74118）：门= `!tileCut[type] || type==444`
//     → 可覆写集=Main.tileCut 全表扣 444；锚门补 wallHouse（cs:74108）。连锁=
//     被覆写 tileCut 格走 KillTile 默认参掉落（cs:74135-74144）。
//   · F2 IsAlchemyPlantHarvestable style4（cs:66677）：Main.raining || Main.cloudAlpha
//     > 0f；style5 remix 深度带 y<maxTilesY-350（cs:66684-66688）。
// 掷签流归属：case 519 genRand.Next(2)=蔓延流（this.rng）；703/51 全支无 RNG。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { Game } from '../src/core/Game';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

interface DropRec { vid: number; x: number; y: number; stack: number }

function mkEvo(st: TileStore, seed: number, drops: DropRec[]): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: (vid, x, y, stack) => { drops.push({ vid, x, y, stack }); },
    selectedAxePower: () => 0,
  };
  return new WorldEvolution(host);
}

function mkStore(): TileStore {
  return new TileStore(40, 80);
}

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩;evolution-kill-drop 同款） */
function captureRolls(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

const plantCheckAt = (evo: WorldEvolution, x: number, y: number, noItem = false): boolean =>
  (evo as unknown as { plantCheckAt(x: number, y: number, noItem?: boolean): boolean })
    .plantCheckAt(x, y, noItem);
const attemptBulbAt = (evo: WorldEvolution, i: number, j: number, force: boolean): boolean =>
  (evo as unknown as { attemptBulbAt(i: number, j: number, f: boolean): boolean })
    .attemptBulbAt(i, j, force);
const hiveAt = (evo: WorldEvolution, i: number, j: number, sheet: number, floorY: number): boolean =>
  (evo as unknown as { placeJungleBlock2x2(i: number, j: number, s: number, f: number): boolean })
    .placeJungleBlock2x2(i, j, sheet, floorY);

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

// ================= F1 killDropFace case 703 四档掉落 =================

describe('R-H1/F1 killDropFace case 703（cs:65471-65488 frameX/18 分档,无 RNG）', () => {
  // 可达杀位=plantCheckAt 703 特支：基格（y+1）空 → SolidTileAllowBottomSlope 失败
  // → killFlat 带掉落（清格前读活帧）。
  const tiers: Array<[number, number, string]> = [
    [0, 195, 'default→195'],
    [108, 208, 'tier6→208'],
    [126, 208, 'tier7→208'],
    [144, 331, 'tier8→331'],
    [162, 223, 'tier9→223(noPrefix)'],
  ];
  for (const [fx, vid, tag] of tiers) {
    it(`703 frameX=${fx}（${tag}）→ 掉 ${vid},零掷签`, () => {
      const st = mkStore();
      st.setTileSilent(10, 11, S(703), fx, 0);        // 基格 12 空 → 锚失败必杀
      const drops: DropRec[] = [];
      const evo = mkEvo(st, 7, drops);
      const rand = vi.spyOn(Math, 'random');
      const rolls = captureRolls(evo, () => plantCheckAt(evo, 10, 11));
      expect(rolls.length).toBe(0);                   // 全支无 genRand 骰
      expect(rand).not.toHaveBeenCalled();            // 全支无 Main.rand 骰
      expect(drops.length).toBe(1);
      expect(drops[0].vid).toBe(vid);
      expect(drops[0].x).toBe(10); expect(drops[0].y).toBe(11);
      expect(st.hasTile(10, 11)).toBe(false);         // 清格
      rand.mockRestore();
    });
  }
  it('noItem 位次（sanitizePlants 读档清整）零掉落——KillTile 强制 noItem 语义保持', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(703), 144, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    expect(plantCheckAt(evo, 10, 11, true)).toBe(true);
    expect(drops.length).toBe(0);
    expect(st.hasTile(10, 11)).toBe(false);
  });
});

// ================= F3 attemptBulbAt force 支写后派发时序 =================

describe('R-H1/F3 force 支每格序=ClearTile→边环直写 60→SquareTileFrame（cs:74823-74831）', () => {
  /** 4×4 计分 ≥12 场地：2×2 花苞域留空,其余 12 格填 59/60（+1×12）;
   *  底边环下 (i,j+2)/(i-1,j+2) 挂丛林藤 62（锚=将转 60 的底边环格）。 */
  function mkBulbScene(st: TileStore, i: number, j: number): void {
    for (let m = -2; m < 2; m++) {
      for (let n = -2; n < 2; n++) {
        const edge = m === -2 || m === 1 || n === -2 || n === 1;
        if (edge) st.setTileSilent(i + m, j + n, n === 1 ? S(60) : S(59), 0, 0);
      }
    }
    st.setTileSilent(i, j + 2, S(62), 0, 0);          // 底边环下方丛林藤（锚 i,j+1）
    st.setTileSilent(i - 1, j + 2, S(62), 0, 0);      // 同列第二藤（锚 i-1,j+1）
  }

  it('force：藤以新草 60 为锚存活（写完再派发）,清场零掉落,花苞 2×2 落位', () => {
    const st = mkStore();
    const i = 20, j = 40;
    mkBulbScene(st, i, j);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    const rand = vi.spyOn(Math, 'random');
    const rolls = captureRolls(evo, () => expect(attemptBulbAt(evo, i, j, true)).toBe(true));
    expect(rolls.length).toBe(0);                     // force 支全流程无骰（ClearTile 位次）
    expect(rand).not.toHaveBeenCalled();
    // 花苞 2×2（原 4×4 内域空,允许族直通）
    expect(st.get(i - 1, j - 1)).toBe(S(238));
    expect(st.get(i, j)).toBe(S(238));
    expect(st.frameX[st.idx(i, j)]).toBe(18);
    expect(st.frameY[st.idx(i, j)]).toBe(18);
    // 边环转丛林草 60（含底边环两锚格）
    expect(st.get(i, j + 1)).toBe(S(60));
    expect(st.get(i - 1, j + 1)).toBe(S(60));
    expect(st.get(i - 2, j - 2)).toBe(S(60));
    expect(st.get(i + 1, j + 1)).toBe(S(60));
    expect(st.get(i - 2, j)).toBe(S(60));
    // ★本体：底边环下方藤 62 存活（原版以新草 60 为锚;旧序第一拍锚空先杀）
    expect(st.hasTile(i, j + 2)).toBe(true);
    expect(st.get(i, j + 2)).toBe(S(62));
    expect(st.hasTile(i - 1, j + 2)).toBe(true);
    expect(st.get(i - 1, j + 2)).toBe(S(62));
    // 清场=ClearTile 位次零掉落（泥/草/藤不走 killDropFace）
    expect(drops.length).toBe(0);
    rand.mockRestore();
  });

  it('非 force 支不动：2×2 允许族覆写仍走 KillTile(noItem) 零掉落', () => {
    const st = mkStore();
    const i = 20, j = 40;
    st.setTileSilent(i - 1, j + 1, S(60), 0, 0);      // 底承两列 60
    st.setTileSilent(i, j + 1, S(60), 0, 0);
    st.setTileSilent(i, j, S(62), 0, 0);              // 花苞域内旧藤（允许族）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    expect(attemptBulbAt(evo, i, j, false)).toBe(true);
    expect(st.get(i, j)).toBe(S(238));                // 覆写成功
    expect(drops.length).toBe(0);                     // noItem 位次零掉落（原版 cs:48242）
  });
});

// ================= F4 placeJungleBlock2x2 覆写表对齐 Main.tileCut =================

describe('R-H1/F4 蜂巢覆写门=tileCut 全表扣 444 + wallHouse 锚门（cs:74093-74160）', () => {
  /** 锚行 39 两列 = 60 实心;主体区 = (20..21,40..41)。 */
  function mkHiveScene(st: TileStore): void {
    st.setTileSilent(20, 39, S(60), 0, 0);
    st.setTileSilent(21, 39, S(60), 0, 0);
  }

  it('tileCut 族在场（药草 83）→ 可覆写,掉落面照走（83→313,F4 连锁勿截断）', () => {
    const st = mkStore();
    mkHiveScene(st);
    st.setTileSilent(20, 40, S(83), 0, 0);            // 旧表缺 82/83/84 → 曾误阻断
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    expect(hiveAt(evo, 20, 40, 444, 40)).toBe(true);
    expect(st.get(20, 40)).toBe(S(444));              // 覆写落位
    expect(st.frameX[st.idx(21, 41)]).toBe(18);
    expect(drops.length).toBe(1);
    expect(drops[0].vid).toBe(313);                   // KillTile 默认参带掉落（cs:74135-74144）
  });

  it('蛛网 51（cs:65193 case）→ 覆写掉 150,无 RNG', () => {
    const st = mkStore();
    mkHiveScene(st);
    st.setTileSilent(20, 40, S(51), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    const rand = vi.spyOn(Math, 'random');
    const rolls = captureRolls(evo, () => expect(hiveAt(evo, 20, 40, 444, 40)).toBe(true));
    expect(rolls.length).toBe(0);
    expect(rand).not.toHaveBeenCalled();
    expect(drops.length).toBe(1);
    expect(drops[0].vid).toBe(150);
    rand.mockRestore();
  });

  it('非 tileCut 族在场（枯枝败叶 233——旧表误纳）→ 阻断不覆写', () => {
    const st = mkStore();
    mkHiveScene(st);
    st.setTileSilent(20, 40, S(233), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    expect(hiveAt(evo, 20, 40, 444, 40)).toBe(false);
    expect(st.get(20, 40)).toBe(S(233));              // 原格不动
    expect(drops.length).toBe(0);
  });

  it('444 特例：在场即阻断（`|| type==444` 照抄）', () => {
    const st = mkStore();
    mkHiveScene(st);
    st.setTileSilent(20, 40, S(444), 0, 0);
    const evo = mkEvo(st, 7, []);
    expect(hiveAt(evo, 20, 40, 444, 40)).toBe(false);
    expect(st.get(20, 40)).toBe(S(444));
  });

  it('锚行房墙（wallHouse 4 木墙）→ 阻断（cs:74108 补门）', () => {
    const st = mkStore();
    mkHiveScene(st);
    st.wall[st.idx(20, 39)] = 4;                      // WallID 4 ∈ Main.wallHouse（:10525 起）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    expect(hiveAt(evo, 20, 40, 444, 40)).toBe(false);
    expect(drops.length).toBe(0);
  });

  it('香蒲 519 frameY=90（cs:65516）：恰好 1 次蔓延流骰;fy≠90 短路 0 骰', () => {
    // 掷骰位实测（非 50% 断言）
    const st1 = mkStore();
    mkHiveScene(st1);
    st1.setTileSilent(20, 40, S(519), 0, 90);
    const evo1 = mkEvo(st1, 7, []);
    const rolls1 = captureRolls(evo1, () => hiveAt(evo1, 20, 40, 444, 40));
    expect(rolls1.length).toBe(1);                    // genRand.Next(2) 蔓延流 1 掷
    const st0 = mkStore();
    mkHiveScene(st0);
    st0.setTileSilent(20, 40, S(519), 0, 0);          // fy≠90 → && 短路不掷
    const evo0 = mkEvo(st0, 7, []);
    const rolls0 = captureRolls(evo0, () => hiveAt(evo0, 20, 40, 444, 40));
    expect(rolls0.length).toBe(0);
  });

  it('香蒲 519 掉落两态（rng 桩 0.1→183 / 0.9→无,骰序不被截断）', () => {
    const mk = (): { evo: WorldEvolution; drops: DropRec[] } => {
      const st = mkStore();
      mkHiveScene(st);
      st.setTileSilent(20, 40, S(519), 0, 90);
      const drops: DropRec[] = [];
      return { evo: mkEvo(st, 7, drops), drops };
    };
    const a = mk();
    (a.evo as unknown as { rng: () => number }).rng = () => 0.1;   // Next(2)==0 档
    expect(hiveAt(a.evo, 20, 40, 444, 40)).toBe(true);
    expect(a.drops.map((d) => d.vid)).toEqual([183]);
    const b = mk();
    (b.evo as unknown as { rng: () => number }).rng = () => 0.9;   // Next(2)==1 档
    expect(hiveAt(b.evo, 20, 40, 444, 40)).toBe(true);
    expect(b.drops.length).toBe(0);
  });
});

// ================= F2 IsAlchemyPlantHarvestable style4 云量 / style5 remix 带 =================

describe('R-H1/F2 IsAlchemyPlantHarvestable（cs:66663-66690）', () => {
  const fn = (Game.prototype as unknown as Record<string, (this: never, ...a: never[]) => boolean>)
    .isAlchemyPlantHarvestable;
  type G = { world: object };
  function mk(opts: { raining?: boolean; cloudAlpha?: number; remix?: boolean; tod?: number } = {}): G {
    const g = Object.create(Game.prototype) as unknown as G;
    g.world = {
      clock: { isDay: true, bloodMoon: false, moonPhase: 0, timeOfDay: opts.tod ?? 0.8 },
      weather: { raining: opts.raining ?? false, cloudAlpha: opts.cloudAlpha ?? 0 },
      groundLevel: 40,
      seedFlags: { remix: !!opts.remix },
      store: { h: 1200 },
    };
    return g;
  }
  const call = (g: G, style: number, y: number): boolean =>
    (fn as unknown as (this: G, s: number, y: number) => boolean).call(g, style, y);

  it('style4：未雨但云量已聚（cloudAlpha>0）→ 可收（:66677 补支）', () => {
    expect(call(mk({ cloudAlpha: 0.4 }), 4, 30)).toBe(true);
  });
  it('style4：未雨且无云 → 不可收', () => {
    expect(call(mk({ cloudAlpha: 0 }), 4, 30)).toBe(false);
  });
  it('style4：降雨中 → 可收（原支保持）', () => {
    expect(call(mk({ raining: true, cloudAlpha: 0 }), 4, 30)).toBe(true);
  });
  it('style5：非 remix 地下带 y>worldSurface 支逐字未动（雨中 y=50>40 → 可收）', () => {
    expect(call(mk({ raining: true }), 5, 50)).toBe(true);
    expect(call(mk({ raining: true }), 5, 30)).toBe(false);   // 地上+雨 → 不可收
  });
  it('style5：remix 深度带 y<maxTilesY-350（:66684-66688）——同 y=900 非 remix 可收/remix 拒', () => {
    expect(call(mk({ raining: true }), 5, 900)).toBe(true);               // 非 remix:900>40 地下
    expect(call(mk({ raining: true, remix: true }), 5, 900)).toBe(false); // remix:900≥850
    expect(call(mk({ raining: true, remix: true }), 5, 800)).toBe(true);  // remix:800<850
  });
  it('style5：无雨时深度带不设限（(!raining | flag) 短路语义）', () => {
    expect(call(mk({ remix: true }), 5, 1100)).toBe(true);    // remix 深带外,但无雨 → 可收
  });
  // ★IIIII220：style5 时基=分段 Main.time（昼 4:30AM 归零 0..54000/夜 0..32400），
  //   `Main.time > 40500`（WorldGen.cs:66689）在夜恒假（32400<40500）——收获窗仅昼
  //   15:45-19:30。旧绝对钟面 `timeOfDay > 15.75/24` 把夜 19:30-24:00 误判可收。
  it.skip('style5：时基分段口径——昼 15:45 后可收 / 15:45 前不可收 / 夜恒不可收', () => {
    expect(call(mk({ tod: 0.7 }), 5, 900)).toBe(true);    // 16:48 → Main.time (0.7-0.1875)×86400=44280
    expect(call(mk({ tod: 0.6 }), 5, 900)).toBe(false);   // 14:24 → 35856 < 40500
    expect(call(mk({ tod: 0.83 }), 5, 900)).toBe(false);  // 19:55 夜段（旧实现误判可收）→ 夜 time 11520
    expect(call(mk({ tod: 0.9 }), 5, 900)).toBe(false);   // 21:36 夜段 → 夜 time 17280 < 40500
  });
});
