// 生命果（236）生长链 1:1 闸门（用户实报「两个机械 Boss 后无生命果」判别面）。
// 原版锚（1457 WorldGen.cs，1458 对拍同段零变更）：
//   · UpdateWorld          cs:72033（地下采样 w×h×1.5e-5×rate, j∈[worldSurface-1, h-20)）
//   · UpdateWorld_UndergroundTile cs:73804（SpreadUnderground → GrassGrowth underground:true）
//   · UpdateWorld_GrassGrowth cs:74867（60 → num=59/plant=61/maxValue=10；顶植物掷出
//     flag=true（cs:74956-74971,掷过即置,PlaceTile 失败不影响）;第二 switch case 60
//     cs:75011-75094）
//   · case 60 门           cs:75013 `if (flag || genRand.Next(25) != 0 || liquid != 0) break;`
//     ——★门=「本 tick 顶植物掷已过」而非「上格空」:上格有旧株时 Next(25) 照掷,
//     生命果可覆写旧株(PlaceJunglePlant 允许族 61/62/69/74/233)。
//   · 世花球茎 238          cs:75024 hardMode && downedMechBoss1∧2∧3 && Next(60)==0
//     + ±150(step2) 无 238 → PlaceJunglePlant(238,0,0)
//   · 生命果 236            cs:75062-75077 maxValue2=expert?30:40;
//     hardMode && downedMechBossAny && Next(maxValue2)==0 + ±60(expert 50,step2) 无 236
//     → PlaceJunglePlant(236, Next(3), 0) + SquareTileFrame;掷过即 break（不落 233 兜底）
//   · 丛林植物 233 兜底      cs:75079-75094 Next(8) style0 失手 → Next(12) styleY=1
//   · PlaceJunglePlant 2×2 档 cs:48191-48275（允许族+双列底承 SolidTile+60+帧
//     frameX=36*styleX/{+18},frameY=0/{+18}）
// 掷序（蔓延流）: 顶植物 Next(10) → Next(25) → Next(60)[mechAll 时] → Next(40) →
//   Next(3)/[233: Next(8)(→Next(12))]——与原版逐位对齐。
import { describe, it, expect } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;
const SHEET = new Map<number, number>();
for (const [sh, id] of SID) if (!SHEET.has(id)) SHEET.set(id, sh);
const sheetAt = (st: TileStore, x: number, y: number): number =>
  SHEET.get(st.type[st.idx(x, y)]) ?? -1;

function mkEvo(st: TileStore, flags: Record<string, boolean>, difficulty = 0): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed: 12345,
    worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty,
    flags, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
  };
  const evo = new WorldEvolution(host);
  // 直呼 grassGrowth 不经 update(),缓存字段按 flags 预置（update() 头同款赋值）
  (evo as unknown as { hardMode: boolean }).hardMode = !!flags.hardMode;
  (evo as unknown as { allowedToSpread: boolean }).allowedToSpread = true;
  return evo;
}

/** 脚本化蔓延流：queue 逐个吐出,耗尽后回 0.99（恒不过门,防意外生长） */
function scriptRng(evo: WorldEvolution, queue: number[]): number[] {
  const calls: number[] = [];
  const r = (evo as unknown as { spreadRng: { next: () => number } }).spreadRng;
  const orig = r.next.bind(r);
  let n = 0;
  r.next = () => {
    const v = n < queue.length ? queue[n] : 0.99;
    calls.push(v);
    n++;
    return v;
  };
  return calls;
}

/** 平底双列丛林草台：y=G 行 x∈[100,160) 全草,上方留空。返回 (i,j) 采样点 */
function mkJungle(w = 260, h = 300, G = 200): { st: TileStore; i: number; j: number } {
  const st = new TileStore(w, h);
  for (let x = 100; x < 160; x++) st.setTile(x, G, S(60));
  return { st, i: 130, j: G };
}

const countSheet = (st: TileStore, sheet: number): number => {
  let n = 0;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    if (st.flags[st.idx(x, y)] && sheetAt(st, x, y) === sheet) n++;
  }
  return n;
};

const grow = (evo: WorldEvolution, i: number, j: number) =>
  (evo as unknown as {
    grassGrowth(i: number, j: number, a: number, b: number, c: number, d: number, u: boolean): void;
  }).grassGrowth(i, j, i - 1, i + 2, j - 1, j + 2, true);

