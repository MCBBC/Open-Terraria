// ★①（2026-09-05 演化 kill 整树级联批）+ ★②（kill 掉落面扩展批）回归。
//
// ① 树坍塌面（TileFrame 帧重要块 default 支树干族派发 cs:87146-87195）：
//   · case 5 → CheckTree（cs:55045-55249）：任意树格失基（下方亡,杀臂1 num4!=2&&
//     fx∈{0,22,44}&&fy<=130）/失续（臂2/5）/下方亡（臂5c num4==-1）→ KillTile；
//     每格 KillTile 默认参（带掉落）→ killFlat→killDropFace 逐格掉木；级联由
//     frameDependents 队列续推 3×3（=原版 KillTile→SquareTileFrame→TileFrame 递归面,
//     树干向上爬+已清格 hasTile 头门终止）。CheckTree/WithSettings 全支无掷骰。
//   · case 323 → CheckPalmTree（cs:54821）：下格沙族归一（234/116/112→53）失配即杀;
//     上邻异型重锚 genRand.Next(7,10)（cs:54851）——杀臂后 frameX=-1≤44 照掷=原版字面。
//   · case 72 → 蘑菇树内联（cs:87106-87140）：下格 ∉{72,70} → 杀（单列坍塌）。
// ② 掉落面扩展（KillTile_GetItemDrops cs:64477 起可达型逐支,详见 WorldEvolution.killDropFace
//   头注）：仙人掌 80→276（cs:65232;水淹 SlowlyDiesInWater 位次可达）、宝石树 583-589
//   SetGemTreeDrops（cs:66614：1/10 宝石 else 泥土;冠帧 1/2 宝石树种;泥土档 stack
//   Next(1,3)）、蘑菇族 71/72（1/40→194 else 1/2→183）、药草 83/84（草 313+style +
//   收获门种子 307+style）、草族 3/24/110/201/73、藤 52/62/382 cordage、528 genRand 骰、
//   637 1/100→5214；覆写位次 noItem 化（placeJunglePlant/placeOasisPlant/attemptBulbAt
//   ——cs:48242/:47994/ClearTile:74816 零掉落）与 sanitizePlants noItem
//   （isGeneratingOrLoadingWorld 强制 noItem,cs:64057-64059）。
// 掷签流归属：genRand 骰=蔓延流（this.rng()）；Main.rand 骰=宿主全局流（Math.random）。
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
const tid = (st: TileStore, x: number, y: number): number => st.type[st.idx(x, y)];

interface DropRec { vid: number; x: number; y: number; stack: number }

interface Opts {
  axe?: number;
  hasItem?: (vid: number) => boolean;
  cordage?: boolean;
  alchemyHarvestable?: (style: number, y: number) => boolean;
}

function mkEvo(st: TileStore, seed: number, drops: DropRec[], opts: Opts = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: (vid, x, y, stack) => { drops.push({ vid, x, y, stack }); },
    selectedAxePower: () => opts.axe ?? 0,
    playerHasItem: opts.hasItem,
    playerCordage: opts.cordage ? () => true : undefined,
    alchemyHarvestable: opts.alchemyHarvestable,
  };
  return new WorldEvolution(host);
}

