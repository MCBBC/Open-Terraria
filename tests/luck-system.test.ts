// 幸运度系统回归（Luck.cs 1:1 + RecalculateLuck 聚合 + 火炬/地精扫描）。
// 探针断言：
//  1. RollLuck 三态命中率（luck=0 基线 / 正运改掷 [N/2,N) / 负运恒不中）
//  2. RollOnlyBadLuck 正运无加成、负运收窄
//  3. LuckState 聚合公式数值（药水+灯笼+地精+火炬+装备叠加）
//  4. scanLuckScene 火炬窗口（冰炬=雪原正确群系 +1；错群系火炬负贡献钳 0；地精在窗）
import { describe, it, expect } from 'vitest';
import {
  rollLuck, rollOnlyBadLuck, rollBadLuckExtreme, rollOnlyBadLuckExtreme,
  LuckState, scanLuckScene, TORCH_STYLE, type LuckScanZones,
} from '../src/stats/Luck';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';

const TRIALS = 200_000;
/** P(rollLuck(luck, N) === 0) 蒙特卡洛（大样本容差 10%） */
function zeroRate(fn: () => number): number {
  let hit = 0;
  for (let i = 0; i < TRIALS; i++) if (fn() === 0) hit++;
  return hit / TRIALS;
}

/** 蒙特卡洛命中率断言：|p̂−p| < k×SE（二项 SE = √(p(1−p)/n)）。
 *  原 toBeCloseTo 定容差与样本量脱钩，统计上必挂：p=0.1/n=1e4 的 ±0.005 仅 1.7σ
 *  （≈10% flaky）、p=0.02/n=2e5 的 ±5e-4 仅 1.6σ（≈11%）；按 SE 定容差（默认 5σ，
 *  两侧 ≈6e-7）既稳定又不放松断言意图。 */
function expectRateClose(rate: number, p: number, n = TRIALS, k = 5): void {
  const se = Math.sqrt((p * (1 - p)) / n);
  expect(Math.abs(rate - p)).toBeLessThan(k * se);
}

describe('Luck.cs 掷骰三态（Luck.cs:5-60）', () => {
  it('RollLuck：luck=0 基线 1/N；luck=1 正运命中率约 +37%；luck=-1 负运约减半', () => {
    const base = zeroRate(() => rollLuck(0, 100));
    expectRateClose(base, 0.01);
    const good = zeroRate(() => rollLuck(1, 100));
    // 正运必触发：Next(Next(50,100))，期望命中率 = ∫₅₀¹⁰⁰ (1/x dx)/50 ≈ ln2/50 ≈ 0.0139
    expect(good).toBeGreaterThan(base * 1.2);
    expect(good).toBeLessThan(0.03);
    const bad = zeroRate(() => rollLuck(-1, 100));
    // 负运：Next(Next(100,200))，期望命中率 ≈ ln2/100 ≈ 0.0069（≈ 基线减半，非恒不中）
    expect(bad).toBeGreaterThan(0.004);
    expect(bad).toBeLessThan(base * 0.85);
  });

  it('RollOnlyBadLuck：正运不受益（同基线）；负运收窄为 [N/2, N)', () => {
    const base = zeroRate(() => rollOnlyBadLuck(0, 100));
    const good = zeroRate(() => rollOnlyBadLuck(1, 100));
    expectRateClose(base, 0.01);
    expect(Math.abs(good - base)).toBeLessThan(0.003);   // 正运与 0 等价
    const bad = zeroRate(() => rollOnlyBadLuck(-1, 100));
    expect(bad).toBeGreaterThan(base * 1.2);             // 负运下血月墓园怪更易刷
  });

  it('Extreme 两函数：正运 ×10 窗口（P0≈1/1000）/ 负运 ÷10 窗口（P0≈0.1）；OnlyBadLuckExtreme 非负运恒 -1', () => {
    // RollBadLuckExtreme 语义是"掷中小值=坏"：luck>0 → Next(N*10)（P0 变小）、luck<0 → Next(N/10)
    expectRateClose(zeroRate(() => rollBadLuckExtreme(1, 100)), 0.001);
    expect(zeroRate(() => rollBadLuckExtreme(-1, 100))).toBeGreaterThan(0.05);
    let negOne = 0;
    for (let i = 0; i < 1000; i++) if (rollOnlyBadLuckExtreme(0.5, 100) === -1) negOne++;
    expect(negOne).toBe(1000);
    let hit = 0;
    for (let i = 0; i < 10_000; i++) if (rollOnlyBadLuckExtreme(-1, 100) === 0) hit++;
    expectRateClose(hit / 10_000, 0.1, 10_000);   // [0, N/10) 上命中 0 ≈ 10%
  });
});