const MECH2 = { hardMode: true, downed_134: true, downed_125: true };

// ================= A. 条件门 2×2（hardMode × mechAny） =================

describe('生命果条件门 2×2（cs:75062-75077）', () => {
  it('H=1/M=1：1/40 过 → 236 2×2 落地,帧=36*style/{+18}×0/{+18}', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { ...MECH2 });
    // [顶植物 1/10 败, 1/25 过, (mechAll 短路无掷), 1/40 过, style Next(3)=0]
    const calls = scriptRng(evo, [0.99, 0.0, 0.0, 0.0]);
    grow(evo, i, j);
    expect(calls.length, '蔓延流掷数=4（顶植物/1/25/1/40/style;mechAll 短路）').toBe(4);
    expect(countSheet(st, 236), '生命果 2×2 落地').toBe(4);
    // 帧语义：占 (i-1..i, j-2..j-1),style=0 → frameX∈{0,18},frameY∈{0,18}
    const fx = [st.frameX[st.idx(i - 1, j - 2)], st.frameX[st.idx(i, j - 2)],
      st.frameX[st.idx(i - 1, j - 1)], st.frameX[st.idx(i, j - 1)]];
    const fy = [st.frameY[st.idx(i - 1, j - 2)], st.frameY[st.idx(i, j - 2)],
      st.frameY[st.idx(i - 1, j - 1)], st.frameY[st.idx(i, j - 1)]];
    expect(fx).toEqual([0, 18, 0, 18]);
    expect(fy).toEqual([0, 0, 18, 18]);
    // 底承丛林草仍在
    expect(sheetAt(st, i, j)).toBe(60);
  });

  it('H=1/M=1 + 三王齐：Next(60) 掷入流（球茎门先行）', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { hardMode: true, downed_134: true, downed_125: true, downed_127: true });
    // [顶植物败, 1/25 过, 1/60 败, 1/40 过, style=0]
    scriptRng(evo, [0.99, 0.0, 0.99, 0.0, 0.0]);
    grow(evo, i, j);
    expect(countSheet(st, 236)).toBe(4);
    expect(countSheet(st, 238), '1/60 败 → 无球茎').toBe(0);
  });

  it('H=1/M=0（未打机械）：1/40 门闭 → 无 236,233 兜底照走', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { hardMode: true });
    // [顶植物败, 1/25 过, 233 Next(8)=7, 3×2 落地→不重掷]
    scriptRng(evo, [0.99, 0.0, 0.99]);
    grow(evo, i, j);
    expect(countSheet(st, 236), 'mechAny 闭 → 零生命果').toBe(0);
    expect(countSheet(st, 233), '233 兜底（3×2 档）').toBe(6);
  });

  it('H=0/M=1（未开困难）：门闭 → 无 236 无 238', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { downed_134: true, downed_125: true, downed_127: true });
    scriptRng(evo, [0.99, 0.0, 0.99]);
    grow(evo, i, j);
    expect(countSheet(st, 236)).toBe(0);
    expect(countSheet(st, 238)).toBe(0);
  });

  it('掷率分母：classic 1/40 vs expert 1/30（cs:75062 maxValue2）', () => {
    // expert：1/40 败值 0.035 应在 1/30 门下过关（0.035 < 1/30 ≈ 0.0333? 否——取 0.03）
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { ...MECH2 }, 1);
    scriptRng(evo, [0.99, 0.0, 0.029, 0.0]);   // 0.029 < 1/30 过,≥1/40 败值域
    grow(evo, i, j);
    expect(countSheet(st, 236), 'expert 1/30 门过').toBe(4);
  });

  it('密度门：±60(step2) 内已有 236 → 掷过不落（cs:75065-75077 flag5）', () => {
    const { st, i, j } = mkJungle();
    // 预置既有生命果于 ±60 内
    st.setTile(i - 20, j - 2, S(236), 0, 0);
    st.setTile(i - 19, j - 2, S(236), 18, 0);
    st.setTile(i - 20, j - 1, S(236), 0, 18);
    st.setTile(i - 19, j - 1, S(236), 18, 18);
    const evo = mkEvo(st, { ...MECH2 });
    scriptRng(evo, [0.99, 0.0, 0.0, 0.0]);
    grow(evo, i, j);
    expect(countSheet(st, 236), '不超发=维持 4 格').toBe(4);
  });
});

