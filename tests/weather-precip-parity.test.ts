// 天气 precip 1:1 回归锚（2026-08-31/09-01 dust268"绿树叶"定谳 + 同族复盘批）：
// 锚定四个曾整文件覆写回退过的修复点，任何陈旧基线回写立刻爆红：
//   ① Dust.png 帧公式（Dust.cs:176-191）——dust 268 真帧 (680, 60+10×rand3) 8×8
//     灰十字；(680,20) 是 dust 68 的蓝十字格，蓝×沙色=暗绿（勿再手算内联）；
//   ② rain.type = waterStyle×3+rand(3)（Rain.cs:165/210）——曾硬编码 0-2；
//   ③ 雨溅花尘映射 dustWater()（Dust.cs:405-421）；
//   ④ 落叶 SpriteFrame(32,8) CurrentColumn = 树格油漆（TileDrawing:8027）。
// 全部纯函数/池驱动，无 DOM 依赖。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dustFrameOf } from '../src/fx/VanillaDust';
import { dustWaterFor, WeatherRenderer } from '../src/render/WeatherRenderer';
import { natureParticles, LEAF_GORES } from '../src/render/NatureParticles';

// ---------- ① Dust.png 帧公式 ----------
describe('dustFrameOf（Dust.cs:176-191 唯一权威）', () => {
  it('dust 268 沙尘：fx=680、fy∈{60,70,80}（双重 while 各减 100 加 30）', () => {
    for (let i = 0; i < 30; i++) {
      const f = dustFrameOf(268);
      expect(f.fx).toBe(680);
      expect([60, 70, 80]).toContain(f.fy);
    }
  });

  it('dust 76 雪：fx=760、fy∈{0,10,20}（<100 无 while 轮）', () => {
    for (let i = 0; i < 20; i++) {
      const f = dustFrameOf(76);
      expect(f.fx).toBe(760);
      expect([0, 10, 20]).toContain(f.fy);
    }
  });

  it('dust 68 = (680,0/10/20) 蓝十字陷阱格——(680,20) 真身是它（68<100 零轮 while），与 268 同列不同行勿混', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) seen.add(dustFrameOf(68).fy);
    expect(dustFrameOf(68).fx).toBe(680);
    expect([...seen].sort()).toEqual([0, 10, 20]);
  });

  it('纯水溅花尘 33：fx=330、fy∈{0,10,20}', () => {
    const f = dustFrameOf(33);
    expect(f.fx).toBe(330);
    expect([0, 10, 20]).toContain(f.fy);
  });
});

// ---------- ② rain.type = waterStyle×3 + rand(3) ----------
describe('rain 列选型（Rain.cs:165/210）', () => {
  const fakeWeather = { sandstorm: { happening: false, severity: 0, timeLeft: 0, intendedSeverity: 0 }, cloudAlpha: 0.8, windSpeedCurrent: 1, raining: false } as never;
  const hooksFor = (waterStyle: number) => ({
    lightAt: () => [255, 255, 255] as [number, number, number],
    atmo: 1, snowRatio: 0, snowTileCount: 0, bossDanger: false,
    waterStyle, shimmerAlpha: 0,
    splashDust() {}, sandstormVisuals: false, desertSandTiles: 0,
    sandColors: () => [],
  });

  it('spawnRain：type 落在 [waterStyle×3, waterStyle×3+2]（雪原 ws=1 → 3-5，非 0-2）', () => {
    for (const ws of [0, 1, 3]) {
      const inst = new WeatherRenderer();
      inst.attach(fakeWeather, hooksFor(ws) as never);
      (inst as unknown as { ensurePool: (n: number) => void }).ensurePool(8);
      for (let i = 0; i < 24; i++) {
        (inst as unknown as { spawnRain: (x: number, y: number) => void }).spawnRain(0, 0);
      }
      const types = (inst as unknown as { pool: Array<{ active: boolean; type: number }> }).pool
        .filter((d) => d.active).map((d) => d.type);
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) {
        expect(t).toBeGreaterThanOrEqual(ws * 3);
        expect(t).toBeLessThanOrEqual(ws * 3 + 2);
      }
    }
  });

  it('newRainForced（眼球伞）：同 waterStyle×3+rand(3) 语义', () => {
    const inst = new WeatherRenderer();
    inst.attach(fakeWeather, hooksFor(2) as never);
    (inst as unknown as { ensurePool: (n: number) => void }).ensurePool(4);
    inst.newRainForced(0, 0, 0, 10);
    const d = (inst as unknown as { pool: Array<{ active: boolean; type: number }> }).pool[0];
    expect(d.active).toBe(true);
    expect(d.type).toBeGreaterThanOrEqual(6);
    expect(d.type).toBeLessThanOrEqual(8);
  });
});

