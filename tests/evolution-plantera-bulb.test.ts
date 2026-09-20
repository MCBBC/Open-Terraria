// 世花球茎（238）专项守卫（BJ214 判例：链路 1:1 无断环,症状=原版同款稀疏性——
// 本测试锁 238 面防未来挪段/改门回归）。
// 原版锚（1457 WorldGen.cs；1458 对拍同段零变更）：
//   · case 60 球茎支    cs:75024-75050：hardMode && downedMechBoss1∧2∧3 && Next(60)==0
//     → ±150(step2) 扫描无 238 → PlaceJunglePlant(i,minJ,238,0,0)；
//     ★与 236 支为两个【独立 if】——238 落地后贯穿继续掷 236（cs:75051 无 break）
//   · PlaceJunglePlant  cs:48191-48275：2×2 允许族+双列底承 SolidTile+60；
//     帧=num2=36*styleX（238 styleX=0 → frameX∈{0,18}/frameY∈{0,18}）
//   · SolidTile         cs:70487-70504：nactive∧tileSolid∧!SolidTop∧!halfBrick∧slope==0
//   · 保底链            cs:74718-74786（GeneratePlanteraBulbOnAllMechsDefeated：2500 掷
//     搜索框 [0.15,0.35]|[0.65,0.85]×[worldSurface,h-200]，tries<500 forceBulb 允许泥
//     59+4×4 计分≥12；<200 非活动格也算；逐点向上走 ≤500 步找 60/59；三锚 (0,-1,+1)）
//   · AttemptToGeneratePlanteraBulbAt cs:74788-74869：force 支 4×4 泥/草 +1 其余活动
//     -1 黑名单即 -1，<12 拒；ClearTile+边环转 60+SquareTileFrame；PlaceJunglePlant
//     (238,0,0,inheritPaint:true)
//   · 调用点            NPC.cs:79593-79600 case 16/17/18 首翻一次性（无周期重试）
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
  (evo as unknown as { hardMode: boolean }).hardMode = !!flags.hardMode;
  (evo as unknown as { allowedToSpread: boolean }).allowedToSpread = true;
  return evo;
}

function scriptRng(evo: WorldEvolution, queue: number[]): number[] {
  const calls: number[] = [];
  const r = (evo as unknown as { spreadRng: { next: () => number } }).spreadRng;
  let n = 0;
  r.next = () => {
    const v = n < queue.length ? queue[n] : 0.99;
    calls.push(v);
    n++;
    return v;
  };
  return calls;
}

/** 平底双列丛林草台：y=G 行 x∈[100,160) 全草,上方留空 */
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

const MECH3 = { hardMode: true, downed_134: true, downed_125: true, downed_127: true };

// ================= A. 238 正落位 + 与 236 独立 if 贯穿 =================

describe('球茎 238 正面（cs:75024-75060）', () => {
  it('三王齐+1/60 过：238 2×2 落地(styleX=0 帧 0/18),且 236 门照掷=独立 if 贯穿', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { ...MECH3 });
    // [顶植物 1/10 败, 1/25 过, 1/60 过→238, 1/40 过→236, style Next(3)]
    const calls = scriptRng(evo, [0.99, 0.0, 0.0, 0.0, 0.0]);
    grow(evo, i, j);
    expect(countSheet(st, 238), '球茎 2×2 落地').toBe(4);
    // 帧：238 styleX=0 → frameX∈{0,18},frameY∈{0,18},占 (i-1..i, j-2..j-1)
    expect(st.frameX[st.idx(i - 1, j - 2)]).toBe(0);
    expect(st.frameX[st.idx(i, j - 2)]).toBe(18);
    expect(st.frameY[st.idx(i - 1, j - 1)]).toBe(18);
    // ★独立 if：238 落地不短路 236——Next(40) 照掷（cs:75051 无 break）。
    //   236 落位则被新鲜花苞自身挡掉（238∉PlaceJunglePlant 允许族,cs:48214 字面
    //   拒绝——原版同相:独立 if 指【掷】贯穿,非【落】叠加）
    expect(calls.length, '流内 5 掷（顶植物/25/60/40/style;238 后 1/40 照掷）').toBe(5);
    expect(countSheet(st, 236), '238 占位 → 236 允许族拒（原版同相）').toBe(0);
  });

  it('150 格密度罩：±150(step2) 内已有 238 → 掷过不落（cs:75026-75039 flag4）', () => {
    const { st, i, j } = mkJungle();
    // 预置既有球茎于 (i-20, j-2)（±150 内）
    st.setTile(i - 20, j - 2, S(238), 0, 0);
    st.setTile(i - 19, j - 2, S(238), 18, 0);
    st.setTile(i - 20, j - 1, S(238), 0, 18);
    st.setTile(i - 19, j - 1, S(238), 18, 18);
    const evo = mkEvo(st, { ...MECH3 });
    // [顶植物败, 1/25 过, 1/60 过(扫描发现→不落), 1/40 败, 233 Next(8)]
    scriptRng(evo, [0.99, 0.0, 0.0, 0.99, 0.99]);
    grow(evo, i, j);
    expect(countSheet(st, 238), '不超发=维持 4 格').toBe(4);
  });

  it('mechAll 键域 tripwire：downed_126（双子另一键）不满足三王门', () => {
    const { st, i, j } = mkJungle();
    // 双子共写 downed_125（Game.ts twinsPart）；downed_126 非门键——
    // 若未来有人把门读成 126 或 OR 宽化,此测红
    const evo = mkEvo(st, { hardMode: true, downed_134: true, downed_126: true });
    // [顶植物败, 1/25 过, mechAll 假→1/60 短路不掷, 1/40 过(mechAny=126 真), style]
    const calls = scriptRng(evo, [0.99, 0.0, 0.0, 0.0]);
    grow(evo, i, j);
    expect(calls.length, 'mechAll 短路:1/60 不入流（4 掷）').toBe(4);
    expect(countSheet(st, 238), '三王门假 → 零球茎').toBe(0);
    expect(countSheet(st, 236), '236 走 mechAny 照落').toBe(4);
  });

  it('1/60 掷位：三王齐但 1/60 败 → 无 238,236 支照走（同 tick 链不断）', () => {
    const { st, i, j } = mkJungle();
    const evo = mkEvo(st, { ...MECH3 });
    // [顶植物败, 1/25 过, 1/60 败, 1/40 过, style]
    scriptRng(evo, [0.99, 0.0, 0.99, 0.0, 0.0]);
    grow(evo, i, j);
    expect(countSheet(st, 238)).toBe(0);
    expect(countSheet(st, 236)).toBe(4);
  });
});

