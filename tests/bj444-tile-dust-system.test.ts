// ★BJ444（2026-10-03）：KillTile 统一尘系统回归——用户实报「打碎杂草/藤蔓、砍树、
// 挖掘方块均无粒子效果」的判别面。
//
// 原版锚（Terarria1457/Terraria/WorldGen.cs）：
//   · KillTile_GetTileDustAmount(bool fail, Tile) :67119-67208 —— 分型数量表
//     （缺省 fail=false 打碎 10 / fail=true 敲击 3;654/630/631=0、231=6|3、481-483=3、
//     541=1、549=2、零尘族、苔石族 5|3、184 长苔帧档）。
//   · KillTile_MakeTileDust(int i, int j, Tile) :67209-69696 —— per-type 尘 id/形态
//     （顺序洗衣单,后面的赋值覆盖前面的）。
//   · 主触发面 :64212-64216（PlaySounds :64064 后、Drops :64375 前）—— fail 两态都出尘;
//     noItem 只门掉落段（:64373）不门尘。
//   · 演化域等价挂接：WorldEvolution.kill/killFlat（killTileCascadeAt 砍树入口例外=
//     被砍格尘由 Game.breakTileBody 头出,级联干格 killFlat 各自出）。
// 掷签流：genRand ≡ Main.rand（WorldGen.cs:4362 别名属性）——测试注入种子 LCG 流。
import { describe, it, expect } from 'vitest';
import { getTileDustAmount, makeTileDust, makeTileDustCtx, TILE_DUST_NONE, type DustSpawn } from '../src/world/TileDust';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';

const S = (sheet: number): number => {
  const id = TILE_INTERNAL_BY_SHEET.get(sheet);
  if (id === undefined) throw new Error(`TILE_INTERNAL_BY_SHEET 缺 sheet ${sheet}`);
  return id;
};

/** 种子 LCG（[0,1) 流,genRand/Main.rand 骰注入） */
function mkRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface DustRec {
  type: number; x: number; y: number; w: number; h: number;
  sx: number; sy: number; alpha: number; color: { r: number; g: number; b: number; a: number } | null; scale: number;
  post: { noGravity: boolean; noLight: boolean; noLightEmittance: boolean; fadeIn: number; scale: number; vx: number; vy: number };
}

/** NewDust 录制器（返回可后置改写句柄=原版 Main.dust[idx] 面） */
function mkSpawnRecorder() {
  const recs: DustRec[] = [];
  const spawn: DustSpawn = (x, y, w, h, type, sx, sy, alpha, color, scale) => {
    const post = { noGravity: false, noLight: false, noLightEmittance: false, fadeIn: 0, scale, vx: sx, vy: sy };
    recs.push({ type, x, y, w, h, sx, sy, alpha, color, scale, post });
    return post;
  };
  return { recs, spawn };
}

function mkStore(w = 40, h = 80): TileStore {
  return new TileStore(w, h);
}

function place(st: TileStore, x: number, y: number, sheet: number, frameX = 0, frameY = 0): void {
  st.setTile(x, y, S(sheet), frameX, frameY);
}

/** 跑 makeTileDust n 次并返回尘 id 序列（TILE_DUST_NONE 不计 id,单列 noDust 计数） */
function runDust(st: TileStore, x: number, y: number, n: number, rand: () => number, src?: { x: number; y: number }) {
  const { recs, spawn } = mkSpawnRecorder();
  const ctx = makeTileDustCtx(st, { rand, disco: () => [200, 100, 50] });
  let noDust = 0;
  for (let k = 0; k < n; k++) {
    if (makeTileDust(st, x, y, ctx, spawn, src) === TILE_DUST_NONE) noDust++;
  }
  return { recs, noDust };
}

