// ============================================================================
// Journey 力量（CreativePowers 族）1:1 测试
// 标杆：CreativePowers.cs / CreativePowerManager.cs / Main.cs 难度 override /
// NPC.cs GetSpawnRate 旅程段 / Weather 冻结门 / Player godmode 消费点
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  createJourneyPowers, targetTimeRate, timeRateSliderOf, strengthOfDifficultySlider,
  spawnRateMultiplier, shouldDisableSpawns, windOfSlider, sliderOfWind,
  TIME_RATE_PRESETS, DIFFICULTY_PRESETS, SPAWN_RATE_PRESETS, WIND_PRESETS,
  FAR_PLACEMENT_RANGE_X, FAR_PLACEMENT_RANGE_Y, JOURNEY_POWER_REGISTRY,
} from '../src/world/JourneyPowers';
import { mainDifficulty, mainExpertMode, mainMasterMode, GDL } from '../src/stats/ScaleStats';
import { World } from '../src/world/World';
import { WeatherState } from '../src/world/weather/Weather';
import type { WeatherCtx } from '../src/world/weather/Weather';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { bindJourneyPowers } from '../src/world/JourneyPowers';

const wctx = (over: Partial<WeatherCtx> = {}): WeatherCtx => ({
  dayRate: 1, dayTime: true, dayTimeTicks: 10000, playerStrongEnough: true,
  playerReadyForKingSlime: true, expertMode: false, atmo: 1, aboveRockLayer: true,
  graveyardIntensity: 0, hardMode: false, noOtherEvent: true, downedSlimeKing: false,
  maxTilesX: 4200, worldSurface: 300, viewCenterY: 3000, ...over,
});

