// ★RD13（2026-09-05）演化域登记债收齐批：①KillTile_DropBait 演化面 / ②TileFrame
// 派发补齐（80 CheckCactus·567 CheckGnome·630/631 CheckStinkbugBlocker·723/724
// CheckAnchor）/ ③519 香蒲 CheckCatTail·GrowCatTail / ④地下藤尾第二掷段 /
// ⑤remix 双调采样 / ⑥CopyPaintAndCoating 漆继承 / ⑦211·346 衰减臂流归属定谳。
// 原版锚（Terarria1457）：
//   · DropBait：WorldGen.cs:66784-66944（序贯独立 if、&& 短路 cap 门在掷前、
//     185-187 帧带、花靴 ×10000、gold=GetClosestRollLuck→Luck.RollLuck(luck,400)）、
//     KillTile 掉落段序 DropBait(:64375)→DropItems(:64376)。
//   · CheckCactus cs:54579（派发 cs:82646）/ CheckGnome cs:54400 /
//     CheckStinkbugBlocker cs:54373 / CheckAnchor cs:54290 /
//     ValidateOrAttemptReorientingAnchor cs:54299 / ConsideredSolidTileForAnchor cs:54352。
//   · CheckCatTail cs:59231 / GrowCatTail cs:59463（地表支 cs:72748 Next(8)·
//     地下支 cs:73853 Next(2)）。
//   · 藤尾第二掷段 cs:74439-74534（CopyPaintAndCoating :74451/:74489/:74531）。
//   · remix 双调 cs:72145-72156（2.5e-5、Underground→Overground、
//     growGrassUnderground 包络 → SpreadGrass 门 cs:75764 豁免）。
//   · 漆继承 Tile.cs:869 CopyPaintAndCoating（color/invisibleBlock/fullbrightBlock）。
//   · ⑦定谳：WorldGen.genRand ≡ Main.rand（WorldGen.cs:4362 别名属性）且
//     hardUpdateWorld 调用点全在 Main.SwapRandom("UpdateWorldGen") 作用域
//     （Main.cs:17985-17988）——衰减臂 Main.rand.Next(-6,7)（cs:70209）与本域
//     this.rng() 同流;InWorld(num8,num9,2) 门 cs:70211。
// 骰位断言口径：stubRng 截获 this.rng()——consumed 序列=蔓延流骰序（含 gold 掷;
// 不含宿主 spawnBaitNpc 单源内的 velocity 掷——Game.spawnBaitNpcAt 的 rand 形参
// 在演化宿主接线为蔓延流,测试钩不消费以便骰位断言聚焦 DropBait 本体）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

interface DropRec { vid: number; x: number; y: number; stack: number }
interface BaitRec { vid: number; x: number; y: number }

function mkStore(w = 40, h = 80): TileStore {
  return new TileStore(w, h);
}

interface HostOpts {
  flowerBoots?: boolean;
  graveyard?: boolean;
  wormCritters?: number;
  luck?: number;
  remix?: boolean;
  withBaitHook?: boolean;
}