describe('BJ444 ① KillTile_GetTileDustAmount 数量表（:67119-67208）', () => {
  it('缺省档：打碎 10 / 敲击 3（表外型含模特 470/宝石 63）', () => {
    expect(getTileDustAmount(false, 0, 0)).toBe(10);
    expect(getTileDustAmount(true, 0, 0)).toBe(3);
    expect(getTileDustAmount(false, 470, 0)).toBe(10);
    expect(getTileDustAmount(true, 470, 0)).toBe(3);
    expect(getTileDustAmount(false, 63, 0)).toBe(10);
    expect(getTileDustAmount(true, 63, 0)).toBe(3);
  });
  it('零尘特例：654 TNT 桶 / 630·631 驱虫剂族', () => {
    expect(getTileDustAmount(false, 654, 0)).toBe(0);
    expect(getTileDustAmount(true, 654, 0)).toBe(0);
    expect(getTileDustAmount(false, 630, 0)).toBe(0);
    expect(getTileDustAmount(true, 631, 0)).toBe(0);
  });
  it('231 幼虫 6|3 / 481-483 裂纹砖 3 两档同 / 541 回声块 1 / 549 海草 2', () => {
    expect(getTileDustAmount(false, 231, 0)).toBe(6);
    expect(getTileDustAmount(true, 231, 0)).toBe(3);
    for (const sh of [481, 482, 483]) {
      expect(getTileDustAmount(false, sh, 0)).toBe(3);
      expect(getTileDustAmount(true, sh, 0)).toBe(3);
    }
    expect(getTileDustAmount(false, 541, 0)).toBe(1);
    expect(getTileDustAmount(true, 541, 0)).toBe(1);
    expect(getTileDustAmount(false, 549, 0)).toBe(2);
    expect(getTileDustAmount(true, 549, 0)).toBe(2);
  });
  it('巨石·合成站·滴淌族零尘（:67148-67185 全表抽样）', () => {
    for (const sh of [125, 138, 172, 287, 300, 304, 308, 354, 355, 373, 374, 375, 376, 461, 484, 499, 564, 565, 593, 594, 617, 664, 665, 699, 709, 711, 716]) {
      expect(getTileDustAmount(false, sh, 0)).toBe(0);
      expect(getTileDustAmount(true, sh, 0)).toBe(0);
    }
  });
  it('苔石族 5|3（:67189-67195）', () => {
    for (const sh of [534, 536, 539, 625, 627]) {
      expect(getTileDustAmount(false, sh, 0)).toBe(5);
      expect(getTileDustAmount(true, sh, 0)).toBe(3);
    }
  });
  it('184 长苔帧档：frameX/22≥5→5 与 fail 无关,否则 10|3', () => {
    expect(getTileDustAmount(false, 184, 5 * 22)).toBe(5);
    expect(getTileDustAmount(true, 184, 5 * 22)).toBe(5);
    expect(getTileDustAmount(false, 184, 4 * 22)).toBe(10);
    expect(getTileDustAmount(true, 184, 4 * 22)).toBe(3);
  });
});