// ================= B. 保底链（GeneratePlanteraBulbOnAllMechsDefeated） =================

describe('保底球茎链（cs:74718-74869）', () => {
  /** 泥芯草带台:行 60-70 x∈[180,190) 实心泥,行 65=丛林草(嵌芯)——
   *  ★须落保底链搜索框 y∈[worldSurface=40, h-200=100) 与 x∈[0.65w,0.85w)=[169,221)；
   *  force 计分窗 (锚x-2..+1, 锚y-2..+1)=泥 12+草 4=16≥12 */
  function mkSlab(): { st: TileStore; ai: number; aj: number } {
    const st = new TileStore(260, 300);
    for (let y = 60; y <= 70; y++) {
      for (let x = 180; x < 190; x++) st.setTile(x, y, S(y === 65 ? 60 : 59));
    }
    return { st, ai: 184, aj: 64 };   // 锚=(184,64)=2×2 右下角;支撑行 65=草芯
  }

  it('burst:丛林侧搜索框命中泥芯草带 → 落 1 株 2×2（实 RNG,确定性种子）', () => {
    const { st } = mkSlab();
    const evo = mkEvo(st, { ...MECH3 });   // dungeonX=60<130 → 框 x∈[169,221),y∈[40,100)
    const ret = evo.planteraBulbBurst();
    expect(ret, '2500 掷内命中(tries<500 后 force 档掏泥芯)').toBe(true);
    expect(countSheet(st, 238), '恰一株 2×2').toBe(4);
  });

  it('attemptBulbAt forceBulb:计分≥12 → 清 4×4+边环转 60+落苞', () => {
    const { st, ai, aj } = mkSlab();
    const evo = mkEvo(st, { ...MECH3 });
    // 锚 (184,64):窗 (182..185,62..65) 泥12+草4=16;2×2=泥(63,64)——提升门旧码即拒,
    //  原版 force 清场后落位（本测=BJ214 修回归锁）
    const ret = (evo as unknown as {
      attemptBulbAt(i: number, j: number, force: boolean): boolean;
    }).attemptBulbAt(ai, aj, true);
    expect(ret).toBe(true);
    expect(countSheet(st, 238), '球茎 2×2 落 (183..184,63..64)').toBe(4);
    expect(sheetAt(st, 183, 63)).toBe(238);
    expect(sheetAt(st, 184, 64)).toBe(238);
    // 边环转 60（cs:74823-74831:ClearTile 后边环 type=60）
    expect(sheetAt(st, 182, 62), '边环角=丛林草').toBe(60);
    expect(sheetAt(st, 185, 65), '边环对角=丛林草').toBe(60);
  });

  it('attemptBulbAt forceBulb:计分窗含黑名单（箱 21）→ 拒（cs:74808-74811）', () => {
    const { st, ai, aj } = mkSlab();
    st.setTile(182, 62, S(21), 0, 0);   // 箱在计分窗角
    const evo = mkEvo(st, { ...MECH3 });
    const ret = (evo as unknown as {
      attemptBulbAt(i: number, j: number, force: boolean): boolean;
    }).attemptBulbAt(ai, aj, true);
    expect(ret, '黑名单即 -1 → 拒').toBe(false);
    expect(countSheet(st, 238)).toBe(0);
    expect(sheetAt(st, 182, 62), '拒绝=零写面').toBe(21);
  });
});

// ================= C. 端到端（update() 真随机,理想平底台统计） =================

describe('端到端:三王齐 600 tick(rate=24) 球茎涌现', () => {
  it('mechAll 真:理想平底台 ≥1 株球茎', () => {
    const st = new TileStore(600, 400);
    for (let y = 100; y < 380; y += 3) for (let x = 20; x < 580; x++) st.setTile(x, y, S(60));
    const evo = mkEvo(st, { ...MECH3 });
    (evo as unknown as { host: { worldUpdateRate: number } }).host.worldUpdateRate = 24;
    for (let t = 0; t < 600; t++) evo.update();
    expect(countSheet(st, 238), '理想台面高速涌现（自然世界因 f≈1.8% 远慢于此）').toBeGreaterThanOrEqual(4);
  }, 600_000);

  it('mechAll 假（仅双王）:600 tick 零球茎（236 照长）', () => {
    const st = new TileStore(600, 400);
    for (let y = 100; y < 380; y += 3) for (let x = 20; x < 580; x++) st.setTile(x, y, S(60));
    const evo = mkEvo(st, { hardMode: true, downed_134: true, downed_125: true });
    (evo as unknown as { host: { worldUpdateRate: number } }).host.worldUpdateRate = 24;
    for (let t = 0; t < 600; t++) evo.update();
    expect(countSheet(st, 238)).toBe(0);
    expect(countSheet(st, 236), '236 mechAny 支不受影响').toBeGreaterThanOrEqual(4);
  }, 600_000);
});