function mkEvo(st: TileStore, seed: number, drops: DropRec[], baits: BaitRec[],
  opts: HostOpts = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 40, rockLevel: 20, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: (vid, x, y, stack) => { drops.push({ vid, x, y, stack }); },
    flowerBoots: () => opts.flowerBoots ?? false,
    zoneGraveyard: () => opts.graveyard ?? false,
    countCritters: (vids) => (vids.includes(357) || vids.includes(606))
      ? (opts.wormCritters ?? 0) : 0,             // cap 只对 worm 族生效（hop/grub 空世界=0）
    closestLuck: () => opts.luck ?? 0,
    ...(opts.withBaitHook === false ? {} : {
      spawnBaitNpc: (vid, x, y) => { baits.push({ vid, x, y }); },
    }),
    remixWorld: opts.remix ?? false,
  };
  return new WorldEvolution(host);
}

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩;evolution-rng-seed-stream 同款） */
function captureRolls(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

/** 掷源桩：按队列出队（耗尽回退 1=恒不中），用于骰位/分支的确定性断言 */
function stubRng(evo: WorldEvolution, queue: number[]): number[] {
  const q = [...queue];
  const consumed: number[] = [];
  (evo as unknown as { rng(): number }).rng = () => {
    const v = q.length > 0 ? q.shift()! : 1;
    consumed.push(v);
    return v;
  };
  return consumed;
}

const kill = (evo: WorldEvolution, x: number, y: number): void =>
  (evo as unknown as { kill(x: number, y: number): void }).kill(x, y);

/** 私有方法调用（this=实例） */
function invoke<T = void>(evo: WorldEvolution, name: string, ...args: unknown[]): T {
  return (evo as unknown as Record<string, (...a: unknown[]) => T>)[name](...args);
}

const storeOf = (evo: WorldEvolution): TileStore =>
  (evo as unknown as { host: { store: TileStore } }).host.store;
const typeAt = (evo: WorldEvolution, x: number, y: number): number => storeOf(evo).type[storeOf(evo).idx(x, y)];
const hasAt = (evo: WorldEvolution, x: number, y: number): boolean => storeOf(evo).hasTile(x, y);

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

// ============================================================ ① DropBait
describe('★① KillTile_DropBait 演化面（cs:66784-66944）', () => {
  it('草 3：worm 中后 gold/hop 骰照掷（序贯独立 if,无早退）→ 357;骰序 worm→gold→hop', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);            // 杂草
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, [0, 0.5, 0.99]);   // worm 中/gold 掷(≠0)/hop 不中
    kill(evo, 10, 10);
    expect(baits.map((b) => b.vid)).toEqual([357]);  // 普通 worm（luck=0 → gold 掷 ≠0）
    expect(consumed).toEqual([0, 0.5, 0.99]);        // 三骰全走 this.rng()（早退结构只 1 骰）
  });

  it('草 3：worm+hop 可同年同击双中（vanilla 序贯相;Game 侧单产物结构不做此保证）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    stubRng(evo, [0, 0.5, 0, 0.5]);                  // worm 中/gold 掷/hop 中/hop gold 掷≠0
    kill(evo, 10, 10);
    expect(baits.map((b) => b.vid)).toEqual([357, 377]);
  });

  it('cap 门在掷前短路（CountNPCS(357)>=5 → worm 骰不消费;hop 门独立=照掷）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { wormCritters: 5 });
    const consumed = stubRng(evo, [0.99]);           // 仅 hop 骰入队（worm 骰被 cap 短路跳过）
    kill(evo, 10, 10);
    expect(baits).toHaveLength(0);
    expect(consumed).toEqual([0.99]);                // worm 掷被 && 短路,只掷 hop
  });

  it('73 成熟药草株（fx<108）：clover 1/1000 → 5574 经 spawnKillDrop（与虫族独立 if）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(73), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, [0.99, 0, 0.99]);  // worm 不中/clover 中/hop 不中
    kill(evo, 10, 10);
    expect(drops.map((d) => d.vid)).toEqual([5574]);
    expect(baits).toHaveLength(0);
    expect(consumed).toHaveLength(3);
  });

  it('墓地小气候：worm 606 覆写且金掷短路【不掷】（cs:66885-66887 num7==357 门）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { graveyard: true });
    const consumed = stubRng(evo, [0, 0.99]);        // worm 中/hop 不中——无 gold 骰
    kill(evo, 10, 10);
    expect(baits.map((b) => b.vid)).toEqual([606]);
    expect(consumed).toEqual([0, 0.99]);
  });

  it('花靴 ×10000 门（fx>=108）：分母 400→4,000,000——同骰值异命中', () => {
    const st = mkStore();
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    st.setTileSilent(10, 10, S(3), 108, 0);          // 自长植株帧
    const noFb = mkEvo(st, 7, [], [], { withBaitHook: false });
    stubRng(noFb, [0.00005, 0.99]);                  // < 1/400 → 无花靴中（gold 骰跟进）
    kill(noFb, 10, 10);
    st.setTileSilent(10, 10, S(3), 108, 0);          // 重铺（上一次 kill 已清格）
    const withFb = mkEvo(st, 7, [], baits, { flowerBoots: true });
    const r2 = stubRng(withFb, [0.00005, 0.99]);     // ≥1/4,000,000 → 不中（骰已掷）
    kill(withFb, 10, 10);
    expect(baits).toHaveLength(0);
    expect(r2).toEqual([0.00005, 0.99]);
  });

  it('61 蚱蜢株：Next(80) 中 → 序贯 Next(4)/Next(12) 变体覆写 → 487（骰仅中后消费）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(61), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, [0, 0, 0]);        // Next(80) 中/Next(4)==0→486/Next(12)==0→487
    kill(evo, 10, 10);
    expect(baits.map((b) => b.vid)).toEqual([487]);
    expect(consumed).toHaveLength(3);
  });

  it('637 灰烬株：Next(100) 中 → Next(2) 分型 653/654', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(637), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    stubRng(evo, [0, 0.9]);                          // 中/Next(2)≠0 → 653
    kill(evo, 10, 10);
    expect(baits.map((b) => b.vid)).toEqual([653]);
  });

  it('宿主无 spawnBaitNpc 出口：骰照掷（原版掷不依赖生成能力）+gold 掷走蔓延流', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { withBaitHook: false });
    const consumed = stubRng(evo, [0, 0, 0.99]);     // worm 中/gold 掷(=0→金 448)/hop 不中
    kill(evo, 10, 10);
    expect(consumed).toHaveLength(3);
  });
});

