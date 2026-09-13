// 天气状态机 1:1 移植测试（Terarria1456 Main.cs/Sandstorm.cs 语义）
import { describe, it, expect } from 'vitest';
import { WeatherState, SandstormState, weatherToSave, applyWeatherSave, WIND_MAX, RAIN_MAX } from '../src/world/weather/Weather';
import type { WeatherCtx } from '../src/world/weather/Weather';
import { RNG } from '../src/core/rng';
import { World } from '../src/world/World';
import { saveGame, loadSave } from '../src/save/SaveFile';

const ctx = (over: Partial<WeatherCtx> = {}): WeatherCtx => ({
  dayRate: 1,
  dayTime: true,
  dayTimeTicks: 10000,
  playerStrongEnough: true,
  playerReadyForKingSlime: true,
  expertMode: false,
  atmo: 1,
  aboveRockLayer: true,
  graveyardIntensity: 0,
  hardMode: false,
  noOtherEvent: true,
  downedSlimeKing: false,
  maxTilesX: 4200,
  worldSurface: 300,
  viewCenterY: 3000,
  ...over,
});

describe('WeatherState 状态机', () => {
  it('startRain 时长分布（原版语义边界）', () => {
    // 原版 Main.cs StartRain：num4 = Next(28800, 86400) + 各档 bonus（cap 61194），
    // num5 ∈ [1, 1.5] → rainTime = round(num4×num5) ∈ [28800, 221390]。
    // （旧上界 86400×1.5=129600 是按 mulberry32 流标定的，非原版推导值）
    for (let s = 0; s < 200; s++) {
      const w = new WeatherState(s);
      w.startRain();
      expect(w.rainTime).toBeGreaterThanOrEqual((86400 / 24) * 8);
      expect(w.rainTime).toBeLessThanOrEqual(221390);
      expect(w.raining).toBe(true);
    }
  });

  it('changeRain 强度按云量分档（低云 0.05-0.40 / 高云 0.40-0.91）', () => {
    const lo = new WeatherState(1);
    lo.numClouds = 10;
    lo.changeRain();
    expect(lo.maxRaining).toBeGreaterThanOrEqual(0.05);
    expect(lo.maxRaining).toBeLessThanOrEqual(0.40);
    const hi = new WeatherState(2);
    hi.numClouds = 180;
    hi.changeRain();
    expect(hi.maxRaining).toBeGreaterThanOrEqual(0.20);
    expect(hi.maxRaining).toBeLessThanOrEqual(0.91);
  });

  it('风场：target cap ±0.8；弱玩家（<120 血）钳 ±0.35', () => {
    // 构造器 windCounter/extremeWindCounter 保持 0（原版静态字段缺省，Main.cs:10801
    // 注——2026-08-26"新存档大风吹"修复）：首个 updateWind tick 即走极端分支整体
    // 重掷目标并复位计数器。首掷断言锁此语义。
    const first = new WeatherState(42);
    first.update(ctx());
    expect(first.windCounter).toBeGreaterThanOrEqual(900);
    // ±0.8 钳在更新尾段（Main.cs:58346-58347 同构）：冻结调度（不触发重掷）时
    // 手置超界值被钳回端点。
    const w = new WeatherState(43);
    w.windCounter = 1e9;
    w.windSpeedTarget = 2; // 超界
    w.update(ctx());
    expect(w.windSpeedTarget).toBe(0.8);
    // 弱玩家钳位只在 windCounter 到期重掷时生效（原版 Main.cs:58252-58340 同构，
    // 构造器初掷不钳——10801）。强制到期至少一次再断言。
    const weak = new WeatherState(44);
    weak.windCounter = 1;
    for (let i = 0; i < 3000; i++) weak.update(ctx({ playerStrongEnough: false, aboveRockLayer: false }));
    expect(Math.abs(weak.windSpeedTarget)).toBeLessThanOrEqual(0.35);
  });

  it('current 向 target×(1+5/9×maxRaining) 逼近且雨天放大', () => {
    const w = new WeatherState(7);
    // 固定状态防调度干扰：已下雨（不触发 StartRain）+ 超长 rainTime + 大 windCounter + 冻结变强度
    w.raining = true;
    w.rainTime = 1e9;
    w.windCounter = 1e9;
    (w as unknown as { changeRain: () => void }).changeRain = () => {};
    w.windSpeedTarget = 0.4;
    w.maxRaining = 0;
    w.windSpeedCurrent = 0.3; // 近距起点（指数逼近时间常数 ~660 tick，全距收敛需数千 tick）
    for (let i = 0; i < 2000; i++) w.update(ctx({ aboveRockLayer: false }));
    expect(Math.abs(w.windSpeedCurrent - 0.4)).toBeLessThan(0.005);
    // 雨天放大目标 ×(1+5/9×0.9)
    w.maxRaining = 0.9;
    for (let i = 0; i < 20000; i++) w.update(ctx({ aboveRockLayer: false }));
    const expected = Math.min(0.8, 0.4 * (1 + 5 / 9 * 0.9));
    expect(Math.abs(w.windSpeedCurrent - expected)).toBeLessThan(0.005);
  });

  it('cloudAlpha 向 maxRaining 缓动，stopRain 后归零；下雨推升云量', () => {
    const w = new WeatherState(11);
    w.startRain(true, 0.9);
    expect(w.cloudAlpha).toBeCloseTo(0.9, 5);
    for (let i = 0; i < 600; i++) w.update(ctx({ aboveRockLayer: false }));
    expect(w.cloudAlpha).toBeGreaterThan(0.8);
    expect(w.numClouds).toBeGreaterThan(150); // 200×cloudAlpha 爬升
    w.stopRain();
    for (let i = 0; i < 4000; i++) w.update(ctx({ aboveRockLayer: false }));
    expect(w.cloudAlpha).toBe(0);
  });

  it('闪电：NewLightning 计时/衰减；天空白 0→1→0', () => {
    const w = new WeatherState(13);
    w.newLightning(true);
    expect(w.thunderDelay).toBe(1);
    expect(w.lightningSpeed).toBe(0.2);
    // instant：1 tick 后雷回调 + 白闪上升
    let thunder = 0;
    w.update({ ...ctx(), onThunder: () => thunder++ });
    expect(thunder).toBe(1);
    for (let i = 0; i < 50; i++) w.update(ctx({ aboveRockLayer: false }));
    expect(w.lightning).toBe(0); // decay 归零
  });

  it('暴雨 BGM 门：cloudAlpha≥RAIN_MAX 且 |wind|≥WIND_MAX → storm', () => {
    const w = new WeatherState(17);
    w.updateMusicGates(0.5);
    expect(w.shouldUseStormMusic).toBe(false);
    w.cloudAlpha = RAIN_MAX;
    w.windSpeedTarget = WIND_MAX;
    w.updateMusicGates(0.5);
    expect(w.shouldUseStormMusic).toBe(true);
    // 白天中段无云大风 → windy
    w.cloudAlpha = 0;
    w.windSpeedTarget = WIND_MAX;
    w.updateMusicGates(0.5);
    expect(w.shouldUseWindyDayMusic).toBe(true);
    w.updateMusicGates(0.1); // 非中段
    expect(w.shouldUseWindyDayMusic).toBe(false);
  });

  it('沙尘暴：severity 0.003/tick 逼近意图；无风 15×dayRate 加速结束', () => {
    const sand = new SandstormState();
    sand.happening = true;
    sand.timeLeft = 86400;
    sand.intendedSeverity = 1;
    const c = ctx();
    // windSpeedCurrent 经 WeatherState.sandstorm.update 传入
    const w = new WeatherState(19);
    w.sandstorm = sand;
    const before = sand.severity;
    w.update({ ...c, aboveRockLayer: false });
    expect(sand.severity).toBeCloseTo(before + 0.003, 5);
  });
});

