// BJ228 GetAlpha 全表普查+邪恶三叉戟/彩虹魔杖实报清偿（2026-09-21）：
//  ① 普查结构锁：1457 GetAlpha（Projectile.cs:80595-81521,1458 同文逐字节）276 个
//     「首中即返」胜出 id 中,除 7 项豁免外必须全部被本仓承载（drawGlobalAlpha
//     返非 null ∨ PROJ_ALPHA_MOD 有登记项）——豁免 7 项零差/休眠定谳注释钉死。
//  ② 114 邪恶三叉戟行为锁：GetAlpha :81445-81458 专属支（localAI[1] 梯 <5 透明/
//     5..15 灰梯/≥15 (255,255,255,α)）×绘制段 Main.cs:33187-33189 ×(1−Opacity)=α/255
//     ×AI α=Remap(速度,2,0,1,0)×255（:26794）——高速=实体(旧 R7-6 曲线反向,翻案)、
//     减速线性淡出。
//  ③ 79 彩虹魔杖本体白团锁：Main.cs:33231-33236 覆写 color87=(255,255,255,0)
//     纯加算白,scale=GetLerpValue(32,0,dist(pos,oldPos[12]))——静止满亮/快速收缩。
//  ④ 推广批锁：20 绿激光/76-78 琴音弹（A=0 加算白常量支）GA return 1；
//     荧光棒族 50/53/515/870 'lighter'+1089 disco 档（GlowstickProj.draw）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Arrow, setProjSpriteOverride, PROJ_ALPHA0 } from '../src/entities/Arrow';
import { PROJ_ALPHA_MOD } from '../src/data/vanillaProjAlpha';
import { MagicMissileProj } from '../src/entities/MissileProj';
import { GlowstickProj } from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

// ---------------------------------------------------------------------------
// 1457 GetAlpha 「首中即返」胜出 id 全表（BJ228 解析器产出,276 项；解析脚本
// = 会话物证 /tmp/bj228/getalpha-1457.cs 分支树;1458 :80596-81522 同文）。
// 语义速查见 docs/recipe-audit-1457.md:88 与 vanillaProjAlpha.ts 表头。
// ---------------------------------------------------------------------------
const WINNERS_1457: readonly number[] = [
  5, 9, 12, 15, 16, 18, 19, 20, 34, 35, 44, 45, 47, 50,
  53, 72, 75, 76, 77, 78, 79, 83, 86, 87, 88, 89, 90, 91,
  92, 93, 94, 95, 96, 100, 102, 104, 114, 115, 116, 130, 131, 132,
  150, 151, 152, 156, 157, 173, 180, 182, 211, 221, 226, 227, 229, 242,
  250, 251, 253, 254, 257, 258, 259, 263, 265, 270, 274, 279, 283, 284,
  285, 286, 287, 300, 301, 304, 308, 321, 324, 325, 326, 327, 328, 329,
  332, 337, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 355,
  400, 401, 402, 409, 424, 425, 426, 431, 432, 435, 436, 437, 438, 443,
  444, 445, 446, 447, 450, 451, 452, 454, 459, 462, 464, 465, 467, 473,
  477, 478, 479, 485, 488, 490, 491, 492, 493, 494, 498, 502, 503, 515,
  518, 536, 538, 540, 546, 553, 554, 567, 568, 573, 575, 578, 579, 585,
  586, 591, 592, 595, 596, 601, 602, 603, 604, 607, 611, 612, 617, 623,
  625, 626, 627, 628, 631, 633, 634, 635, 636, 638, 640, 641, 643, 644,
  645, 646, 647, 648, 649, 658, 659, 660, 664, 666, 668, 671, 673, 675,
  676, 682, 684, 686, 691, 692, 693, 694, 695, 696, 700, 706, 707, 709,
  710, 711, 712, 714, 723, 724, 725, 726, 728, 729, 731, 732, 735, 755,
  756, 764, 813, 833, 834, 835, 837, 856, 857, 864, 870, 872, 873, 876,
  893, 895, 907, 912, 913, 920, 921, 926, 931, 948, 953, 955, 961, 964,
  965, 967, 969, 977, 978, 981, 1006, 1021, 1024, 1039, 1041, 1045, 1047, 1055,
  1089, 1090, 1097, 1099, 1110, 1114, 1130, 1133, 1134, 1135,
];
/** 普查豁免 7 项（无承载=定谳零差/休眠,加注释钉死防未来盲目"补齐"）：
 *  · 19 Flamarang/35 Sunfury：胜出支 :81465-81468 Color.White——本仓 α≡0（SetDefaults
 *    无 alpha 行）+ 光色恒白 → 缺省路径 (255−0)/255×白 ≡ White,零观感差（白光约定）。
 *  · 424-426 异星探针三型：胜出支 :81160-81177 max(newColor,150)——本仓光色恒白
 *    255>150 → 恒等,零差;出生面在（异星法杖 2750）,若未来接逐格光色须先补本支。
 *  · 1130/1135（1457 新头支 :80597-80603 localAI[0]/19 渐变 Lerp）：本仓无出生面
 *    （TheEyeOfCthulhuDash/KrakenWave 弹,query vanilla-itemcombat 零 shoot 引用）
 *    =dormant,接入时须连 AI localAI[0] 梯一并建模。 */
