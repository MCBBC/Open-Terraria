// SW-BJ26 2026-09-07 封闭洞穴内穿透下雨（用户实报"地底洞穴在地表下雨时居然也会下雨"）。
// 原版机制（反编译锚）：
//   · Rain.MakeRain（Rain.cs:32）五连总闸含 `!Main.SceneMetrics.ZoneRain`——ZoneRain =
//     Main.raining && SurfaceAtmospherics（SceneMetrics.cs:700，SurfaceAtmospherics =
//     玩家 tileY≤worldSurface，WorldGen.cs:11003）→ 玩家在地表以下时整帧【零生成】雨滴；
//   · 逐滴生成门（Rain.cs:86）：生成点（screenTop−20..100px 所在格）须非 SolidTile 且
//     wall≤0——只管生成点本身，兜不住无墙洞穴（本仓行为日志 behavior-log-粗暴的椰子地段：
//     玩家 2059,380 洞区 2343 采样格 wall 全 0，air+wall0 生成带全放行=实报根因）；
//   · Rain.Update（Rain.cs:120-134）：死亡门 SolidCollision(2×2)‖屏底+100‖WetCollision，
//     死亡即按 rand(100)<gfxQuality×100 掷溅花尘（三死因同支，无天空暴露列门）；
//   · 雨声 cue28 门（Main.cs:11712-11720 case28）：num12 = ZoneRain && !ZoneSnow →
//     UpdateAmbientCueState，否则 TowardStopping 渐熄（num11 与门位独立，level 照算）；
//   · Main.snowing()（Main.cs:13208-13209）门含 `!SceneMetrics.SurfaceAtmospherics`——
//     洞内飘雪与洞内雨同族（本仓旧 atmo<0.4 梯度近似：地下 atmo 钳 1 = 漏放）。
// 本文件锁死：ZoneRain 生成总闸（核心回归）/ 逐滴门双腿 / atmo<0.4 帽 / 总闸只封生成不封
// 已在途雨滴（Rain.Update 无 ZoneRain 门）/ 溅花尘三死因 / 雨声门矩阵 / 结构锁。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { WeatherRenderer } from '../src/render/WeatherRenderer';
import { WeatherState, type WeatherCtx, type WeatherLoopVolumes } from '../src/world/weather/Weather';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

// ---------- 夹具：TileStore 桩（对齐 weather-precip-parity 的 fakeStore 惯例） ----------
// 世界 64×96：行 24-25 洞顶（实心）、26-43 洞内空气、44-45 洞底（实心）；
// wall 全 0 = 行为日志实报世界的形态（无墙洞穴，逐滴门放行）。
const DIRT = 2;   // 内部 id 占位——LUT 位在 beforeAll 注入（SOLID_LUT 运行时可变 Uint8Array）

function fakeStore(cells: Record<string, { type?: number; wall?: number }> = {}) {
  const w = 64, h = 96;
  const type = new Uint16Array(w * h);
  const flags = new Uint8Array(w * h).fill(1);
  const wire = new Uint8Array(w * h);
  const half = new Uint8Array(w * h);
  const slope = new Uint8Array(w * h);
  const liquid = new Uint8Array(w * h);
  const wall = new Uint16Array(w * h);
  for (let y = 24; y <= 25; y++) for (let x = 0; x < w; x++) type[y * w + x] = DIRT;   // 洞顶
  for (let y = 44; y <= 45; y++) for (let x = 0; x < w; x++) type[y * w + x] = DIRT;   // 洞底
  for (const [k, c] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    const i = y * w + x;
    if (c.type !== undefined) type[i] = c.type;
    if (c.wall !== undefined) wall[i] = c.wall;
  }
  return { w, h, type, flags, wire, half, slope, liquid, wall,
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h } as never;
}

const CAM = { x: 0, y: 30 * TILE, viewW: 800, viewH: 690 };
// Math.random 恒 0.5 → 生成点确定：x = camX−600+0.5×(viewW+1200) = 400 → tile 25；
// y = camY−60 = 420 → tile 26（洞内空气，wall=0）——即实报场景的生成带落点。
const SPAWN_TILE = { x: 25, y: 26 };

function baseHooks(over: Record<string, unknown> = {}) {
  return {
    lightAt: () => [255, 255, 255] as [number, number, number],
    atmo: 1,
    zoneRain: true, surfaceAtmospherics: true,   // 地表态；洞内测试逐例翻转
    snowRatio: 0, snowTileCount: 0,
    bossDanger: false, deerclopsNear: false,
    waterStyle: 0, shimmerAlpha: 0,
    splashDust: () => {},
    sandstormVisuals: false, desertSandTiles: 0,
    sandColors: () => [],
    ...over,
  };
}

function fakeWeather() {
  return { cloudAlpha: 0.6, windSpeedCurrent: 0, raining: true,
    sandstorm: { happening: false, severity: 0, timeLeft: 0, intendedSeverity: 0 } } as never;
}

function activeCount(wr: WeatherRenderer): number {
  return (wr as unknown as { pool: Array<{ active: boolean }> }).pool.filter((d) => d.active).length;
}