describe('RecalculateLuck 聚合（Player.cs:28672-28697）', () => {
  it('各来源叠加数值：药水 0.3 + 灯笼 0.3 + 地精 0.2 + 火炬 0.2', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.luck).toBe(0);
    p.buffs.apply(BuffType.Luck, 900);                    // 档 3 → +0.3
    expect(p.luck).toBeCloseTo(0.3, 5);
    p.luckState.lanternsUp = true;                        // +0.3
    expect(p.luck).toBeCloseTo(0.6, 5);
    p.luckState.hasGardenGnomeNearby = true;              // +0.2
    p.luckState.torchLuck = 1;                            // +0.2（正确群系火炬满档）
    expect(p.luck).toBeCloseTo(1.0, 5);
  });

  it('装备路径基线：无幸运币/马掌 → 装备加成 0（hasLuck_* Player.cs:12629-12647）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.luckEquipmentBonus).toBe(0);
    expect(p.luckPotionTier).toBe(0);
  });

  it('不 clamp：负向叠加可达 -0.7 以下仍按原值（caps 仅 UI）', () => {
    const l = new LuckState();
    l.ladyBugLuckTimeLeft = -10800;   // GetLadyBugLuck = -1 → ×0.2
    l.stinky = true;                  // -0.25
    expect(l.ladyBugLuck).toBeCloseTo(-1, 5);
    l.brokenMirrorBadLuckTime = 100;  // -0.25
    const p = new Player(0, 0, new Inventory());
    p.luckState.ladyBugLuckTimeLeft = -10800;
    p.luckState.stinky = true;
    p.luckState.brokenMirrorBadLuckTime = 100;
    expect(p.luck).toBeCloseTo(-0.7, 5);   // -0.2 - 0.25 - 0.25（原版最小可达值）
  });

  it('钱币幸运分档 + 衰减 + 瓢虫时序', () => {
    const l = new LuckState();
    l.addCoinLuck(500, 300_000);         // 距离 <1000px → 0.2 档
    expect(l.coinLuckValue).toBeCloseTo(0.2, 5);
    l.addCoinLuck(500, 1_000_000);       // cap 1e6
    expect(l.coinLuck).toBe(1_000_000);
    l.addCoinLuck(2000, 100);            // 距离过远不累计
    expect(l.coinLuck).toBe(1_000_000);
    l.update(600);                        // 10s 衰减 ≈ ×0.9999^600 ≈ 0.9417
    expect(l.coinLuck).toBeCloseTo(1_000_000 * 0.9417, -4);
    l.ladyBugLuckTimeLeft = -10800;
    l.update(10800);
    expect(l.ladyBugLuckTimeLeft).toBe(0);
    l.brokenMirrorBadLuckTime = 25200;
    l.update(25200);
    expect(l.brokenMirrorBadLuck).toBe(false);
  });

  it('瓢虫杀/触：距离衰减公式 + 金瓢虫翻倍（NPC.cs:82338-82385）', () => {
    const l = new LuckState();
    l.ladyBugKilled(0);                    // 贴身满额 -10800
    expect(l.ladyBugLuckTimeLeft).toBe(-10800);
    expect(l.ladyBugLuck).toBeCloseTo(-1, 5);
    const l2 = new LuckState();
    l2.ladyBugKilled(0, true);             // 金瓢虫 ×2
    expect(l2.ladyBugLuckTimeLeft).toBe(-21600);
    const l3 = new LuckState();
    l3.ladyBugTouched(0);                  // 贴身满额 +43200
    expect(l3.ladyBugLuckTimeLeft).toBe(43200);
    expect(l3.ladyBugLuck).toBeCloseTo(1, 5);
    l3.ladyBugLuckTimeLeft = -100;
    l3.ladyBugTouched(0);                  // 当前为负时触摸不翻转（releaseOwner 门语义）
    expect(l3.ladyBugLuckTimeLeft).toBe(-100);
  });
});