// ============================================================ ② 派发补齐
describe('★② TileFrame 派发补齐（80/567/630·631/723·724）', () => {
  it('case 80 CheckCactus：杀沙基 → 仙人掌整段折断（killFlat 带掉落 276×N）', () => {
    const st = mkStore();
    st.setTileSilent(10, 12, S(53), 0, 0);           // 沙基
    st.setTileSilent(10, 11, S(80), 0, 0);           // 仙人掌两段
    st.setTileSilent(10, 10, S(80), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 10, 12);                               // 杀基 → SquareTileFrame 派发
    expect(hasAt(evo, 10, 11)).toBe(false);
    expect(hasAt(evo, 10, 10)).toBe(false);
    expect(drops.filter((d) => d.vid === 276)).toHaveLength(2);
  });

  it('case 80：基座完好但直柱下格失续（中段挖空）→ 顶段折断', () => {
    const st = mkStore();
    st.setTileSilent(10, 12, S(53), 0, 0);
    st.setTileSilent(10, 11, S(80), 0, 0);
    st.setTileSilent(10, 10, S(80), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 10, 11);                               // 杀中段：顶格 (10,10) 下/左/右皆非 80
    expect(hasAt(evo, 10, 10)).toBe(false);
  });

  it('case 567 CheckGnome：地基失 → 双半 KillTile + 4609 掉落（Item.NewItem 位次）', () => {
    const st = mkStore();
    st.setTileSilent(10, 12, S(1), 0, 0);            // 石地基
    st.setTileSilent(10, 11, S(567), 0, 20);         // 矮人下半
    st.setTileSilent(10, 10, S(567), 0, 0);          // 上半
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 10, 12);                               // 杀地基
    expect(hasAt(evo, 10, 10)).toBe(false);
    expect(hasAt(evo, 10, 11)).toBe(false);
    expect(drops.some((d) => d.vid === 4609 && d.y === 10)).toBe(true);
  });

  it('case 567：双半齐全+地基在 → 邻格破坏不牵连', () => {
    const st = mkStore();
    st.setTileSilent(10, 12, S(1), 0, 0);
    st.setTileSilent(10, 11, S(567), 0, 20);
    st.setTileSilent(10, 10, S(567), 0, 0);
    st.setTileSilent(14, 12, S(1), 0, 0);            // 4 格外无关石块（不在 3×3 派发域）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 14, 12);
    expect(hasAt(evo, 10, 10)).toBe(true);
    expect(hasAt(evo, 10, 11)).toBe(true);
    expect(drops.some((d) => d.vid === 4609)).toBe(false);
  });

  it('case 630 CheckStinkbugBlocker：原墙挂（style2）左墙失 → 重锚 style0（frameX=0）', () => {
    const st = mkStore();
    st.setTileSilent(9, 10, S(1), 0, 0);             // 左墙（石）
    st.setTileSilent(10, 11, S(1), 0, 0);            // 落地备选（重锚目标）
    st.setTileSilent(10, 10, S(630), 36, 0);         // style=2（左挂）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 9, 10);                                // 左墙失
    expect(hasAt(evo, 10, 10)).toBe(true);           // 重锚不杀
    expect(st.frameX[st.idx(10, 10)]).toBe(0);       // style 0（落地）
  });

  it('case 630：全向失锚（无墙无地基）→ KillTile（无掉落 case=零掉落走面）', () => {
    const st = mkStore();
    st.setTileSilent(9, 10, S(1), 0, 0);
    st.setTileSilent(10, 10, S(630), 36, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 9, 10);
    expect(hasAt(evo, 10, 10)).toBe(false);
    expect(drops).toHaveLength(0);
  });

  it('case 723 CheckAnchor：地基失+无墙 → switchToWallIfInvalid 重锚 style4（frameX=72）不杀', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(1), 0, 0);
    st.setTileSilent(10, 10, S(723), 0, 0);          // style 0（落地挂）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    kill(evo, 10, 11);
    expect(hasAt(evo, 10, 10)).toBe(true);           // 永不杀
    expect(st.frameX[st.idx(10, 10)]).toBe(72);      // style 4（墙挂兜底）
  });
});