describe('BJ444 ② KillTile_MakeTileDust per-type 尘表抽样（:67209-69696）', () => {
  it('用户实报三场景代表型：杂草 3→尘 3 / 藤蔓 52→尘 3 / 泥土 0→尘 0', () => {
    const rand = mkRng(1);
    const st = mkStore();
    place(st, 10, 10, 3);
    let r = runDust(st, 10, 10, 3, rand);
    expect(r.noDust).toBe(0);
    expect(r.recs.map((d) => d.type)).toEqual([3, 3, 3]);
    expect(r.recs[0].x).toBe(10 * 16);
    expect(r.recs[0].y).toBe(10 * 16);

    place(st, 11, 10, 52);
    r = runDust(st, 11, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([3, 3, 3]);

    place(st, 12, 10, 0);
    r = runDust(st, 12, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([0, 0, 0]);
  });
  it('石 1→尘 1 / 树干 5→尘 7（无基座落缺省）/ 木平台 19 首行→尘 7', () => {
    const rand = mkRng(2);
    const st = mkStore();
    place(st, 10, 10, 1);
    let r = runDust(st, 10, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([1, 1, 1]);

    // 树干 5：基座下扫（:68608-68669）到不了实心格 → num 保持缺省 7
    place(st, 12, 10, 5);
    r = runDust(st, 12, 10, 3, rand);
    expect(r.recs.map((d) => d.type)).toEqual([7, 7, 7]);

    // 树干基座扫描：下方放腐化草 23 → num=77（:68672-68674）;界门 i>5
    place(st, 12, 20, 23);
    r = runDust(st, 12, 10, 1, rand);
    expect(r.recs.map((d) => d.type)).toEqual([77]);

    place(st, 14, 10, 19, 0, 0);   // frameY/18=0 档
    r = runDust(st, 14, 10, 1, rand);
    expect(r.recs.map((d) => d.type)).toEqual([7]);
  });
  it('火把 4：TorchID.Dust 帧档（frameY=0→6;frameY=22→59;frameY=286→234）', () => {
    const rand = mkRng(3);
    const st = mkStore();
    place(st, 10, 10, 4, 0, 0);
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(6);
    place(st, 10, 10, 4, 0, 22);
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(59);
    place(st, 10, 10, 4, 0, 13 * 22);   // TorchID.Dust[13]=234 猩红火把
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(234);
  });
  it('掷签族：草 2→{0,2} / 神圣草 109→{0,47} / 陨石 37→{6,23}（Next(2) 双臂均可达）', () => {
    const st = mkStore();
    const rand = mkRng(7);
    place(st, 10, 10, 2);
    const grass = runDust(st, 10, 10, 40, rand).recs.map((d) => d.type);
    expect(new Set(grass).size).toBe(2);
    expect(new Set(grass)).toEqual(new Set([0, 2]));

    place(st, 11, 10, 109);
    const hal = runDust(st, 11, 10, 40, rand).recs.map((d) => d.type);
    expect(new Set(hal)).toEqual(new Set([0, 47]));

    place(st, 12, 10, 37);
    const met = runDust(st, 12, 10, 40, rand).recs.map((d) => d.type);
    expect(new Set(met)).toEqual(new Set([6, 23]));
  });
  it('祭坛 26：frameX<54 → Next(2)?1:14;frameX≥54 → 5（:69497-69499）', () => {
    const rand = mkRng(11);
    const st = mkStore();
    place(st, 10, 10, 26, 0, 0);
    const a = runDust(st, 10, 10, 40, rand).recs.map((d) => d.type);
    expect(new Set(a)).toEqual(new Set([1, 14]));
    place(st, 12, 10, 26, 54, 0);
    expect(runDust(st, 12, 10, 10, rand).recs.map((d) => d.type)).toEqual(Array(10).fill(5));
  });
  it('宝箱 21 帧档（:68877-68894）：<36→7 / ≥108→37 / ≥1008→-1 不出尘', () => {
    const rand = mkRng(13);
    const st = mkStore();
    place(st, 10, 10, 21, 0, 0);
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(7);
    place(st, 10, 10, 21, 108, 0);
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(37);
    place(st, 10, 10, 21, 1008, 0);
    const r = runDust(st, 10, 10, 3, rand);
    expect(r.noDust).toBe(3);
    expect(r.recs).toHaveLength(0);
  });
  it('门 10 → num=-1（:68138 零尘）;工作台 14 → -1（:68045）', () => {
    const rand = mkRng(17);
    const st = mkStore();
    place(st, 10, 10, 10);
    expect(runDust(st, 10, 10, 3, rand).noDust).toBe(3);
    place(st, 11, 10, 14);
    expect(runDust(st, 11, 10, 3, rand).noDust).toBe(3);
  });
  it('发射段特殊形态：627 彩虹苔 → disco 色+noGravity+noLightEmittance（:69459-69467）', () => {
    const rand = mkRng(19);
    const st = mkStore();
    place(st, 10, 10, 627);
    const r = runDust(st, 10, 10, 2, rand);
    expect(r.recs[0].color).toEqual({ r: 200, g: 100, b: 50, a: 255 });
    expect(r.recs[0].post.noGravity).toBe(true);
    expect(r.recs[0].post.noLightEmittance).toBe(true);
  });
  it('药草族 Main.tileAlch（:69296-69323）：83 frameX/18=4 → 289', () => {
    const rand = mkRng(23);
    const st = mkStore();
    place(st, 10, 10, 83, 4 * 18, 0);
    expect(runDust(st, 10, 10, 1, rand).recs[0].type).toBe(289);
  });
});

describe('BJ444 ③ fail 两档行为差（:64212-64216 主触发面）', () => {
  it('敲击（fail:true）3 粒 vs 打碎（fail:false）10 粒——同格同型', () => {
    const rand = mkRng(29);
    const st = mkStore();
    place(st, 10, 10, 1);   // 石：缺省档
    const hit = runDust(st, 10, 10, getTileDustAmount(true, 1, 0), rand);
    const brk = runDust(st, 10, 10, getTileDustAmount(false, 1, 0), rand);
    expect(hit.recs).toHaveLength(3);
    expect(brk.recs).toHaveLength(10);
    expect(hit.recs.map((d) => d.type)).toEqual(brk.recs.map((d) => d.type).slice(0, 3));
  });
  it('231 幼虫：敲击 3 粒 / 打碎 6 粒;尘型 {26,153} 掷族（:69217-69221）', () => {
    const rand = mkRng(31);
    const st = mkStore();
    place(st, 10, 10, 231);
    const hit = runDust(st, 10, 10, getTileDustAmount(true, 231, 0), rand);
    const brk = runDust(st, 10, 10, getTileDustAmount(false, 231, 0), rand);
    expect(hit.recs).toHaveLength(3);
    expect(brk.recs).toHaveLength(6);
    for (const d of [...hit.recs, ...brk.recs]) expect([26, 153]).toContain(d.type);
  });
});

describe('BJ444 ④ KillTile 打碎触发（integration：演化域 kill 位次）', () => {
  function mkEvo(st: TileStore, dustCalls: Array<{ x: number; y: number }>): WorldEvolution {
    const host: EvolutionHost = {
      store: st,
      seed: 1,
      worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
      flags: {}, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
      spawnKillDust: (x, y) => { dustCalls.push({ x, y }); },
    };
    return new WorldEvolution(host);
  }

  it('kill 位次每格出尘：石格 kill → dust 出口 (x,y) 1 次 × 缺省 10 粒', () => {
    const st = mkStore();
    place(st, 20, 20, 1);
    const calls: Array<{ x: number; y: number }> = [];
    const evo = mkEvo(st, calls);
    // 演化域 kill 为 private——经公共入口 killTileCascadeAt 之外的杀位次不可达;
    // 此处用 (WorldEvolution as any).kill 直呼（同 evolution-kill-drop.test 夹具面）
    (evo as unknown as { kill: (x: number, y: number) => void }).kill(20, 20);
    expect(calls).toEqual([{ x: 20, y: 20 }]);
    // 尘出口收到的格须仍可读出石型与帧（出口实现在读格后发尘——Game.spawnTileDustAt 自门）
    expect(TILE_DEFS[st.type[st.idx(20, 20)]]?.vanilla?.sheet).toBeUndefined();   // 已清格
  });

  it('★挂接判别：killTileCascadeAt（砍树入口）被砍格不出尘（尘由 breakTileBody 头出）', () => {
    const st = mkStore();
    place(st, 20, 20, 1);   // 石格非树——级联零传播,隔离被砍格尘面
    const calls: Array<{ x: number; y: number }> = [];
    const evo = mkEvo(st, calls);
    expect(evo.killTileCascadeAt(20, 20)).toBe(true);
    expect(calls).toEqual([]);   // killCore(emitDust:false)——摘挂/重复挂都会爆红
  });

  it('级联杀 killFlat 每格出尘：藤 52 断锚 → 逐藤尘（:64212 per-tile 原版本相）', () => {
    const st = mkStore();
    // 藤 52 需基座（vineCheckAt 失撑杀）——直接验 killFlat 位次：private 直呼
    place(st, 20, 20, 52);
    const calls: Array<{ x: number; y: number }> = [];
    const evo = mkEvo(st, calls);
    (evo as unknown as { killFlat: (x: number, y: number) => boolean }).killFlat(20, 20);
    expect(calls).toEqual([{ x: 20, y: 20 }]);
  });
});