describe('SW-BJ26 洞内雨核心回归：Rain.cs:32 ZoneRain 生成总闸', () => {
  const realLut = Number(TileStore.SOLID_LUT[DIRT]);
  beforeAll(() => { TileStore.SOLID_LUT[DIRT] = 1; });
  afterAll(() => { TileStore.SOLID_LUT[DIRT] = realLut; });
  const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  afterAll(() => rnd.mockRestore());

  it('玩家在地表以下（zoneRain=false）→ 封闭无墙洞穴整帧零生成（实报场景）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks({ zoneRain: false, surfaceAtmospherics: false }) as never);
    const st = fakeStore();   // 生成带 (25,26) = air + wall0 —— 逐滴门放行（实报陷阱形态）
    for (let f = 0; f < 10; f++) {
      wr.update({ store: st, w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
      expect(activeCount(wr)).toBe(0);   // Rain.cs:32 总闸：地下整帧 return，不进生成循环
    }
  });

  it('同世界 zoneRain=true（玩家回地表）→ 生成（对照面：证伪"世界构造无雨位"）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks() as never);
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(activeCount(wr)).toBeGreaterThan(0);
    const d = (wr as unknown as { pool: Array<{ active: boolean; x: number; y: number }> }).pool.find((p) => p.active);
    expect(d!.x).toBe(400);                       // x = camX−600+0.5×(viewW+1200)
    // 生成 y = camY−(20+0.5×80)=420；同拍 update 先 position+=velocity(+14) 再入死亡门
    expect(d!.y).toBe(CAM.y - 60 + 14);
  });

  it('zoneRain=true 但生成带实心 → 逐滴门拒（Rain.cs:86 solidTile 腿仍生效）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks() as never);
    const st = fakeStore({ [`${SPAWN_TILE.x},${SPAWN_TILE.y}`]: { type: DIRT } });
    for (let f = 0; f < 5; f++) {
      wr.update({ store: st, w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
      expect(activeCount(wr)).toBe(0);
    }
  });

  it('zoneRain=true 但生成带有墙 → 逐滴门拒（Rain.cs:86 wall≤0 腿仍生效）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks() as never);
    const st = fakeStore({ [`${SPAWN_TILE.x},${SPAWN_TILE.y}`]: { wall: 5 } });
    wr.update({ store: st, w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(activeCount(wr)).toBe(0);
  });

  it('atmo<0.4 → 零生成（NewRain :188-190 生成帽 0 的等价早退保留）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks({ atmo: 0.3 }) as never);
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(activeCount(wr)).toBe(0);
  });

  it('总闸只封【生成】不封已 在途雨滴：zoneRain=false 下 newRainForced 雨滴照常下坠（Rain.Update 无 ZoneRain 门）', () => {
    const wr = new WeatherRenderer();
    wr.attach(fakeWeather(), baseHooks({ zoneRain: false, surfaceAtmospherics: false }) as never);
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    wr.newRainForced(400, 26 * TILE, 0, 9);       // 眼球伞族强制滴（不受总闸，原版同）
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    const pool = (wr as unknown as { pool: Array<{ active: boolean; y: number }> }).pool;
    const d = pool.find((p) => p.active);
    expect(d).toBeDefined();
    expect(d!.y).toBe(26 * TILE + 9);             // position += velocity 照走一拍
  });
});

describe('SW-BJ26 溅花尘列门（Rain.Update :120-134，死亡即溅，三死因同支）', () => {
  const realLut = Number(TileStore.SOLID_LUT[DIRT]);
  beforeAll(() => { TileStore.SOLID_LUT[DIRT] = 1; });
  afterAll(() => { TileStore.SOLID_LUT[DIRT] = realLut; });
  const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);   // 50 < gfxQuality×100 → 恒溅
  afterAll(() => rnd.mockRestore());

  function drop(wr: WeatherRenderer, x: number, y: number) {
    const pool = (wr as unknown as { pool: Array<{ active: boolean; x: number; y: number; vx: number; vy: number; scale: number; rotation: number; type: number }> }).pool;
    Object.assign(pool[0], { active: true, x, y, vx: 0, vy: 14, scale: 1, rotation: 0, type: 0 });
  }

  /** 预热一拍：ensurePool 建池（zoneRain=false → 零生成，池只含手工滴） */
  function prime(wr: WeatherRenderer) {
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
  }

  it('落点撞实心格 → 死亡 + 溅花尘（位置 = −v−2 / −v+2，Rain.Update :125-127）', () => {
    const wr = new WeatherRenderer();
    const splashes: Array<[number, number]> = [];
    wr.attach(fakeWeather(), baseHooks({ zoneRain: false, surfaceAtmospherics: false, splashDust: (x: number, y: number) => splashes.push([x, y]) }) as never);
    prime(wr);
    // 洞底行 44 实心：滴从 (400, 44×16−10) 一拍 +14 → y=700 落进 44 行（704 起）
    drop(wr, 400, 44 * TILE - 10);
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(splashes.length).toBe(1);
    expect(splashes[0][0]).toBe(400 - 0 - 2);       // x − vx − 2
    // y：死亡在移后位（694+14=708）判出，原版 Dust.NewDust(position−velocity) = 移前位
    // 694 → +2 = 696（:125-127）
    expect(splashes[0][1]).toBe(44 * TILE - 10 + 2);
    expect(activeCount(wr)).toBe(0);
  });

  it('空中未死 → 不溅（溅花只挂在死亡支，无逐帧列扫描）', () => {
    const wr = new WeatherRenderer();
    const splashes: Array<[number, number]> = [];
    wr.attach(fakeWeather(), baseHooks({ zoneRain: false, surfaceAtmospherics: false, splashDust: (x: number, y: number) => splashes.push([x, y]) }) as never);
    prime(wr);
    drop(wr, 400, 32 * TILE);                        // 洞内空气中央，距洞顶/底远
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(splashes.length).toBe(0);
    const d = (wr as unknown as { pool: Array<{ active: boolean; y: number }> }).pool[0];
    expect(d.active).toBe(true);
    expect(d.y).toBe(32 * TILE + 14);
  });

  it('屏底 +100 死亡 → 同支溅花（Rain.cs:120 三死因同一 else-if）', () => {
    const wr = new WeatherRenderer();
    const splashes: Array<[number, number]> = [];
    wr.attach(fakeWeather(), baseHooks({ zoneRain: false, surfaceAtmospherics: false, splashDust: (x: number, y: number) => splashes.push([x, y]) }) as never);
    prime(wr);
    drop(wr, 400, CAM.y + CAM.viewH + 95);           // +14 后越屏底线
    wr.update({ store: fakeStore(), w: 64, h: 96 } as never, CAM.viewW, CAM.viewH, CAM.x, CAM.y, 0, 0);
    expect(splashes.length).toBe(1);
    expect(activeCount(wr)).toBe(0);
  });
});