function mkStore(): TileStore {
  return new TileStore(40, 80);
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

type EvoPriv = {
  kill(x: number, y: number): void;
  killDependentAt(x: number, y: number): boolean;
  plantCheckAt(x: number, y: number, noItem?: boolean): boolean;
  placeJunglePlant(x: number, y: number, sheet: number, sx: number, sy: number): boolean;
};

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

describe('① 树坍塌级联（TileFrame 树干族派发 → CheckTree）', () => {
  it('杀树基草 → 整树逐格坍塌 + 逐格掉木（KillTile 默认参掉落面）', () => {
    const st = mkStore();
    st.setTileSilent(20, 31, S(0), 0, 0);          // 泥土（树底地面）
    st.setTileSilent(20, 30, S(2), 0, 0);          // 草（树基,被杀格）
    st.setTileSilent(20, 29, S(5), 0, 0);          // 干基（fx=0 fy=0 → 杀臂1）
    st.setTileSilent(20, 28, S(5), 0, 22);
    st.setTileSilent(20, 27, S(5), 0, 44);
    st.setTileSilent(20, 26, S(5), 0, 66);         // 干顶（fx=0 fy=66 → 无冠帧骰）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 }); // axe≥35 → bonus 恒中=每格 2 木
    const rolls = captureRolls(evo, () => (evo as unknown as EvoPriv).kill(20, 30));
    expect(tid(st, 20, 29)).toBe(0);               // ★干基坍塌
    expect(tid(st, 20, 28)).toBe(0);
    expect(tid(st, 20, 27)).toBe(0);
    expect(tid(st, 20, 26)).toBe(0);               // ★整树倒
    expect(tid(st, 20, 30)).toBe(0);
    // 逐格掉木：4 树格 ×（木 9 ×2）——基座已亡（泥土）→ GetTreeType None → 普通木 9
    expect(drops.length).toBe(4);
    expect(drops.every((d) => d.vid === 9 && d.stack === 2)).toBe(true);
    expect(drops.map((d) => d.y)).toEqual([29, 28, 27, 26]);
    expect(rolls.length).toBe(4);                  // 每格斧骰各 1（CheckTree 本身零掷）
  });

  it('活树复检不杀（株型/地基合法 → 仅重锚,零杀零掉）', () => {
    const st = mkStore();
    st.setTileSilent(20, 31, S(2), 0, 0);          // 草基（合法地基 → 归一 2）
    st.setTileSilent(20, 30, S(5), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });
    const ok = (evo as unknown as EvoPriv).killDependentAt(20, 30);
    expect(ok).toBe(false);
    expect(tid(st, 20, 30)).toBe(S(5));            // 存活
    expect(drops).toEqual([]);
  });

  it('棕榈 323：杀沙基 → 坍塌 + 掉棕榈木 2504;重锚骰杀后照掷（frameX=-1≤44）', () => {
    const st = mkStore();
    st.setTileSilent(20, 31, S(53), 0, 0);         // 沙
    st.setTileSilent(20, 30, S(323), 0, 0);        // 棕榈（单格整树）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    const rolls = captureRolls(evo, () => (evo as unknown as EvoPriv).kill(20, 31));
    expect(tid(st, 20, 30)).toBe(0);               // ★棕榈失基坍塌
    expect(drops.map((d) => d.vid)).toEqual([2504]);
    expect(rolls.length).toBe(1);                  // genRand.Next(7,10) 重锚骰（cs:54851）
  });

  it('棕榈 323 掉木随基座沙族换色（234 猩红沙 → 911）', () => {
    const st = mkStore();
    st.setTileSilent(20, 31, S(234), 0, 0);
    st.setTileSilent(20, 30, S(323), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    (evo as unknown as EvoPriv).kill(20, 30);
    expect(drops.map((d) => d.vid)).toEqual([911]);   // cs:65763-65771 基座扫描
  });

  it('蘑菇树 72：杀底 → 单列坍塌（下格 ∉{72,70} → 杀,cs:87116-87117）', () => {
    const st = mkStore();
    st.setTileSilent(20, 31, S(70), 0, 0);         // 蘑菇草
    st.setTileSilent(20, 30, S(72), 0, 0);
    st.setTileSilent(20, 29, S(72), 0, 0);
    st.setTileSilent(20, 28, S(72), 18, 18);       // 冠段帧
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0);   // case 71/72：Next(40)==0 → 194 恒掉
    (evo as unknown as EvoPriv).kill(20, 31);
    expect(tid(st, 20, 30)).toBe(0);
    expect(tid(st, 20, 29)).toBe(0);
    expect(tid(st, 20, 28)).toBe(0);               // ★整列倒
    expect(drops.length).toBe(3);                  // 逐格掉 194（发光蘑菇）
    expect(drops.every((d) => d.vid === 194)).toBe(true);
  });
});

