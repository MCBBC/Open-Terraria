// ★W2/NB-F（2026-09-03）：依存物拆除级联（锚定物被移除 → 依存物连锁拆除）。
//
// 原版链（Terarria1457 实证）：KillTile 尾 SquareTileFrame(i,j)（cs:64432）与
// Convert_ActuallyConvertTile 尾 SquareTileFrame(x,y)（cs:56800）→ 3×3 TileFrame
// → TileFrameImportant/Check 族派发——
//   · 长苔藓 184（case 184 :86428，锚表 GetTileMossColor :82492）；
//   · 睡莲 518（case 518 → CheckLilyPad :59694；采样品维护支 :72734-72748）；
//   · 植物 PlantCheck（:81818）/ 药草 CheckAlch（:46371）/ 垂藤 CheckVines（:86137）。
// NB-F x86 3000tick 窗口：184 塌落 ×24 / 518 拆除 ×5，本域此前零级联。
// 本文件钉六面：184 多锚存续/失锚塌落、518 采样三态+水面跟随+级联面、
// 植物/药草/垂藤的改型与拆除、级联零掷骰（=原版 SquareTileFrame 零 roll）。
import { describe, it, expect } from 'vitest';
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
/** 测试口：私有 kill（=原版 KillTile+SquareTileFrame 级联面） */
type EvoPriv = { kill(x: number, y: number): void; killDependentAt(x: number, y: number): boolean };

function mkWorld(): { st: TileStore; evo: WorldEvolution } {
  const st = new TileStore(64, 64);
  const host: EvolutionHost = {
    store: st, seed: 9, worldSurface: 20, rockLevel: 40, dungeonX: 0, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
  };
  return { st, evo: new WorldEvolution(host) };
}

/** 蔓延流观察钩（core/rng.ts __swOnRoll，观测不消费）——级联零掷骰断言用 */
function rollsOf(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

describe('W2 长苔藓 184 塌落（TileFrameImportant case 184 / GetTileMossColor）', () => {
  it('苔块被邪恶蔓延转邪石 → 下方垂苔塌落（NB-F ×24 根因面）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(30, 30, S(182));                 // 苔藓块（锚）
    st.setTileSilent(30, 31, S(184), 22 * 3, 0);      // 长苔藓（垂苔，frameX=苔色3）
    st.setTileSilent(40, 30, S(182));                 // 对照组：另一苔块
    st.setTileSilent(40, 31, S(184), 22 * 3, 0);
    expect(tid(st, 30, 31)).toBe(S(184));
    evo.convert(30, 30, 1);                           // 腐化：tileMoss → 25 邪石
    expect(tid(st, 30, 30)).toBe(S(25));              // 锚已转邪石
    expect(tid(st, 30, 31)).toBe(0);                  // ★垂苔塌落
    expect(tid(st, 40, 31)).toBe(S(184));             // 未动锚的垂苔保留
  });

  it('双锚失一重挂存续、双锚全失才塌（cs:86428 四向锚扫描）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(30, 30, S(182));                 // 上锚
    st.setTileSilent(29, 31, S(180));                 // 左锚
    st.setTileSilent(30, 31, S(184), 22 * 3, 54);
    evo.convert(30, 30, 1);                           // 失上锚（→邪石）
    expect(tid(st, 30, 31)).toBe(S(184));             // 左锚仍在 → 存续
    evo.convert(29, 31, 2);                           // 失左锚（神圣：→珍珠岩 117）
    expect(tid(st, 30, 31)).toBe(0);                  // ★全锚失 → 塌落
  });
});

describe('W2 睡莲 518（采样维护支 :72734-72748 + CheckLilyPad :59694）', () => {
  it('干涸（liquid==0）→ 拆除（NB-F ×5 根因面）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 10, S(518), 0, 0);           // 睡莲（无水）
    (evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(20, 10, 3);
    expect(tid(st, 20, 10)).toBe(0);                  // ★干涸拆除
  });

  it('岩浆浸润（liquidType!=0）→ CheckLilyPad 杀', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 10, S(518), 0, 0);
    st.liquid[st.idx(20, 10)] = 255;
    st.liquidType[st.idx(20, 10)] = 2;                // 岩浆（本仓 +1 编码）
    (evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(20, 10, 3);
    expect(tid(st, 20, 10)).toBe(0);
  });

  it('水位上涨 → 上浮一行（cs:59741-59757 裸写移动）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 12, S(2));                   // 塘底（草 → frameY 锚 0）
    for (let dy = 9; dy <= 11; dy++) {
      st.liquid[st.idx(20, dy)] = 255;
      st.liquidType[st.idx(20, dy)] = 1;
    }
    st.setTileSilent(20, 11, S(518), 0, 0);           // 睡莲浮在 y=11，上格 y=10 有水
    (evo as unknown as { overgroundTile(i: number, j: number, w: number): void }).overgroundTile(20, 11, 3);
    expect(tid(st, 20, 10)).toBe(S(518));             // ★上浮
    expect(tid(st, 20, 11)).toBe(0);
  });

  it('级联面：邻格变更派发 CheckLilyPad（岩浆塘垫被连坐拆除）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 12, S(2));                   // 塘底
    st.liquid[st.idx(20, 11)] = 255;
    st.liquidType[st.idx(20, 11)] = 2;                // 岩浆位（垫浮其上）
    st.setTileSilent(20, 11, S(518), 0, 0);
    st.setTileSilent(21, 11, S(2));                   // 邻格实体
    expect(tid(st, 20, 11)).toBe(S(518));
    (evo as unknown as EvoPriv).kill(21, 11);                                 // 邻格变更 → 3×3 级联 → 垫复检
    expect(tid(st, 20, 11)).toBe(0);                  // ★岩浆塘垫被级联拆除
  });
});