// ---------- ③ Dust.dustWater() 映射 ----------
describe('dustWaterFor（Dust.cs:405-421）', () => {
  it('全表逐值', () => {
    expect(dustWaterFor(0)).toBe(33);
    expect(dustWaterFor(1)).toBe(33);
    expect(dustWaterFor(2)).toBe(98);
    expect(dustWaterFor(3)).toBe(99);
    expect(dustWaterFor(4)).toBe(100);
    expect(dustWaterFor(5)).toBe(101);
    expect(dustWaterFor(6)).toBe(102);
    expect(dustWaterFor(7)).toBe(103);
    expect(dustWaterFor(8)).toBe(104);
    expect(dustWaterFor(9)).toBe(105);
    expect(dustWaterFor(10)).toBe(123);
    expect(dustWaterFor(11)).toBe(33);
    expect(dustWaterFor(12)).toBe(288);
    expect(dustWaterFor(13)).toBe(33);
  });
});

// ---------- ④ 落叶油漆列 ----------
describe('spawnLeaf CurrentColumn（TileDrawing:8027）', () => {
  it('paint 入参写入 col；缺省 0', () => {
    expect(natureParticles.leaves.length).toBe(0);
    natureParticles.spawnLeaf(100, 100, 910);          // 缺省 = 未上漆
    expect(natureParticles.leaves[natureParticles.leaves.length - 1]?.col).toBe(0);
    natureParticles.spawnLeaf(100, 100, 910, 7);       // 油漆 7 → 列 7
    expect(natureParticles.leaves[natureParticles.leaves.length - 1]?.col).toBe(7);
    natureParticles.clear();
  });

  it('非落叶 gore 拒收（LEAF_GORES 门不受 paint 影响）', () => {
    const n0 = natureParticles.leaves.length;
    natureParticles.spawnLeaf(0, 0, 706, 5);           // 706 = drip 族
    expect(natureParticles.leaves.length).toBe(n0);
    expect(LEAF_GORES.has(910)).toBe(true);
    expect(LEAF_GORES.has(706)).toBe(false);
  });
});

// ---------- ⑤ SolidCollision 盒测（Collision.cs:2713-2746；斜坡穿沙定谳回归） ----------
import { solidCollisionBox } from '../src/render/WeatherRenderer';
import { TILE } from '../src/core/constants';
import { TileStore } from '../src/world/TileStore';

/** 迷你 TileStore 桩（solidCollisionBox 只摸 w/h/idx/flags/wire/type/half） */
function fakeStore(cells: Record<string, { type: number; half?: boolean; actuated?: boolean }>) {
  const w = 32, h = 128;
  const type = new Uint16Array(w * h);
  const flags = new Uint8Array(w * h);
  const wire = new Uint8Array(w * h);
  const half = new Uint8Array(w * h);
  flags.fill(1); // active 全 1（空气=type 0 不实心即可）
  for (const [k, c] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = y * w + x;
    type[i] = c.type;
    half[i] = c.half ? 1 : 0;
    wire[i] = c.actuated ? 32 : 0;
  }
  return {
    w, h, type, flags, wire, half,
    wall: new Uint16Array(w * h),
    liquid: new Uint8Array(w * h),
    liquidType: new Uint8Array(w * h),
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
  } as never;
}
const SAND = 53;   // 内部 id 占位——LUT 位在 describe 内临时注入（SOLID_LUT 是运行时可变 Uint8Array）