describe('② 掉落面扩展（KillTile_GetItemDrops 可达型）', () => {
  it('仙人掌 80 → 276（cs:65232）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(80), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([276]);
    expect(drops[0].stack).toBe(1);
  });

  it('仙人掌水淹位次可达（SlowlyDiesInWater cs:72761 区 → kill → 276）', () => {
    const st = mkStore();
    st.setTileSilent(10, 30, S(80), 0, 0);
    st.liquid[st.idx(10, 30)] = 255;
    st.liquidType[st.idx(10, 30)] = 1;
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    (evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(10, 30, 3);
    expect(tid(st, 10, 30)).toBe(0);               // ★水淹杀
    expect(drops.map((d) => d.vid)).toEqual([276]);
  });

  it('宝石树 583 掷种：1/10 宝石（180）+ 冠帧 1/2 树种（4851）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(1), 0, 0);          // 石基
    st.setTileSilent(10, 10, S(583), 22, 198);     // 冠标记帧
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0);   // Next(10)==0 → 宝石;Next(2)==0 → 树种
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([180, 4851]);   // 主件先/次件后（:64476-64479）
    expect(drops.every((d) => d.stack === 1)).toBe(true);
  });

  it('宝石树 9/10 档 → 泥土 3 ×Next(1,3)（stack 骰在冠帧骰后）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(1), 0, 0);
    st.setTileSilent(10, 10, S(583), 0, 0);        // 非冠帧 → 只 2 骰（宝石骰+堆叠骰）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.length).toBe(1);
    expect(drops[0].vid).toBe(3);
    expect(drops[0].stack).toBe(2);                // Next(1,3) = 1+⌊0.99×2⌋
  });

  it('蘑菇族 71/72：1/40 → 194 else 1/2 → 183（cs:66163-66172,全局流）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(72), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([194]);
    vi.restoreAllMocks();
    const drops2: DropRec[] = [];
    const st2 = mkStore();
    st2.setTileSilent(10, 10, S(71), 0, 0);
    const evo2 = mkEvo(st2, 7, drops2, {});
    vi.spyOn(Math, 'random').mockReturnValue(0.9);   // Next(40)!=0 → Next(2)!=0 → 无掉
    (evo2 as unknown as EvoPriv).kill(10, 10);
    expect(drops2).toEqual([]);
  });

  it('药草 83：草 313+style 恒掉;收获门过 → 附种子 307+style ×Next(1,4)', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(83), 0, 0);         // style0
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { alchemyHarvestable: () => true });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([313, 307]);
    expect(drops[1].stack).toBe(1 + Math.floor(0.5 * 3));   // Next(1,4)=2
  });

  it('药草 84 恒收获（IsHarvestableHerbWithSeed type84=true）+ 82 芽 no-drop（cs:66291）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(84), 5 * 18, 0);    // style5
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([313 + 5, 307 + 5]);
    vi.restoreAllMocks();
    const drops2: DropRec[] = [];
    const st2 = mkStore();
    st2.setTileSilent(10, 10, S(82), 0, 0);
    const evo2 = mkEvo(st2, 7, drops2, {});
    const rolls2 = captureRolls(evo2, () => (evo2 as unknown as EvoPriv).kill(10, 10));
    expect(drops2).toEqual([]);                    // 82 ∈ no-drop 组
    expect(rolls2).toEqual([]);                    // 零蔓延骰
  });

  it('草族蘑菇株帧：3@144→5 / 24@144→60 / 201@270→2887 / 110@144→5;73 种子臂', () => {
    const mk = (sheet: number, fx: number): { st: TileStore; evo: WorldEvolution; drops: DropRec[] } => {
      const st = mkStore();
      st.setTileSilent(10, 10, S(sheet), fx, 0);
      const drops: DropRec[] = [];
      return { st, evo: mkEvo(st, 7, drops, { hasItem: () => true }), drops };
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const a = mk(3, 144);
    (a.evo as unknown as EvoPriv).kill(10, 10);
    expect(a.drops.map((d) => d.vid)).toEqual([5]);
    const b = mk(24, 144);
    (b.evo as unknown as EvoPriv).kill(10, 10);
    expect(b.drops.map((d) => d.vid)).toEqual([60]);
    const c = mk(201, 270);
    (c.evo as unknown as EvoPriv).kill(10, 10);
    expect(c.drops.map((d) => d.vid)).toEqual([2887]);
    const d = mk(110, 144);
    (d.evo as unknown as EvoPriv).kill(10, 10);
    expect(d.drops.map((d2) => d2.vid)).toEqual([5]);
    const e = mk(73, 0);
    (e.evo as unknown as EvoPriv).kill(10, 10);
    expect(e.drops.map((d2) => d2.vid)).toEqual([283]);   // ShouldDropSeeds（有吹管 281）
  });

  it('ShouldDropSeeds（cs:66688）：1/2 骰先掷;无 281 探 986;皆无 → 不掉', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(3), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { hasItem: (vid) => vid === 986 });
    vi.spyOn(Math, 'random').mockReturnValue(0);   // 骰中;无 281 → HasItem(986)=true
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([283]);
    vi.restoreAllMocks();
    const drops2: DropRec[] = [];
    const st2 = mkStore();
    st2.setTileSilent(10, 10, S(3), 0, 0);
    const evo2 = mkEvo(st2, 7, drops2, { hasItem: () => false });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    (evo2 as unknown as EvoPriv).kill(10, 10);
    expect(drops2).toEqual([]);                    // 骰中但无吹管/吹枪
  });

  it('藤 52/62/382 cordage 门 → 2996;528 蘑菇藤 genRand 骰 → 183（蔓延流）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(62), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { cordage: true });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([2996]);
    vi.restoreAllMocks();
    const drops2: DropRec[] = [];
    const st2 = mkStore();
    st2.setTileSilent(10, 10, S(528), 0, 0);
    const evo2 = mkEvo(st2, 7, drops2, {});
    const rolls = captureRolls(evo2, () => (evo2 as unknown as EvoPriv).kill(10, 10));
    expect(rolls.length).toBe(1);                  // genRand.Next(2) 占蔓延流位（cs:65522）
    const d0 = rolls[0] * 4.656612875245797e-10;
    if (d0 < 0.5) expect(drops2.map((d) => d.vid)).toEqual([183]);
    else expect(drops2).toEqual([]);
  });

  it('637 灰烬株 1/100 → 5214（cs:65490）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(637), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    (evo as unknown as EvoPriv).kill(10, 10);
    expect(drops.map((d) => d.vid)).toEqual([5214]);
  });
});