// ============================================================ ③ 519 香蒲
describe('★③ 519 CheckCatTail/GrowCatTail（cs:59231/:59463）', () => {
  it('底型不在表（泥）→ flag → 整列 519 KillTile（无掷:两 Next(4) 条件门均未开）', () => {
    const st = mkStore();
    st.setTileSilent(10, 20, S(0), 0, 0);            // 泥底（不在 frameY 表）
    for (let y = 15; y <= 19; y++) {
      st.setTileSilent(10, y, S(519), 0, 0);
      st.liquid[st.idx(10, y)] = 255;
      st.liquidType[st.idx(10, y)] = 1;              // 水
    }
    st.setTileSilent(10, 14, S(0), 0, 0);
    st.liquid[st.idx(10, 14)] = 255;
    st.liquidType[st.idx(10, 14)] = 1;
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, []);
    invoke(evo, 'checkCatTail', 10, 17);
    for (let y = 15; y <= 19; y++) expect(hasAt(evo, 10, y)).toBe(false);
    expect(consumed).toHaveLength(0);                // 水浅门(255<127 假)+带穗门(frameX<180)均未掷
  });

  it('沙底（frameY 表 18）→ 全列 frameY 重锚', () => {
    const st = mkStore();
    st.setTileSilent(10, 20, S(53), 0, 0);           // 沙底 → num5=18
    st.setTileSilent(10, 19, S(519), 0, 0);          // 单格香蒲（frameY=0）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, [0.99]);           // 水浅门掷（liquid 0<127 真）不中
    invoke(evo, 'checkCatTail', 10, 19);
    expect(hasAt(evo, 10, 19)).toBe(true);
    expect(st.frameY[st.idx(10, 19)]).toBe(18);
    expect(consumed).toEqual([0.99]);
  });

  it('GrowCatTail：frameX 18 → Next(2,5) 长骰 + 上添 90 段（CopyPaintAndCoating 源=下段）', () => {
    const st = mkStore();
    st.setTileSilent(10, 20, S(53), 0, 0);
    st.setTileSilent(10, 19, S(519), 18, 18);
    st.setPaint(10, 19, 5);                          // 下段带漆
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const consumed = stubRng(evo, [0.5]);            // Next(2,5)：floor(0.5×3)=1 → 54
    invoke(evo, 'growCatTail', 10, 19);
    expect(st.frameX[st.idx(10, 19)]).toBe(54);
    expect(hasAt(evo, 10, 18)).toBe(true);           // 上段生成
    expect(st.frameX[st.idx(10, 18)]).toBe(90);
    expect(st.paint[st.idx(10, 18)]).toBe(5);        // 漆继承
    expect(consumed).toEqual([0.5]);
  });

  it('地表支生长门 1/8（Next(8)）vs 地下支 1/2（Next(2)）——同骰值异分支（cs:72748/:73858）', () => {
    const mk519 = (): TileStore => {
      const st = mkStore();
      st.setTileSilent(10, 20, S(53), 0, 0);
      st.setTileSilent(10, 19, S(519), 18, 18);
      return st;
    };
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const surf = mkEvo(mk519(), 7, [], baits);
    stubRng(surf, [0.99, 0.13]);                     // checkCatTail 水浅掷/growth 门 0.13
    invoke(surf, 'overgroundTile', 10, 19, 3);
    expect(hasAt(surf, 10, 18)).toBe(false);         // 0.13 ≥ 1/8 → 地表不长
    const under = mkEvo(mk519(), 7, [], baits);
    stubRng(under, [0.99, 0.99, 0.13, 0.5]);         // plantDye(1/2500)/checkCatTail/门 0.13<1/2 → 长/Next(2,5)
    invoke(under, 'undergroundTile', 10, 19, 3);
    expect(hasAt(under, 10, 18)).toBe(true);         // 地下 1/2 → 长
  });
});