describe('W2 植物/药草/垂藤（PlantCheck :81818 / CheckAlch :46371 / CheckVines :86137）', () => {
  it('腐化过境：草 2→23，上方森林短草 3 改型腐化短草 24（原版不杀）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(2));
    st.setTileSilent(20, 19, S(3));
    evo.convert(20, 20, 1);
    expect(tid(st, 20, 20)).toBe(S(23));
    expect(tid(st, 20, 19)).toBe(S(24));              // ★TryGetNewType 换型
  });

  it('锚被拆：草被杀 → 上方植物连锁拆除', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(2));
    st.setTileSilent(20, 19, S(3));
    (evo as unknown as EvoPriv).kill(20, 20);
    expect(tid(st, 20, 19)).toBe(0);                  // ★依存拆除
  });

  it('药草锚失配：草 2→23 后 style0 药草 82 被杀（CheckAlch 地基表）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(2));
    st.setTileSilent(20, 19, S(82), 0, 0);            // style0（frameX=0：草/圣草系）
    evo.convert(20, 20, 1);
    expect(tid(st, 20, 20)).toBe(S(23));
    expect(tid(st, 20, 19)).toBe(0);                  // ★药草连坐（style0 表无 23）
  });

  it('style5 火冠花岩浆豁免（cs:46451-46468 case5 无岩浆杀支）', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(57));                  // 灰烬（style5 地基）
    st.setTileSilent(20, 19, S(82), 5 * 18, 0);       // style5 药草
    st.liquid[st.idx(20, 19)] = 255;
    st.liquidType[st.idx(20, 19)] = 2;                // 浸岩浆
    (evo as unknown as { killDependentAt(x: number, y: number): boolean }).killDependentAt(20, 19);
    expect(tid(st, 20, 19)).toBe(S(82));              // ★case5 不因岩浆杀
  });

  it('藤随草变：丛林草 60→70（蘑菇化）→ 下方丛林藤 62 改型蘑菇藤 528', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(60));
    st.setTileSilent(20, 21, S(62));
    evo.convert(20, 20, 3);
    expect(tid(st, 20, 20)).toBe(S(70));
    expect(tid(st, 20, 21)).toBe(S(528));             // ★CheckVines 改型面
  });

  it('藤柱连锁：锚草被杀 → 下方整段垂藤逐节消失', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(20, 20, S(60));
    st.setTileSilent(20, 21, S(62));
    st.setTileSilent(20, 22, S(62));
    st.setTileSilent(20, 23, S(62));
    (evo as unknown as EvoPriv).kill(20, 20);
    expect(tid(st, 20, 21)).toBe(0);                  // ★逐节级联
    expect(tid(st, 20, 22)).toBe(0);
    expect(tid(st, 20, 23)).toBe(0);
  });
});

describe('W2 级联零掷骰（原版 SquareTileFrame 派发面零 roll）', () => {
  it('kill/convert 触发的级联不消费蔓延流', () => {
    const { st, evo } = mkWorld();
    st.setTileSilent(30, 30, S(182));
    st.setTileSilent(30, 31, S(184), 22 * 3, 0);
    st.setTileSilent(20, 20, S(2));
    st.setTileSilent(20, 21, S(62));
    const r1 = rollsOf(evo, () => (evo as unknown as EvoPriv).kill(20, 20));
    const r2 = rollsOf(evo, () => evo.convert(30, 30, 1));
    expect(r1).toEqual([]);                           // ★级联零掷
    expect(r2).toEqual([]);                           // （convert 自身掷骰面仅墙支/火把——本例无墙无火把）
    expect(tid(st, 20, 21)).toBe(0);
    expect(tid(st, 30, 31)).toBe(0);
  });
});