describe('CreativePowers 数值语义（CreativePowers.cs）', () => {
  it('ModifyTimeRate（:884）：Remap(0,1 → 1,24) 取整（银行家舍入 12.5→12）', () => {
    expect(targetTimeRate(0)).toBe(1);
    expect(targetTimeRate(1)).toBe(24);
    // remap(0.5)=12.5 → (int)Math.Round 银行家舍入 → 12（非 13）
    expect(targetTimeRate(0.5)).toBe(12);
    expect(targetTimeRate(TIME_RATE_PRESETS.x12)).toBe(12);
    expect(targetTimeRate(TIME_RATE_PRESETS.x1)).toBe(1);
    expect(targetTimeRate(TIME_RATE_PRESETS.x24)).toBe(24);
    // 整档逆映射（UI 滑杆位置）往返恒等
    for (let r = 1; r <= 24; r++) expect(targetTimeRate(timeRateSliderOf(r))).toBe(r);
  });

  it('DifficultySlider（:1023-1035）：0→0.5 / 0.33→1 / 0.66→2 / 1→3，1/20 步进', () => {
    expect(strengthOfDifficultySlider(0)).toBe(0.5);
    expect(strengthOfDifficultySlider(DIFFICULTY_PRESETS.journey)).toBe(0.5);
    expect(strengthOfDifficultySlider(DIFFICULTY_PRESETS.normal)).toBe(1);
    expect(strengthOfDifficultySlider(DIFFICULTY_PRESETS.expert)).toBeCloseTo(2, 6);
    expect(strengthOfDifficultySlider(DIFFICULTY_PRESETS.master)).toBe(3);
    // 中段：remap(0.5,0.33,1,1,3)=1.5074…→×20=30.14…→round 30→1.5（1/20 步进）
    expect(strengthOfDifficultySlider(0.5)).toBe(1.5);
    // 全域值都是 1/20 的整数倍（round(v*20)/20；float32 量化留 1e-4 容差）
    for (let s = 0; s <= 100; s++) {
      const v = strengthOfDifficultySlider(s / 100);
      expect(Math.abs(v * 20 - Math.round(v * 20))).toBeLessThan(1e-4);
    }
  });

  it('SpawnRateSlider（:1612-1619）：0→0.1 / 0.5→1 / 1→10 双段线性；0=禁用门', () => {
    expect(spawnRateMultiplier(0)).toBeCloseTo(0.1, 6);
    expect(spawnRateMultiplier(SPAWN_RATE_PRESETS.x0)).toBeCloseTo(0.1, 6);
    expect(spawnRateMultiplier(0.25)).toBeCloseTo(0.55, 6);
    expect(spawnRateMultiplier(0.5)).toBe(1);
    expect(spawnRateMultiplier(SPAWN_RATE_PRESETS.x1)).toBe(1);
    expect(spawnRateMultiplier(1)).toBe(10);
    expect(spawnRateMultiplier(SPAWN_RATE_PRESETS.x10)).toBe(10);
    // GetShouldDisableSpawnsFor（:1595-1606）：滑杆==0 才禁用（倍率仍是 0.1）
    expect(shouldDisableSpawns(0)).toBe(true);
    expect(shouldDisableSpawns(0.01)).toBe(false);
    expect(shouldDisableSpawns(0.5)).toBe(false);
  });

  it('ModifyWindDirectionAndStrength（:1197/:1202）：Lerp(-0.8,0.8) 与逆映射', () => {
    expect(windOfSlider(WIND_PRESETS.east)).toBeCloseTo(-0.8, 6);
    expect(windOfSlider(WIND_PRESETS.none)).toBeCloseTo(0, 6);
    expect(windOfSlider(WIND_PRESETS.west)).toBeCloseTo(0.8, 6);
    // GetLerpValue 逆映射往返
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      expect(sliderOfWind(windOfSlider(s))).toBeCloseTo(s, 5);
    }
  });

  it('缺省值（Reset/ResetDataForNewPlayer）：放置范围默认开、刷怪率默认 x1、上帝默认关', () => {
    const jp = createJourneyPowers();
    expect(jp.farPlacementRange).toBe(true);    // :740 _defaultToggleState=true
    expect(jp.spawnRateSlider).toBe(0.5);       // :1591 _sliderDefaultValue=0.5
    expect(jp.godmode).toBe(false);
    expect(jp.difficultySlider).toBe(0);
    expect(jp.freezeRain).toBe(false);
    expect(jp.freezeWind).toBe(false);
    expect(jp.stopBiomeSpread).toBe(false);
  });

  it('力量注册表（CreativePowerManager.Initialize :90-104）：15 项全数登记且 id 连续', () => {
    expect(JOURNEY_POWER_REGISTRY).toHaveLength(15);
    JOURNEY_POWER_REGISTRY.forEach((p, i) => expect(p.id).toBe(i));
    const cfgs = JOURNEY_POWER_REGISTRY.map((p) => p.cfg);
    expect(cfgs).toContain('time_setfrozen');
    expect(cfgs).toContain('setdifficulty');
    expect(cfgs).toContain('setspawnrate');
    expect(JOURNEY_POWER_REGISTRY.every((p) => p.status === 'implemented')).toBe(true);
  });
});