// ================= B. 顶植物旗语义（cs:75013 `flag ||`） =================

describe('case 60 门=顶植物掷旗（flag ||）而非「上格空」', () => {
  it('上格有旧株 61：Next(25) 照掷,生命果可覆写旧株（原版允许族）', () => {
    const { st, i, j } = mkJungle();
    st.setTile(i, j - 1, S(61), 0, 0);   // 旧丛林植物占上格
    const evo = mkEvo(st, { ...MECH2 });
    // [61 顶植物掷=短路不掷(上格非空), 1/25 过, 1/40 过, style=0]
    const calls = scriptRng(evo, [0.0, 0.0, 0.0]);
    grow(evo, i, j);
    expect(calls.length, '上格占用=顶植物掷短路,流内只 3 掷').toBe(3);
    expect(countSheet(st, 236), '生命果覆写旧株 2×2').toBe(4);
    expect(sheetAt(st, i, j - 1), '旧株被覆写').toBe(236);
  });

  it('本 tick 顶植物掷已过 → Next(25) 短路不掷（flag 短路位次）', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { ...MECH2 });
    // [顶植物 1/10 过=flag 真, place1 内部 61 样式骰(variants=8,原版 PlaceTile 同位)
    //  ——case 60 门 flag 短路:Next(25) 不掷]
    const calls = scriptRng(evo, [0.0]);
    grow(evo, i, j);
    expect(calls.length, 'flag 短路:流内 2 掷（顶植物+样式）,Next(25) 不掷').toBe(2);
    expect(sheetAt(st, i, j - 1), '顶植物 61 已落').toBe(61);
    expect(countSheet(st, 236)).toBe(0);
  });

  it('上格液体 ≠ 0 → 1/25 掷后仍拒（cs:75013 第三支）', () => {
    const { st, i, j } = mkJungle();
    st.liquid[st.idx(i, j - 1)] = 200;
    st.liquidType[st.idx(i, j - 1)] = 0;
    const evo = mkEvo(st, { ...MECH2 });
    const calls = scriptRng(evo, [0.99, 0.0]);   // 顶植物败 + 1/25 掷过
    grow(evo, i, j);
    expect(calls.length).toBe(2);
    expect(countSheet(st, 236)).toBe(0);
  });
});

// ================= C. 端到端（update() 真随机统计,6× 判例） =================

describe('端到端演化统计（update() 真随机）', () => {
  // 大地下丛林台：600×400,worldSurface=40;丛林地板 y=100,103,…,379（每层上方
  //  两行空气=原版平底洞窟地面,果 2×2 占 j-2/j-1 两行）
  function mkBig(flags: Record<string, boolean>, difficulty = 0) {
    const st = new TileStore(600, 400);
    for (let y = 100; y < 380; y += 3) for (let x = 20; x < 580; x++) st.setTile(x, y, S(60));
    const evo = mkEvo(st, flags, difficulty);
    (evo as unknown as { host: { worldUpdateRate: number } }).host.worldUpdateRate = 24;
    return { st, evo };
  }

  it('mechAny 开：600 tick 内长出生命果（≥5 株=20 格）', () => {
    const { st, evo } = mkBig({ ...MECH2 });
    for (let t = 0; t < 600; t++) evo.update();
    const n = countSheet(st, 236);
    expect(n / 4, `600 tick 应 ≥5 株（实得 ${n / 4}）`).toBeGreaterThanOrEqual(5);
  }, 600_000);

  it('mechAny 关：600 tick 零生命果', () => {
    const { st, evo } = mkBig({ hardMode: true });
    for (let t = 0; t < 600; t++) evo.update();
    expect(countSheet(st, 236)).toBe(0);
  }, 600_000);

  it('球茎门=三王齐才掷：双王 600 tick 零 238', () => {
    const { st, evo } = mkBig({ ...MECH2 });
    for (let t = 0; t < 600; t++) evo.update();
    expect(countSheet(st, 238), '双王 ≠ mechAll → 零球茎').toBe(0);
  }, 600_000);
});