const CENSUS_EXEMPT: readonly number[] = [19, 35, 424, 425, 426, 1130, 1135];

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function makeGame(w: World): GameHooks {
  return {
    world: w,
    player: { dead: true, iframes: 0, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 10, h: 20 },
    enemies: () => [], critters: () => [],
    entities: { nextId: 1, add: (_e: unknown) => {}, projectiles: [] as unknown[] },
    playSfx: () => {}, playSfxFiles: () => {}, playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
  } as unknown as GameHooks;
}

function ga(a: Arrow): number | null {
  return (a as unknown as { drawGlobalAlpha(): number | null }).drawGlobalAlpha();
}

// ctx 记录器（仿 sw-bj56-terraprisma 惯例）
interface DrawRec { op: string; alpha: number; imgs: number; filter: string }
function mkCtx() {
  const recs: DrawRec[] = [];
  let cur: DrawRec | null = null;
  const base = {
    canvas: { width: 800, height: 600 },
    save() { recs.push(cur = { op: 'source-over', alpha: 1, imgs: 0, filter: 'none' }); },
    restore() { cur = null; },
    clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, fill() {}, arc() {}, closePath() {}, ellipse() {}, setLineDash() {},
    translate() {}, rotate() {}, scale() {}, drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  const ctx = new Proxy(base, {
    get(t, k: string) {
      if (k === 'save' || k === 'restore') return t[k as 'save' | 'restore'];
      if (k === 'drawImage') {
        return (..._a: unknown[]) => { if (cur) cur.imgs++; };
      }
      if (k === 'globalCompositeOperation' || k === 'globalAlpha' || k === 'filter') {
        const key = k === 'globalCompositeOperation' ? 'op' : k === 'globalAlpha' ? 'alpha' : k;
        return cur ? (cur as unknown as Record<string, string | number>)[key] : undefined;
      }
      return (t as unknown as Record<string, unknown>)[k];
    },
    set(t, k: string, v) {
      if (k === 'globalCompositeOperation' || k === 'globalAlpha' || k === 'filter') {
        if (cur) {
          const key = k === 'globalCompositeOperation' ? 'op' : k === 'globalAlpha' ? 'alpha' : k;
          (cur as unknown as Record<string, string | number>)[key] = v as string | number;
        }
        return true;
      }
      (t as unknown as Record<string, unknown>)[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, recs };
}

describe('BJ228 ①普查结构锁:1457 GetAlpha 胜出 id 全承载', () => {
  it('PROJ_ALPHA_MOD 表 300 项唯一（docs/recipe-audit-1457.md:88 权威数）', () => {
    const keys = Object.keys(PROJ_ALPHA_MOD);
    expect(keys.length).toBe(300);
    expect(new Set(keys).size).toBe(300);
  });

  it('胜出 id 全承载：GA 案位返非 null ∨ MOD 有登记；豁免 7 项外零缺口', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const holes: number[] = [];
    for (const id of WINNERS_1457) {
      if (CENSUS_EXEMPT.includes(id)) continue;
      if (PROJ_ALPHA_MOD[id]) continue;                       // 登记面承载（含 off/专属类消费）
      const a = new Arrow(80 * TILE, 100 * TILE, 1, 0, 10, 1, id, {});
      a.fixedUpdate(1 / 60, game);
      if (ga(a) === null) holes.push(id);                     // GA 案位承载
    }
    expect(holes).toEqual([]);
  });

  it('BJ228 新接线在案：20/76/77/78 GA=1（A=0 加算白常量支）', () => {
    const w = emptyWorld();
    for (const id of [20, 76, 77, 78]) {
      const a = new Arrow(80 * TILE, 100 * TILE, 1, 0, 10, 1, id, {});
      expect(ga(a)).toBe(1);
    }
  });
});

describe('BJ228 ②邪恶三叉戟 114:专属支曲线翻案（高速实体/减速淡出/出生梯）', () => {
  it('高速段（速度≥2,α=255）:出生梯 <5 隐→5..15 灰梯→≥15 满亮实体 ga=1', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 3, 0, 40, 1, 114, {});
    a.fixedUpdate(1 / 60, game);                              // EU=2 → 3 子步,ramp=3
    expect(ga(a)).toBe(0);                                    // localAI[1]<5 → Transparent
    a.fixedUpdate(1 / 60, game);                              // ramp=6 → (6−5)/10=0.1
    expect(ga(a)).toBeCloseTo(0.1, 5);
    for (let t = 0; t < 5; t++) a.fixedUpdate(1 / 60, game);  // ramp 钳 15
    expect(ga(a)).toBe(1);                                    // ★翻案核心:高速=不透明实体（旧实现=0 隐形）
    expect(a.alpha).toBe(255);                                // Remap(3,2,0,1,0)=1 → α=255（:26794）
  });

  it('减速段（速度 1）:α=128 → ga=128/255 线性淡出（×(1−Opacity) 绘制段乘区折入）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const a = new Arrow(80 * TILE, 100 * TILE, 3, 0, 40, 1, 114, {});
    for (let t = 0; t < 6; t++) a.fixedUpdate(1 / 60, game);  // ramp 满
    a.vx = 1; a.vy = 0;
    a.fixedUpdate(1 / 60, game);
    expect(a.alpha).toBe(128);                                // Remap(1,2,0,1,0)=0.5
    expect(ga(a)).toBeCloseTo(128 / 255, 3);
  });

  it('PROJ_ALPHA0[114]=255 起步与 AI Remap 终值共存（SetDefaults :2031）', () => {
    expect(PROJ_ALPHA0[114]).toBe(255);
  });
});