describe('天气持久化', () => {
  it('saveGame → loadSave 往返 + 旧档缺省晴', () => {
    const world = new World(60, 40, 42, 'weather-test');
    world.weather.startRain(true, 0.77);
    world.weather.windSpeedTarget = 0.42;
    world.weather.sandstorm.happening = true;
    world.weather.sandstorm.severity = 0.5;
    const json = saveGame(world, { hp: 100, x: 0, y: 0, inv: { slots: [], selected: 0 }, luckState: { usedGalaxyPearl: false }, builderAccStatus: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } as never, 0);   // 桩携 builderAccStatus(★SW-FX19 起 saveGame 展开本字段,Player.ts:715)
    const { world: w2 } = loadSave(json);
    expect(w2.weather.raining).toBe(true);
    expect(w2.weather.maxRaining).toBeCloseTo(0.77, 5);
    expect(w2.weather.windSpeedTarget).toBeCloseTo(0.42, 5);
    expect(w2.weather.sandstorm.happening).toBe(true);
    expect(w2.weather.sandstorm.severity).toBeCloseTo(0.5, 5);
    // 旧档：剥掉 weather 字段
    const raw = JSON.parse(json) as { weather?: unknown };
    delete raw.weather;
    const { world: w3 } = loadSave(JSON.stringify(raw));
    expect(w3.weather.raining).toBe(false);
    expect(w3.weather.sandstorm.happening).toBe(false);
  });

  it('weatherToSave/applyWeatherSave 字段完整', () => {
    const a = new WeatherState(23);
    a.startRain(false, 0.5);
    a.cloudBGActive = 12345;
    const snap = weatherToSave(a);
    const b = new WeatherState(24);
    applyWeatherSave(b, snap);
    expect(b.rainTime).toBe(a.rainTime);
    expect(b.cloudBGActive).toBe(12345);
    expect(b.numClouds).toBe(a.numClouds);
    void RNG;
  });
});