// ============================================================ ④ 地下藤尾第二掷段
describe('★④ 地下藤尾第二掷段（cs:74439-74534）', () => {
  it('62 藤尾：主链骰不中后尾段 Next(10) 中 → 下格添 62 + CopyPaintAndCoating', () => {
    const st = mkStore();
    st.setTileSilent(10, 19, S(60), 0, 0);           // 丛林草锚
    st.setTileSilent(10, 20, S(62), 0, 0);           // 既有藤
    st.setPaint(10, 20, 3);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    stubRng(evo, [0.99, 0.99, 0.99, 0]);             // plantDye/主链 Next(5)/蜂巢 Next(80) 不中/尾段 Next(10) 中
    invoke(evo, 'undergroundTile', 10, 20, 3);
    expect(hasAt(evo, 10, 21)).toBe(true);
    expect(typeAt(evo, 10, 21)).toBe(S(62));
    expect(st.paint[st.idx(10, 21)]).toBe(3);        // 漆继承（cs:74451）
  });

  it('61→74 尾段：主链 Next(3) 不中、尾段 Next(3) 中 → 转 74（Next(4) 帧骰不中）', () => {
    const st = mkStore();
    st.setTileSilent(10, 20, S(61), 0, 0);           // 丛林矮草
    st.setTileSilent(10, 21, S(60), 0, 0);           // 基座（setType 后 PlantCheck 级联不杀）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    stubRng(evo, [0.99, 0.99, 0, 0.99]);             // plantDye/主链 Next(3) 不中/尾 Next(3) 中/Next(4) 不中
    invoke(evo, 'undergroundTile', 10, 20, 3);
    expect(typeAt(evo, 10, 20)).toBe(S(74));
  });
});