describe('solidCollisionBox（Collision.cs:2713 斜坡穿沙回归）', () => {
  const realLut = Number(TileStore.SOLID_LUT[SAND]);
  beforeAll(() => { TileStore.SOLID_LUT[SAND] = 1; });
  afterAll(() => { TileStore.SOLID_LUT[SAND] = realLut; });

  it('中心点在空气中、10×10 盒搭到斜坡沙格 → 命中（旧单点门=穿墙根因）', () => {
    const st = fakeStore({ [`${10},${10}`]: { type: SAND } });
    // 盒 (px,py)=(10*16-9, 10*16-4)：盒右缘 x=10*16+1 搭进沙格,中心点 (px+5)=(151)∈格9 空气
    const px = 10 * TILE - 9, py = 10 * TILE - 4;
    expect(Math.floor((px + 5) / TILE)).toBe(9);          // 中心点格=空气（旧门漏判）
    expect(solidCollisionBox(st, px, py, 10, 10)).toBe(true);
  });

  it('纯空气 → 不命中', () => {
    const st = fakeStore({});
    expect(solidCollisionBox(st, 5 * TILE, 5 * TILE, 10, 10)).toBe(false);
  });

  it('半砖：上半 8px 不命中、下半命中（Collision.cs:2735-2738）', () => {
    const st = fakeStore({ '8,8': { type: SAND, half: true } });
    // 半砖实心区 = [128+8, 128+16) = [136,144)。盒 y=118..128（py+h=128 < 136）不命中
    expect(solidCollisionBox(st, 8 * TILE + 4, 8 * TILE - 10, 10, 10)).toBe(false);
    // 盒 y=132..142（py+h=142 > 136）命中
    expect(solidCollisionBox(st, 8 * TILE + 4, 8 * TILE + 4, 10, 10)).toBe(true);
  });

  it('已致动实心格不算（inActive :2725）', () => {
    const st = fakeStore({ '6,6': { type: SAND, actuated: true } });
    expect(solidCollisionBox(st, 6 * TILE + 4, 6 * TILE + 4, 10, 10)).toBe(false);
  });
});

// ---------- ⑥ dust 268 独占链物理（Dust.cs:1859-1887） ----------
describe('沙尘 grain 268 链（空中波动支/实心收缩支）', () => {
  interface G268 { x: number; y: number; vx: number; vy: number; scale: number; fadeIn: number; active: boolean }
  const poolOf = (wr: WeatherRenderer) => (wr as unknown as { sand: G268[] }).sand;
  const fakeWeather = { sandstorm: { happening: true, severity: 0.8, timeLeft: 100, intendedSeverity: 0.8 }, cloudAlpha: 0, windSpeedCurrent: 1, raining: false } as never;
  const hooks = {
    lightAt: () => [255, 255, 255] as [number, number, number],
    atmo: 1, snowRatio: 0, snowTileCount: 0, bossDanger: false,
    waterStyle: 0, shimmerAlpha: 0,
    splashDust() {}, sandstormVisuals: true, desertSandTiles: 500,
    sandColors: () => [{ color: '#C8A014', weight: 10 }],
  };
  const grain = (over: Partial<Record<string, number | boolean>> = {}) => ({
    x: 1000, y: 1000, vx: 10, vy: 1, scale: 0.9, fadeIn: 0,
    cr: 200, cg: 160, cb: 20, frame: 0, active: true, ...over,
  } as never);
  const fakeWorld = (st: unknown) => ({ store: st, w: 32, h: 128 }) as never;

  it('空中拍：vy 被整拍重置为 sin(x×0.0044)×2+3（else 支 :1883-1887,非累加重力）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather, hooks as never);
    poolOf(wr).push(grain());
    wr.update(fakeWorld(fakeStore({})), 800, 600, 0, 0, 0, 0);
    const g = poolOf(wr)[0];
    expect(g.vy).toBeCloseTo(Math.sin(g.x * 0.0043982295) * 2 + 3, 5);
    expect(g.vx).toBeCloseTo(10 * 1.0050251, 6);          // :1862 累乘一次
    expect(g.scale).toBeCloseTo(0.9 + 0.01 - 0.01, 6);    // :1863 +0.01 与老化 :2163 −0.01 对冲
  });

  it('实心拍：scale×0.9、速度×0.25,不进 else 支（:1878-1882）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather, hooks as never);
    // 粒落点 10*16=160 附近,沙格 (10,10) 整格实心
    poolOf(wr).push(grain({ x: 10 * TILE + 4, y: 10 * TILE + 4 }));
    wr.update(fakeWorld(fakeStore({ '10,10': { type: SAND } })), 800, 600, 0, 0, 0, 0);
    const g = poolOf(wr)[0];
    // 时序：+0.01（:1863）在收缩前 → (0.9+0.01)×0.9 −0.01（老化）
    expect(g.scale).toBeCloseTo((0.9 + 0.01) * 0.9 - 0.01, 5);
    expect(Math.abs(g.vx)).toBeCloseTo(Math.abs(10 * 1.0050251 * 0.25), 5);
  });
});