describe('② noItem 位次（覆写/清整零掉落）', () => {
  it('sanitizePlants（读档清整）杀草零掉落零骰（isGeneratingOrLoadingWorld → noItem）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(0), 0, 0);          // 泥土地基（草 3 失配 → PlantCheck 杀）
    st.setTileSilent(10, 9, S(3), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { hasItem: () => true });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rolls = captureRolls(evo, () => evo.sanitizePlants());
    expect(tid(st, 10, 9)).toBe(0);                // 清整照杀
    expect(drops).toEqual([]);                     // ★零掉落
    expect(rolls).toEqual([]);                     // ★零骰
  });

  it('placeJunglePlant 覆写位次（cs:48242 noItem）杀被覆写株零掉落', () => {
    const st = mkStore();
    // 锚面：3×2 区 (X2-1..X2+1, Y2-1..Y2) = (20..22, 29..30),底承 (20..22, 31) 丛林草
    for (let x = 20; x <= 22; x++) {
      st.setTileSilent(x, 31, S(60), 0, 0);
      st.setTileSilent(x, 30, S(61), 0, 0);        // 被覆写株（61 ∈ 允许族）
      st.setTileSilent(x, 29, 0, 0, 0);
    }
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, {});
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ok = (evo as unknown as EvoPriv).placeJunglePlant(21, 30, 233, 0, 0);
    expect(ok).toBe(true);
    expect(tid(st, 21, 30)).toBe(S(233));          // 覆写落位
    expect(drops).toEqual([]);                     // ★noItem 零掉落（61 本会掉 331 族）
  });
});
