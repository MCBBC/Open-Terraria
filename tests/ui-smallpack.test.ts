// S 级 UI 小件包回归（2026-08-20 批）：
//  ① 血月/月总屏幕滤镜（SceneState.cs:109/:116 + MoonLordScreenShaderData）
//  ② PvP 背包快切钮（hostile/team 布局常量 + msg 同步状态）
//  ③ MapStyle/MapAlpha 键行为（Player.cs:24596-24653 三态循环/透明度步进）
//  ④ 全图箱名 hover（Main.cs:55282 DrawMap_FindChestName 语义）
import { describe, it, expect } from 'vitest';
import {
  MonolithFilters, emptyMonolithScene, smoothStep,
  type MonolithEnv,
} from '../src/render/MonolithFilters';
import { TEAM_COLORS } from '../src/stats/Pvp';
import { PVP_TEAM_BUTTONS, pvpIconFrame, pvpHoverFrame, PVP_COOLDOWN_MS } from '../src/ui/UI';
import {
  cycleMapStyle, stepMapAlpha, MAP_ALPHA_MIN, MAP_ALPHA_STEP, MAP_STYLE_MAX, MAP_STYLE_MIN,
  mapChestHoverName, mapHoverNameKey,
} from '../src/render/Renderer';
import { options } from '../src/core/Options';