describe('SW-BJ26 雨声 cue28 门矩阵（Main.cs:11712-11720 num12 = ZoneRain && !ZoneSnow）', () => {
  const wctx = (over: Partial<WeatherCtx> = {}): WeatherCtx => ({
    dayRate: 1, dayTime: true, dayTimeTicks: 10000,
    playerStrongEnough: true, playerReadyForKingSlime: true, expertMode: false,
    atmo: 1, aboveRockLayer: true, graveyardIntensity: 0,
    hardMode: false, noOtherEvent: true, downedSlimeKing: false,
    maxTilesX: 4200, worldSurface: 300, viewCenterY: 3000,
    ...over,
  });

  it('地下（zoneRain=false）→ gate=false（TowardStopping 渐熄）；地表 → gate=true', () => {
    const w = new WeatherState(7);
    w.startRain(true, 0.6);
    const seen: WeatherLoopVolumes[] = [];
    for (let i = 0; i < 3; i++) w.update(wctx({ zoneRain: false, zoneSnow: false, onAmbience: (v) => seen.push(v) }));
    expect(seen[seen.length - 1].rainGate).toBe(false);
    for (let i = 0; i < 3; i++) w.update(wctx({ zoneRain: true, zoneSnow: false, onAmbience: (v) => seen.push(v) }));
    expect(seen[seen.length - 1].rainGate).toBe(true);
  });

  it('雪原带（zoneRain=true && zoneSnow=true）→ gate=false（暴风雪轨接管，Main.cs:11713）', () => {
    const w = new WeatherState(9);
    w.startRain(true, 0.6);
    const seen: WeatherLoopVolumes[] = [];
    w.update(wctx({ zoneRain: true, zoneSnow: true, onAmbience: (v) => seen.push(v) }));
    expect(seen[0].rainGate).toBe(false);
    expect(seen[0].blizzardStrong).toBeGreaterThan(0);
  });
});

// ---------- 结构锁（防静默回退：锁判据表达式与 1457 实锚） ----------
describe('SW-BJ26 结构锁（源文本锚）', () => {
  const wrSrc = readFileSync(new URL('../src/render/WeatherRenderer.ts', import.meta.url), 'utf8');
  const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

  it('makeRain 总闸 if (!hooks.zoneRain) + Rain.cs:32 锚 + atmo 帽保留', () => {
    expect(wrSrc).toContain('if (!hooks.zoneRain) return;');
    expect(wrSrc).toContain('Rain.cs:32');
    expect(wrSrc).toContain("if (hooks.atmo < 0.4) return;");
    expect(wrSrc).toContain('if (!hooks.surfaceAtmospherics || hooks.snowTileCount <= 0) return;   // Main.cs:13209');
    expect(wrSrc).toContain('zoneRain: boolean;');
    expect(wrSrc).toContain('surfaceAtmospherics: boolean;');
  });

  it('Game 侧接线 = scene 派生位（SceneMetrics.ZoneRain / SurfaceAtmospherics）', () => {
    expect(gameSrc).toContain('hooks.zoneRain = !!this.scene?.zoneRain;');
    expect(gameSrc).toContain('hooks.surfaceAtmospherics = !!this.scene?.surfaceAtmospherics;');
  });
});