// ============================================================ ⑤ remix 双调
describe('★⑤ remix 双调采样（cs:72145-72156）', () => {
  const proto = WorldEvolution.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;

  it('remix 世界：每样本 Underground→Overground 双调（同 (i,j)、growGrassUnderground 包络）', () => {
    const st = mkStore(200, 201);                    // w×h=40200 → 地下样本 1.005/ tick
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { remix: true });
    const calls: Array<{ fn: string; x: number; y: number; gg: boolean }> = [];
    const origU = proto.undergroundTile, origO = proto.overgroundTile;
    proto.undergroundTile = function (this: WorldEvolution, ...a: unknown[]) {
      calls.push({ fn: 'U', x: a[0] as number, y: a[1] as number, gg: !!(this as unknown as { growGrassUnderground: boolean }).growGrassUnderground });
      return origU.apply(this, a);
    };
    proto.overgroundTile = function (this: WorldEvolution, ...a: unknown[]) {
      calls.push({ fn: 'O', x: a[0] as number, y: a[1] as number, gg: !!(this as unknown as { growGrassUnderground: boolean }).growGrassUnderground });
      return origO.apply(this, a);
    };
    try {
      stubRng(evo, [0.99, 0.5, 0.5, 0.99, 0.99, 0.5, 0.5, 0.99, 0.5, 0.5]);
      evo.update();                                  // 地表 2 样本（各 4 骰:alch/i/j/beach 带）+ remix 2 迭代（第 2 迭代 j=181 边界 continue）
    } finally {
      proto.undergroundTile = origU;
      proto.overgroundTile = origO;
    }
    const dual = calls.filter((c) => c.y >= 39);     // 地下域样本（remix 双调的 y ≥ ws-1）
    expect(dual.map((c) => c.fn)).toEqual(['U', 'O']);          // 先 Underground 后 Overground
    expect(dual[0].x).toBe(dual[1].x);
    expect(dual[0].y).toBe(dual[1].y);
    expect(dual[0].gg && dual[1].gg).toBe(true);                // 双调包络内 growGrassUnderground=true
    expect(calls.some((c) => c.fn === 'O' && c.y < 39 && c.gg)).toBe(false);// 包络外（地表样本）恒 false
  });

  it('非 remix 世界：地下单调 1.5e-5、Overground 不落地下域', () => {
    const st = mkStore(200, 201);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const calls: Array<{ fn: string; y: number }> = [];
    const origU = proto.undergroundTile, origO = proto.overgroundTile;
    proto.undergroundTile = function (this: WorldEvolution, ...a: unknown[]) {
      calls.push({ fn: 'U', y: a[1] as number });
      return origU.apply(this, a);
    };
    proto.overgroundTile = function (this: WorldEvolution, ...a: unknown[]) {
      calls.push({ fn: 'O', y: a[1] as number });
      return origO.apply(this, a);
    };
    try {
      stubRng(evo, [0.99, 0.5, 0.5, 0.99, 0.99, 0.5, 0.5, 0.99, 0.5, 0.5]);
      evo.update();                                  // 地表 2 样本（各 4 骰）+ 地下 1 样本（2 骰）
    } finally {
      proto.undergroundTile = origU;
      proto.overgroundTile = origO;
    }
    expect(calls.filter((c) => c.fn === 'U' && c.y >= 39).length).toBe(1);
    expect(calls.some((c) => c.fn === 'O' && c.y >= 39)).toBe(false);
  });
});