// ============ 火炬/地精扫描 ============

function fakeStore(w: number, h: number) {
  const n = w * h;
  const s = {
    w, h,
    flags: new Uint8Array(n),
    type: new Int16Array(n),
    frameX: new Int16Array(n),
    frameY: new Int16Array(n),
    liquid: new Uint8Array(n),
    liquidType: new Uint8Array(n),
    idx: (x: number, y: number) => y * w + x,
  };
  return s as unknown as TileStore;
}

const TORCH_IDX = TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === 4);
const GNOME_IDX = TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === 567);
const NONE: LuckScanZones = {
  dungeon: false, temple: false, snow: false, desert: false, jungle: false,
  glowshroom: false, corrupt: false, crimson: false, hallow: false, ocean: false,
};

describe('scanLuckScene（Player.cs:17580-17939 净效果版）', () => {
  it('地表恒无火炬幸运（:17592-17598 直接 Consume）', () => {
    const st = fakeStore(200, 200);
    (st as unknown as { type: Int16Array }).type[100 * 200 + 100] = TORCH_IDX;
    const r = scanLuckScene({ store: st, tx: 100, ty: 100, belowSurface: false, zones: NONE, heldTorchStyle: null });
    expect(r.torchLuck).toBe(0);
  });

  it('冰炬在雪原 = 正确群系 → torchLuck 1；普通火把在雪原 = 错群系负贡献钳 0', () => {
    const snow = { ...NONE, snow: true };
    const st = fakeStore(200, 200);
    const t = st as unknown as { type: Int16Array; frameY: Int16Array; flags: Uint8Array };
    t.type[100 * 200 + 100] = TORCH_IDX;
    t.frameY[100 * 200 + 100] = TORCH_STYLE.Ice * 22;
    t.flags[100 * 200 + 100] = 1;
    let r = scanLuckScene({ store: st, tx: 100, ty: 110, belowSurface: true, zones: snow, heldTorchStyle: null });
    expect(r.torchLuck).toBe(1);
    // 同窗再放一根普通火把（雪原 bad += 2 → -1.5 → 总 -0.5 钳 0）
    t.type[100 * 200 + 101] = TORCH_IDX;
    t.frameY[100 * 200 + 101] = TORCH_STYLE.Torch * 22;
    t.flags[100 * 200 + 101] = 1;
    r = scanLuckScene({ store: st, tx: 100, ty: 110, belowSurface: true, zones: snow, heldTorchStyle: null });
    expect(r.torchLuck).toBe(0);
  });

  it('手持火把计入 nearbyTorch（:17775-17778）+ 地精窗口检测', () => {
    const st = fakeStore(400, 400);
    const r = scanLuckScene({ store: st, tx: 200, ty: 210, belowSurface: true, zones: { ...NONE, snow: true }, heldTorchStyle: TORCH_STYLE.Ice });
    expect(r.torchLuck).toBe(1);   // 手持冰炬在雪原 → good 1
    const t = st as unknown as { type: Int16Array; flags: Uint8Array };
    t.type[200 * 400 + 200] = GNOME_IDX;
    t.flags[200 * 400 + 200] = 1;
    const r2 = scanLuckScene({ store: st, tx: 200, ty: 210, belowSurface: true, zones: NONE, heldTorchStyle: null });
    expect(r2.hasGardenGnome).toBe(true);   // 窗口内（±84/±61）
    const r3 = scanLuckScene({ store: st, tx: 200, ty: 320, belowSurface: true, zones: NONE, heldTorchStyle: null });
    expect(r3.hasGardenGnome).toBe(false);  // 窗口外
  });
});

describe('掉落概率随 luck 变化趋势（NpcDrops rollLuck 同构链：RollLuck(N)==0 命中率单调升）', () => {
  it('1/50 掷骰：luck 0 → 0.02 基线；0.5 / 1.0 逐级上升', () => {
    const rate = (luck: number) => zeroRate(() => rollLuck(luck, 50));
    const r0 = rate(0), r1 = rate(0.5), r2 = rate(1);
    expectRateClose(r0, 0.02);
    expect(r1).toBeGreaterThan(r0 * 1.1);
    expect(r2).toBeGreaterThan(r1);
  });
});