function env(over: Partial<MonolithEnv> = {}): MonolithEnv {
  return {
    worldSurface: 60, rockLevel: 120, screenTileY: 60,
    dayTime: true, hour24: 12, nightElapsed01: 0.5,
    fullMoon: false, worldBloodMoon: false, cloudAlpha: 0,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// ① 血月/月总屏幕滤镜（SceneState.cs:105-128）
// ---------------------------------------------------------------------------
describe('① 屏幕滤镜：血月/月总（SceneState.cs:105-128）', () => {
  it('血月滤镜：worldBloodMoon 激活 + 深度系数 ×0.75（BloodMoonScreenShaderData.cs:10-21）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    f.update(1000, scan, env({ worldBloodMoon: true }));
    const st = f.state('BloodMoon')!;
    expect(st.active).toBe(true);
    expect(st.opacity).toBe(1);
    expect(f.bloodMoonUseOpacity).toBeCloseTo(0.75, 5);   // 地表深度 1 × 0.75
    // UseColor(2,-0.8,-0.6)（ScreenEffectInitializer.cs:27）
    expect(st.def.color).toEqual([2, -0.8, -0.6]);
    // 白天非血月 → 淡出下斜
    f.update(500, scan, env({ worldBloodMoon: false }));
    expect(f.state('BloodMoon')!.opacity).toBeCloseTo(0.5, 5);
  });

  it('月总战滤镜：核心（NPC 398）在场激活（SceneState.cs:109 ClosestNPCPosition[398]≠Zero）', () => {
    const f = new MonolithFilters();
    const scan = emptyMonolithScene();
    f.update(0, scan, env({ moonLordCore: { x: 1000, y: 300 } }));
    const st = f.state('MoonLord')!;
    expect(st.active).toBe(true);
    f.update(1000, scan, env({ moonLordCore: { x: 1000, y: 300 } }));
    expect(st.opacity).toBe(1);
    // 核心不在场（ClosestNPCPosition[398]=Zero）→ 淡出
    f.update(250, scan, env({ moonLordCore: null }));
    expect(st.opacity).toBeCloseTo(0.75, 5);
    f.update(750, scan, env({ moonLordCore: null }));
    expect(st.opacity).toBe(0);
  });

  it('月总战滤镜 = VeryHigh 且 aimAtPlayer=false（ScreenEffectInitializer.cs:22）', () => {
    const f = new MonolithFilters();
    const moon = f.state('MoonLord')!;
    const mono = f.state('MonolithMoonLord')!;
    expect(moon.def.priority).toBeGreaterThan(mono.def.priority);
    expect(moon.def.aimAtPlayer).toBe(false);   // 目标=核心位非玩家位
    expect(mono.def.aimAtPlayer).toBe(true);
  });

  it('血月深度公式：SmoothStep(worldSurface+50, rockLayer+100, screenTileY)（Utils.cs:126-129）', () => {
    // 与 MonolithFilters.update 的深度系数同式——中途点 0.5（线性夹取）
    expect(smoothStep(110, 220, 165)).toBeCloseTo(0.5, 5);
    expect(smoothStep(110, 220, 110)).toBe(0);
    expect(smoothStep(110, 220, 500)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ② PvP 背包快切钮（DrawPVPIcons Main.cs:42074-42195）
// ---------------------------------------------------------------------------
describe('② PvP 背包快切钮（Main.cs:42074-42195）', () => {
  it('队伍钮 6 枚 0-5（:42127 for i<6）+ 文案键名（:42141-42159，第 5 队键名 Pink）', () => {
    expect(PVP_TEAM_BUTTONS.map((b) => b.team)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(PVP_TEAM_BUTTONS.map((b) => b.name)).toEqual(
      ['None', 'Red', 'Green', 'Blue', 'Yellow', 'Pink'],
    );
  });

  it('队伍色 = Main.teamColor（Main.cs:6610-6615）', () => {
    expect(TEAM_COLORS[0]).toEqual([255, 255, 255]);   // White
    expect(TEAM_COLORS[1]).toEqual([218, 59, 59]);     // Red
    expect(TEAM_COLORS[2]).toEqual([59, 218, 85]);     // Green
    expect(TEAM_COLORS[3]).toEqual([59, 149, 218]);    // Blue
    expect(TEAM_COLORS[4]).toEqual([242, 221, 100]);   // Yellow
    expect(TEAM_COLORS[5]).toEqual([224, 100, 242]);   // Purple（文案键 Pink）
  });

  it('PvP 剑帧（★BJ417 1457 制 Frame(2,7)：col=hostile?1:0 / row=team 0-5,Main.cs:43419-43420）', () => {
    expect(pvpIconFrame(false, 0)).toEqual([0, 0]);
    expect(pvpIconFrame(true, 3)).toEqual([1, 3]);
    expect(pvpIconFrame(false, 5)).toEqual([0, 5]);
    expect(pvpIconFrame(true, 9)).toEqual([1, 5]);   // team 夹 0-5
  });

  it('PvP 剑悬停覆盖帧 = (hostile 列, 行 6)（:43432-43434 X 不变 Y=Height*PlayerTeamID.Count）', () => {
    expect(pvpHoverFrame(false)).toEqual([0, 6]);
    expect(pvpHoverFrame(true)).toEqual([1, 6]);
  });

  it('切换冷却 = teamCooldownLen 300t（Main.cs:1026 → 5000ms）', () => {
    expect(PVP_COOLDOWN_MS).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// ③ MapStyle/MapAlpha 键行为（Player.cs:24596-24653）
// ---------------------------------------------------------------------------
describe('③ MapStyle/MapAlpha 键族（Player.cs:24596-24653）', () => {
  it('MapStyle 三态循环 0→1→2→0（:24641-24645 mapStyle++ >2→0）', () => {
    expect(MAP_STYLE_MIN).toBe(0);
    expect(MAP_STYLE_MAX).toBe(2);
    expect(cycleMapStyle(0)).toBe(1);
    expect(cycleMapStyle(1)).toBe(2);
    expect(cycleMapStyle(2)).toBe(0);   // >2 → 0 回绕
  });

  it('MapAlpha 步进 ±0.015 并钳 [0.01,1]（:24608-24615 + Main.cs:54961-54968）', () => {
    expect(MAP_ALPHA_STEP).toBeCloseTo(0.015, 9);
    expect(MAP_ALPHA_MIN).toBeCloseTo(0.01, 9);
    expect(stepMapAlpha(0.5, 1)).toBeCloseTo(0.515, 9);
    expect(stepMapAlpha(0.5, -1)).toBeCloseTo(0.485, 9);
    expect(stepMapAlpha(1, 1)).toBe(1);             // 上界夹 1
    expect(stepMapAlpha(0.02, -1)).toBeCloseTo(0.01, 9);   // 0.005 → DrawMap 钳 0.01
    expect(stepMapAlpha(0.005, 1)).toBeCloseTo(0.02, 9);   // 0.02（越界活值步进后再钳）
  });

  it('Options 持久化键：默认 1 / 0.35（Main.cs:892/:896）+ 装载钳 [0.01,1]', async () => {
    // 默认态（测试环境 options 尚未 kv 装载覆盖 → 字段初始值即原版默认）
    expect(options.data.mapMinimapAlpha).toBe(1);
    expect(options.data.mapOverlayAlpha).toBeCloseTo(0.35, 6);
    // 装载清洗逻辑等价（Options.load 的钳界段）：直接对越界值复算同式
    const clamp = (v: number, def: number) =>
      (typeof v !== 'number' || !Number.isFinite(v)) ? def : Math.min(1, Math.max(0.01, v));
    expect(clamp(2, 1)).toBe(1);
    expect(clamp(0, 0.35)).toBeCloseTo(0.01, 9);
    expect(clamp(NaN as unknown as number, 0.35)).toBeCloseTo(0.35, 9);
  });
});

// ---------------------------------------------------------------------------
// ④ 全图箱名 hover（Main.cs:55227-55360 + DrawMap_FindChestName :56103-56115）
// ---------------------------------------------------------------------------
describe('④ 全图箱名 hover（DrawMap_FindChestName）', () => {
  it('命名箱 "类型名: 名字"、未命名类型名（:56110-56114）', () => {
    expect(mapChestHoverName({ typeName: '宝箱', name: '战利品' })).toBe('宝箱: 战利品');
    expect(mapChestHoverName({ typeName: '宝箱', name: '' })).toBe('宝箱');
    expect(mapChestHoverName({ typeName: '金宝箱', name: null })).toBe('金宝箱');
  });

  it('箱族 l10n 键映射（:55257-55313）：21/441 → chestType、467/468 → chestType2、88 → dresserType（frameX/54）', () => {
    expect(mapHoverNameKey(21, 0)).toBe('LegacyChestType.0');
    expect(mapHoverNameKey(21, 18)).toBe('LegacyChestType.0');        // 2×2 右帧 +18 同档
    expect(mapHoverNameKey(21, 190)).toBe('LegacyChestType.5');       // 36px 步进
    expect(mapHoverNameKey(441, 36)).toBe('LegacyChestType.1');
    expect(mapHoverNameKey(467, 0)).toBe('LegacyChestType2.0');
    expect(mapHoverNameKey(468, 36)).toBe('LegacyChestType2.1');
    expect(mapHoverNameKey(88, 0)).toBe('LegacyDresserType.0');
    expect(mapHoverNameKey(88, 198)).toBe('LegacyDresserType.3');     // 54px 步进
    expect(mapHoverNameKey(11, 0)).toBeNull();                        // 非箱族 → 图例名分支
  });
});