describe('BJ228 ③彩虹魔杖 79:本体加算白团（Main.cs:33231-33236）', () => {
  beforeEach(() => {
    setProjSpriteOverride(79, { width: 32, height: 32 } as unknown as HTMLImageElement);
  });
  afterEach(() => {
    setProjSpriteOverride(79, { width: 0, height: 0 } as unknown as HTMLImageElement);
  });

  function mk79(game: GameHooks): MagicMissileProj {
    // 悬停操控态（channel 持按+光标钉弹位）——原版白团可见面=悬停/慢速段
    const m = new MagicMissileProj(80 * TILE, 100 * TILE, 0.01, 0, {
      projId: 79, damage: 50, knockback: 4, useTime: 20,
      channelCb: () => true,
      aimCb: () => ({ x: (m as unknown as { cx: number }).cx, y: (m as unknown as { cy: number }).cy }),
      payMana: () => true,
    }) as MagicMissileProj;
    for (let t = 0; t < 14; t++) m.fixedUpdate(1 / 60, game); // strip ≥13 记录
    return m;
  }

  it('静止（dist(strip[12])≈0）:本体满亮 drawImage @lighter,scale=1', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = mk79(game);
    const { ctx, recs } = mkCtx();
    m.draw({ ctx } as never);
    const bodyPass = recs.find((r) => r.op === 'lighter' && r.imgs >= 1);
    expect(bodyPass).toBeDefined();                           // 本体白团入画（旧实现整弹不画）
  });

  it('快速飞行（dist≥32px）:scale=0 → 本体不出 drawImage（拖尾接管）', () => {
    const w = emptyWorld();
    const game = makeGame(w);
    const m = new MagicMissileProj(80 * TILE, 100 * TILE, 20, 0, {
      projId: 79, damage: 50, knockback: 4, useTime: 20,
      channelCb: () => false,                                 // 松手巡航（AI 8px/t 级速度）
      aimCb: () => ({ x: 90 * TILE, y: 100 * TILE }),
      payMana: () => true,
    }) as MagicMissileProj;
    for (let t = 0; t < 14; t++) m.fixedUpdate(1 / 60, game); // 12 tick 记录距 ≥32px
    const { ctx, recs } = mkCtx();
    m.draw({ ctx } as never);
    const lighterImgs = recs.filter((r) => r.op === 'lighter').reduce((n, r) => n + r.imgs, 0);
    expect(lighterImgs).toBe(0);                              // 白团收缩为零
  });
});