// ============================================================ ⑥ 漆继承
describe('★⑥ CopyPaintAndCoating 漆继承面', () => {
  it('placeJunglePlant 3×2：漆源=锚右列下一格（cs:48347-48353 other2）', () => {
    const st = mkStore();
    for (const x of [11, 12, 13]) st.setTileSilent(x, 21, S(60), 0, 0);   // 底承丛林草
    st.setPaint(12, 21, 5);                          // 漆源格
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    const ok = invoke<boolean>(evo, 'placeJunglePlant', 12, 20, 233, 0, 0);
    expect(ok).toBe(true);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) {
      expect(st.paint[st.idx(12 + dx, 20 + dy)]).toBe(5);
    }
  });

  it('growCactus：沙上新生仙人掌继承沙格漆（cs:57135）', () => {
    const st = mkStore();
    for (let x = 4; x <= 16; x++) for (let y = 20; y <= 21; y++) st.setTileSilent(x, y, S(53), 0, 0);
    st.setPaint(10, 20, 3);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    invoke(evo, 'growCactus', 10, 20);
    expect(typeAt(evo, 10, 19)).toBe(S(80));
    expect(st.paint[st.idx(10, 19)]).toBe(3);
  });

  it('placeTight：钟乳石继承顶锚漆（cs:38735 区 other=x,y-1）', () => {
    const st = mkStore();
    st.setTileSilent(10, 19, S(161), 0, 0);          // 冰块顶锚
    st.setPaint(10, 19, 7);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    invoke(evo, 'placeTight', 10, 20);
    expect(typeAt(evo, 10, 20)).toBe(S(165));
    expect(st.paint[st.idx(10, 20)]).toBe(7);
  });

  it('蚁狮幼虫（396 采样支）：3×2 扫描内 num24 格继承采样格漆（cs:74236）', () => {
    const st = mkStore();
    st.setTileSilent(10, 20, S(396), 0, 0);          // 沙岩采样格
    st.setTileSilent(11, 20, S(396), 0, 0);          // 双列底承
    st.setPaint(10, 20, 9);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits);
    stubRng(evo, [0.99, 0, 0.99, 0.5]);              // plantDye/Next(80) 中/Next(100)≠0→485/样式 Next(4)
    invoke(evo, 'undergroundTile', 10, 20, 3);
    expect(typeAt(evo, 10, 18)).toBe(S(485));
    expect(st.paint[st.idx(10, 18)]).toBe(9);
  });
});

// ============================================================ ⑦ 衰减臂流归属/InWorld 门
describe('★⑦ 211·346 衰减臂（cs:70203-70212）', () => {
  const setHard = (evo: WorldEvolution): void => {
    (evo as unknown as { hardMode: boolean }).hardMode = true;   // update() 置位等价
  };

  it('流归属定谳面：臂骰走蔓延流（genRand≡Main.rand 别名,UpdateWorldGen 作用域）', () => {
    const st = mkStore();
    st.setTileSilent(5, 60, S(211), 0, 0);           // 叶绿（remix 豁免深度带）
    st.setTileSilent(4, 60, S(59), 0, 0);
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { remix: true });
    setHard(evo);
    const consumed = stubRng(evo, [0.99, 0.99, 0.2, 0.47]);
    // 自增殖门 Next(3) 过/Next(4)→下（目标空格）/衰减 x/y 两掷
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(consumed).toHaveLength(4);                // 全臂骰走 this.rng()（=蔓延流;genRand≡Main.rand 同流）
  });

  it('InWorld(num8,num9,2) 门（cs:70211）：世界 2 格边距内不落 Convert 9', () => {
    const st = mkStore();
    st.setTileSilent(5, 60, S(211), 0, 0);
    st.setTileSilent(1, 60, S(23), 0, 0);            // 边带腐化草（x=1 < 2）
    st.setTileSilent(2, 60, S(23), 0, 0);            // 域内对照（x=2）
    const drops: DropRec[] = [], baits: BaitRec[] = [];
    const evo = mkEvo(st, 7, drops, baits, { remix: true });
    setHard(evo);
    // 衰减 x 掷=0.2 → floor(0.2×13)=2 → 目标 x=1（边带）;y 掷=0.47 → floor(6.11)=6 → y=60
    stubRng(evo, [0.99, 0.99, 0.2, 0.47]);
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(typeAt(evo, 1, 60)).toBe(S(23));          // 边带不退化
    // 对照：同臂掷域内格（x=2 ← floor(rng×13)=3）
    st.setTileSilent(5, 60, S(211), 0, 0);
    stubRng(evo, [0.99, 0.99, 0.25, 0.47]);
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(typeAt(evo, 2, 60)).toBe(S(60));          // 域内 Convert 9：23→60
  });
});