describe('旅程强度滑杆 → Main.Difficulty（Main.cs:17238-17248/:2771-2773）', () => {
  it('旅程世界：滑杆 0→0.5（原版旅程缺省半强度）/ 1→3（大师档）', () => {
    const mk = (slider: number) => ({ difficulty: 3, journeyPowers: { ...createJourneyPowers(), difficultySlider: slider } });
    expect(mainDifficulty(mk(0))).toBeCloseTo(GDL.JOURNEY, 6);
    expect(mainDifficulty(mk(1))).toBeCloseTo(GDL.MASTER, 6);
    expect(mainDifficulty(mk(DIFFICULTY_PRESETS.expert))).toBeCloseTo(GDL.EXPERT, 6);
    // expertMode/masterMode 随 Difficulty 轴翻转（Main.cs:2760-2762）
    expect(mainExpertMode(mk(0.66))).toBe(true);
    expect(mainMasterMode(mk(0.66))).toBe(false);
    expect(mainMasterMode(mk(1))).toBe(true);
    expect(mainExpertMode(mk(0))).toBe(false);
  });

  it('非旅程世界不受滑杆影响（override 仅 IsJourneyMode 注入）', () => {
    const classic = { difficulty: 0, journeyPowers: { ...createJourneyPowers(), difficultySlider: 1 } };
    expect(mainDifficulty(classic)).toBeCloseTo(GDL.CLASSIC, 6);
    const expert = { difficulty: 1, journeyPowers: { ...createJourneyPowers(), difficultySlider: 0 } };
    expect(mainDifficulty(expert)).toBeCloseTo(GDL.EXPERT, 6);
  });

  it('World.isExpert/isMaster 随滑杆实时翻转（Difficulty 轴 getter）', () => {
    const w = new World(64, 32, 42, 'jp-test');
    w.difficulty = 3;
    w.journeyPowers.difficultySlider = 1;    // 大师
    expect(w.isMaster).toBe(true);
    expect(w.isExpert).toBe(true);
    w.journeyPowers.difficultySlider = 0;    // 旅行 0.5
    expect(w.isMaster).toBe(false);
    expect(w.isExpert).toBe(false);
    w.difficulty = 2;                        // 大师世界（GameMode）
    expect(w.isMaster).toBe(true);
  });
});

describe('刷怪率滑杆消费（NPC.cs:671-678）', () => {
  it('getSpawnRate：×10 档 spawnRate÷10 / maxSpawns×10（clamp 后不回夹）', () => {
    const w = new World(400, 600, 42, 'jp-spawn');
    w.difficulty = 3;
    const sp = new VanillaSpawner(w);
    const base = sp.getSpawnRate(200 * 16, 0, false, 24);
    w.journeyPowers.spawnRateSlider = 1;     // ×10
    const boosted = sp.getSpawnRate(200 * 16, 0, false, 24);
    expect(boosted.spawnRate).toBe(Math.trunc(base.spawnRate / 10));
    expect(boosted.maxSpawns).toBe(Math.trunc(base.maxSpawns * 10));
    expect(boosted.maxSpawns).toBeGreaterThan(15);   // 原版滑杆在 clamp 之后不回夹
    // ×0.5 档：rate÷0.55 / max×0.55
    w.journeyPowers.spawnRateSlider = 0.25;  // 0.55×
    const mid = sp.getSpawnRate(200 * 16, 0, false, 24);
    expect(mid.spawnRate).toBe(Math.trunc(base.spawnRate / 0.55));
    expect(mid.maxSpawns).toBe(Math.trunc(base.maxSpawns * 0.55));
  });

  it('非旅程世界不进旅程倍率段（IsJourneyMode 门）', () => {
    const w = new World(400, 600, 42, 'jp-spawn2');
    w.difficulty = 0;
    w.journeyPowers.spawnRateSlider = 1;     // 经典世界滑杆值不生效
    const sp = new VanillaSpawner(w);
    const a = sp.getSpawnRate(200 * 16, 0, false, 24);
    w.journeyPowers.spawnRateSlider = 0.5;
    const b = sp.getSpawnRate(200 * 16, 0, false, 24);
    expect(a).toEqual(b);
  });
});

describe('冻结风/雨消费（Main.cs:58247/:64329/:64357）', () => {
  it('冻结雨：rainTime 不再推进，到点不停雨也不换挡', () => {
    const w = new WeatherState(42);
    w.startRain(true, 0.8);
    const t0 = w.rainTime;
    w.update(wctx({ freezeRain: true }));
    expect(w.rainTime).toBe(t0);          // 冻结：不 tick 不停
    expect(w.raining).toBe(true);
    // 未冻结：rainTime 递减
    const w2 = new WeatherState(43);
    w2.startRain(true, 0.8);
    const t1 = w2.rainTime;
    w2.update(wctx({ freezeRain: false }));
    expect(w2.rainTime).toBe(t1 - 1);
  });

  it('冻结风：windSpeedTarget 不被 windCounter 重掷改写', () => {
    const w = new WeatherState(7);
    w.windCounter = 1;                     // 强制本帧到期重掷
    w.windSpeedTarget = 0.5;
    w.update(wctx({ freezeWind: true }));
    expect(w.windSpeedTarget).toBe(0.5);   // 冻结保持
    const w2 = new WeatherState(7);
    w2.windCounter = 1;
    w2.windSpeedTarget = 0.5;
    w2.update(wctx({ freezeWind: false }));
    expect(w2.windSpeedTarget).not.toBe(0.5);   // 未冻结被重掷
  });
});