describe('BJ228 ④荧光棒族加算接线（GlowstickProj.draw,GetAlpha :81020-81022）', () => {
  beforeEach(() => {
    for (const id of [50, 53, 515, 870, 1089, 473]) {
      setProjSpriteOverride(id, { width: 22, height: 6 } as unknown as HTMLImageElement);
    }
  });

  function drawGlowstick(id: number) {
    const g = new GlowstickProj(80 * TILE, 100 * TILE, 1, 0, id);
    const { ctx, recs } = mkCtx();
    g.draw({ ctx } as never, {} as never);
    return recs;
  }

  it('50/53/515/870 本体画入 lighter（A=0 纯加算白;原版荧光棒=发光体）', () => {
    for (const id of [50, 53, 515, 870]) {
      const recs = drawGlowstick(id);
      expect(recs.some((r) => r.op === 'lighter' && r.imgs >= 1)).toBe(true);
    }
  });

  it('1089 彩虹荧光棒（无钟回退档）:lighter + ga=70/255（hue-rotate 旧近似退役）', () => {
    const recs = drawGlowstick(1089);
    const pass = recs.find((r) => r.imgs >= 1);
    expect(pass).toBeDefined();
    expect(pass!.alpha).toBeCloseTo(70 / 255, 3);
    // 无 lighting.clock（node 直测）回退=BJ228 旧 'lighter' 合成档（登记等价面）
    expect(pass!.op).toBe('lighter');
  });

  it('1089 基色相位 1:1（★BJ236）:discoColor 直读 → 乘面 source-over×70/255', () => {
    const seen: Array<readonly [number, number, number]> = [];
    GlowstickProj.discoTintOverride = (img, rgb) => { seen.push(rgb); return img; };
    try {
      const g = new GlowstickProj(80 * TILE, 100 * TILE, 1, 0, 1089);
      const fakeClock = { discoColor: (): [number, number, number] => [1, 0.5, 0] };
      const { ctx, recs } = mkCtx();
      g.draw({ ctx, lighting: { clock: fakeClock } } as never, {} as never);
      const pass = recs.find((r) => r.imgs >= 1);
      expect(pass).toBeDefined();
      expect(pass!.op).toBe('source-over');       // AlphaBlend 直译（1089=A70 非 A0 族）
      expect(pass!.alpha).toBeCloseTo(70 / 255, 3);
      expect(seen[0]).toEqual([1, 0.5, 0]);       // 基色=FlickerClock.discoColor() 直读
    } finally {
      GlowstickProj.discoTintOverride = null;
    }
  });

  it('473 探矿荧光棒维持常规合成（GetAlpha :81168 White ≡ 缺省白光,零差）', () => {
    const recs = drawGlowstick(473);
    expect(recs.some((r) => r.op === 'lighter' && r.imgs >= 1)).toBe(false);
  });
});