describe('上帝模式消费（Player.cs:37595/:23838 + Main.cs:17711）', () => {
  it('damage 早退 0 + tick 回满（绑定态 world.journeyPowers）', () => {
    const w = new World(64, 32, 42, 'jp-god');
    bindJourneyPowers(w.journeyPowers);
    const p = new Player(100, 100, new Inventory());
    p.hp = 50;
    w.journeyPowers.godmode = true;
    expect(p.damage(999, 0, 0)).toBe(0);   // Hurt 首段 creativeGodMode → 0
    expect(p.hp).toBe(50);                 // 未扣血
    w.journeyPowers.godmode = false;
    expect(p.damage(30, 0, 0)).toBeGreaterThan(0);
    bindJourneyPowers(null);               // 清理绑定防泄漏到其他用例
  });
});

describe('存档持久化（IPersistentPerWorldContent / IPersistentPerPlayerContent）', () => {
  it('saveGame → loadSave 往返：世界侧四件 + 玩家侧三件全保留', () => {
    const w = new World(64, 32, 42, 'jp-save');
    w.difficulty = 3;
    w.journeyPowers.freezeRain = true;
    w.journeyPowers.freezeWind = true;
    w.journeyPowers.stopBiomeSpread = true;
    w.journeyPowers.difficultySlider = 0.42;
    w.journeyPowers.godmode = true;
    w.journeyPowers.farPlacementRange = false;
    w.journeyPowers.spawnRateSlider = 0.85;
    const p = new Player(100, 100, new Inventory());
    const json = saveGame(w, p, 1000);
    const back = loadSave(json);
    const jp = back.world.journeyPowers;
    expect(jp.freezeRain).toBe(true);
    expect(jp.freezeWind).toBe(true);
    expect(jp.stopBiomeSpread).toBe(true);
    expect(jp.difficultySlider).toBeCloseTo(0.42, 6);
    expect(jp.godmode).toBe(true);
    expect(jp.farPlacementRange).toBe(false);
    expect(jp.spawnRateSlider).toBeCloseTo(0.85, 6);
    // 玩家段（IPersistentPerPlayerContent 落 player 节）
    expect(back.player.journeyPowers?.godmode).toBe(true);
    expect(back.player.journeyPowers?.farPlacementRange).toBe(false);
    expect(back.player.journeyPowers?.spawnRateSlider).toBeCloseTo(0.85, 6);
  });

  it('旧档无段 = 全默认（farPlacement 开 / 刷怪率 x1 / 滑杆 0）', () => {
    const w = new World(64, 32, 42, 'jp-default');
    w.difficulty = 3;
    const p = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(w, p, 1000));
    const jp = back.world.journeyPowers;
    expect(jp).toEqual(createJourneyPowers());
    // 旅程缺省强度 = 0.5（原版新旅程世界半强度）
    expect(mainDifficulty(back.world)).toBeCloseTo(GDL.JOURNEY, 6);
  });
});

describe('放置范围常量（Player.cs:18636-18645 tileRange×2+8）', () => {
  it('5→18 / 3→14', () => {
    expect(FAR_PLACEMENT_RANGE_X).toBe(5 * 2 + 8);
    expect(FAR_PLACEMENT_RANGE_Y).toBe(3 * 2 + 8);
  });
});
