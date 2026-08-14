// ============================================================================
// Journey 模式力量（CreativePowers 族）1:1 移植
// 标杆（Terarria1456 反编译）：
//   CreativePowers.cs         —— 全部 power 类（滑杆档位/重映射/持久化）
//   CreativePowerManager.cs:86-107 —— Register 顺序 = PowerId = 存档顺序
//   UICreativePowersMenu.cs   —— 菜单结构（主条/时间/天气/个人三条）
//   CreativeUI.cs             —— 入口（背包旁 Journey_Toggle 按钮，角色 difficulty==3 门）
//
// 状态拆分（与原版持久化归属一致）：
//   IPersistentPerWorldContent  → 世界存档（FreezeTime/ModifyTimeRate/FreezeRain/
//     FreezeWind/StopBiomeSpread/DifficultySlider）——本仓 World.journeyPowers 持有，
//     其中 FreezeTime/ModifyTimeRate 复用既有 world.journeyFreezeTime/journeyTimeRate
//     （T 键同源，勿建第二套）。
//   IPersistentPerPlayerContent → 玩家存档（Godmode/FarPlacementRange/SpawnRateSlider）
//     ——单人 = 本地玩家一份，运行时同存 World.journeyPowers，落盘进存档 player 段。
//   ModifyWindDirectionAndStrength / ModifyRainPower —— 不持久化（原版非
//     IPersistentPerWorldContent；滑杆位置由当前风/云反推，CreativePowers.cs:1202/1341）。
//
// 本模块纯函数化（无 DOM），消费端经 bindJourneyPowers 绑定（对应原版
// CreativePowerManager.Instance 静态单例语义；Game.afterWorldLoad 注入）。
// ============================================================================
import { f32, lerpF, remap, roundCS, getLerpValue, strengthOfDifficultySlider } from '../stats/ScaleStats';

export { strengthOfDifficultySlider };

/** Journey 力量状态（世界侧 + 单人玩家侧合并存储；字段注释 = 原版类名） */
export interface JourneyPowersState {
  // ---- 世界侧持久化（IPersistentPerWorldContent）----
  /** FreezeRainPower.Enabled（CreativePowers.cs:1516-1548；雨情冻结） */
  freezeRain: boolean;
  /** FreezeWindDirectionAndStrength.Enabled（:1482-1514；风况冻结） */
  freezeWind: boolean;
  /** StopBiomeSpreadPower.Enabled（:1550-1582；感染蔓延停止） */
  stopBiomeSpread: boolean;
  /** DifficultySliderPower._sliderCurrentValueCache（:1007-1184，0-1 连续；
   *  世界侧持久化 float。注意：持久化的是滑杆原始值不是倍率） */
  difficultySlider: number;
  // ---- 玩家侧持久化（IPersistentPerPlayerContent，单人 = 本地玩家）----
  /** GodmodePower._perPlayerIsEnabled[myPlayer]（:695-732；默认关） */
  godmode: boolean;
  /** FarPlacementRangePower（:734-772；★默认开 _defaultToggleState=true） */
  farPlacementRange: boolean;
  /** SpawnRateSliderPerPlayerPower._sliderCurrentValueCache（:1584-1749；
   *  ★默认 0.5 = x1（_sliderDefaultValue，:1591） */
  spawnRateSlider: number;
}

/** 新世界/新玩家缺省值（CreativePowers.Reset / ResetDataForNewPlayer） */
export function createJourneyPowers(): JourneyPowersState {
  return {
    freezeRain: false,
    freezeWind: false,
    stopBiomeSpread: false,
    difficultySlider: 0,
    godmode: false,
    farPlacementRange: true,   // :740 _defaultToggleState = true
    spawnRateSlider: 0.5,      // :1591 _sliderDefaultValue = 0.5f
  };
}

// ---------------------------------------------------------------------------
// 原版注册表（CreativePowerManager.Initialize :90-104）——id = PowerId = 世界存档
// 写入顺序；本仓实现状态见各条注释（登记 = 引擎级缺口，见报告）
// ---------------------------------------------------------------------------
export const JOURNEY_POWER_REGISTRY = [
  { id: 0, cls: 'FreezeTime', cfg: 'time_setfrozen', persist: 'world', status: 'implemented' },
  { id: 1, cls: 'StartDayImmediately', cfg: 'time_setdawn', persist: 'none', status: 'implemented' },
  { id: 2, cls: 'StartNoonImmediately', cfg: 'time_setnoon', persist: 'none', status: 'implemented' },
  { id: 3, cls: 'StartNightImmediately', cfg: 'time_setdusk', persist: 'none', status: 'implemented' },
  { id: 4, cls: 'StartMidnightImmediately', cfg: 'time_setmidnight', persist: 'none', status: 'implemented' },
  { id: 5, cls: 'GodmodePower', cfg: 'godmode', persist: 'player', status: 'implemented' },
  { id: 6, cls: 'ModifyWindDirectionAndStrength', cfg: 'wind_setstrength', persist: 'none', status: 'implemented' },
  { id: 7, cls: 'ModifyRainPower', cfg: 'rain_setstrength', persist: 'none', status: 'implemented' },
  { id: 8, cls: 'ModifyTimeRate', cfg: 'time_setspeed', persist: 'world', status: 'implemented' },
  { id: 9, cls: 'FreezeRainPower', cfg: 'rain_setfrozen', persist: 'world', status: 'implemented' },
  { id: 10, cls: 'FreezeWindDirectionAndStrength', cfg: 'wind_setfrozen', persist: 'world', status: 'implemented' },
  { id: 11, cls: 'FarPlacementRangePower', cfg: 'increaseplacementrange', persist: 'player', status: 'implemented' },
  { id: 12, cls: 'DifficultySliderPower', cfg: 'setdifficulty', persist: 'world', status: 'implemented' },
  { id: 13, cls: 'StopBiomeSpreadPower', cfg: 'biomespread_setfrozen', persist: 'world', status: 'implemented' },
  { id: 14, cls: 'SpawnRateSliderPerPlayerPower', cfg: 'setspawnrate', persist: 'player', status: 'implemented' },
] as const;

// ---------------------------------------------------------------------------
// ModifyTimeRate（CreativePowers.cs:866-1005）
//   TargetTimeRate = (int)Math.Round(Utils.Remap(slider, 0, 1, 1, 24))（:884）
//   Math.Round 默认银行家舍入（.5 → 就近偶数）；remap 已按 float32 对齐
// ---------------------------------------------------------------------------
export function targetTimeRate(slider: number): number {
  return roundCS(remap(slider, 0, 1, 1, 24));
}

/** 逆向（UI 用）：整数倍率 → 滑杆位置。remap(s,0,1,1,24)=r 的精确逆 s=(r-1)/23；
 *  本仓持久化整数 TargetTimeRate（既有 journeyTimeRate 字段/T 键同源），
 *  读档后滑杆落在整档位——偏差登记：原版持久化滑杆原始 float */
export function timeRateSliderOf(rate: number): number {
  return Math.min(1, Math.max(0, (rate - 1) / 23));
}

/** 滑杆快捷档（ProvideSlider 文本点击 :931-946）：x1=0 / x12=0.5 / x24=1 */
export const TIME_RATE_PRESETS = { x1: 0, x12: 0.5, x24: 1 } as const;

// ---------------------------------------------------------------------------
// DifficultySliderPower（CreativePowers.cs:1007-1184）——旅程"给 NPC 的强度"滑杆
//   公式实现在 ScaleStats.ts strengthOfDifficultySlider（难度轴域，mainDifficulty
//   同文件消费；此处转发导出避免环导）。UpdateInfoFromSliderValueCache（:1023-1035）：
//     slider <= 0.33 → Remap(slider, 0, 0.33, 0.5, 1)
//     else           → Remap(slider, 0.33, 1, 1, 3)
//     再对 1/20 步进取整：(float)Math.Round(v * 20f) / 20f
// ---------------------------------------------------------------------------
/** 滑杆快捷档（AddIndication/Click_* :1048-1077）：大师 1 / 专家 0.66 / 经典 0.33 / 旅行 0 */
export const DIFFICULTY_PRESETS = { master: 1, expert: 0.66, normal: 0.33, journey: 0 } as const;

// ---------------------------------------------------------------------------
// SpawnRateSliderPerPlayerPower（CreativePowers.cs:1584-1749）
//   RemapSliderValueToPowerValue（:1612-1619）：
//     slider < 0.5 → Remap(slider, 0, 0.5, 0.1, 1)   （0.1× ~ 1×）
//     else         → Remap(slider, 0.5, 1, 1, 10)    （1× ~ 10×）
//   GetShouldDisableSpawnsFor（:1595-1606）：滑杆 == 0 → 完全禁用刷怪
//     （倍率仍是 0.1，禁用是独立门——NPC.cs:255-277 CanSpawnEnemiesNear）
// ---------------------------------------------------------------------------
export function spawnRateMultiplier(slider: number): number {
  if (slider < 0.5) return remap(slider, 0, 0.5, 0.1, 1);
  return remap(slider, 0.5, 1, 1, 10);
}

export function shouldDisableSpawns(slider: number): boolean {
  return slider === 0;
}

/** 滑杆快捷档（ProvideSlider :1683-1698）：x10=1 / x1=0.5 / x0=0（x0=禁用） */
export const SPAWN_RATE_PRESETS = { x10: 1, x1: 0.5, x0: 0 } as const;

// ---------------------------------------------------------------------------
// ModifyWindDirectionAndStrength（CreativePowers.cs:1186-1316）
//   UpdateInfoFromSliderValueCache（:1197）：wind = Lerp(-0.8, 0.8, slider)
//     （current=target 同置——推杆即得，不缓动）
//   GetSliderValueInner（:1202）：slider = GetLerpValue(-0.8, 0.8, windSpeedTarget)
//     （不钳位重载；windSpeedTarget 恒被 updateWind 钳在 ±0.8）
//   快捷档（:1254-1269）：西风(顶)=1 / 无风(中)=0.5 / 东风(底)=0
// ---------------------------------------------------------------------------
export function windOfSlider(slider: number): number {
  return lerpF(-0.8, 0.8, slider);
}

export function sliderOfWind(windSpeedTarget: number): number {
  return getLerpValue(-0.8, 0.8, windSpeedTarget);
}

export const WIND_PRESETS = { west: 1, none: 0.5, east: 0 } as const;

// ---------------------------------------------------------------------------
// ModifyRainPower（CreativePowers.cs:1318-1446）
//   UpdateInfoFromSliderValueCache（:1327-1337）：
//     slider == 0 → StopRain(instant)
//     else        → StartRain(instant, slider)（strengthOverride=maxRaining=cloudAlpha）
//   GetSliderValueInner（:1341）= Main.cloudAlpha
//   快捷档（:1393-1408）：雨季(顶)=1 / 细雨(中)=0.5 / 晴天(底)=0
// ---------------------------------------------------------------------------
export const RAIN_PRESETS = { monsoon: 1, drizzle: 0.5, clearSky: 0 } as const;

// ---------------------------------------------------------------------------
// FarPlacementRangePower（CreativePowers.cs:734-772）消费点 Player.cs:18636-18645：
//   tileRangeX(5) *= 2 → +8 = 18；tileRangeY(3) *= 2 → +8 = 14（每 tick 重置后重算）
// ---------------------------------------------------------------------------
export const FAR_PLACEMENT_RANGE_X = 18;
export const FAR_PLACEMENT_RANGE_Y = 14;
/** DefaultTileRangeX/Y（Player.cs 默认 5/3）——inTileRange 基础半扩 */
export const DEFAULT_TILE_RANGE_X = 5;
export const DEFAULT_TILE_RANGE_Y = 3;

/** Player.GetItemGrabRange 旅程加成（Player.cs:34709-34711）：+240 px（拾取范围） */
export const FAR_PLACEMENT_GRAB_BONUS = 240;

// ---------------------------------------------------------------------------
// 世界绑定（bindScaleStatsWorld 同款模式；Game.afterWorldLoad 注入 world.journeyPowers）
// ---------------------------------------------------------------------------
let bound: JourneyPowersState | null = null;

export function bindJourneyPowers(s: JourneyPowersState | null): void { bound = s; }

/** 未绑定 = 全默认（等价原版未进旅程世界时 power Reset 态） */
export function journeyPowers(): JourneyPowersState {
  return bound ?? createJourneyPowers();
}

/** Main.UpdateCreativeGameModeOverride（Main.cs:17238-17248）：
 *  旅程世界 + power 解锁（恒 true，GetIsUnlocked 全表 :703 等）→ 返回
 *  StrengthMultiplierToGiveNPCs；否则 null（_gameModeDifficultyOverride 复位）。
 *  gameMenu 态本仓不入（菜单里 slider 不可达） */
export function journeyDifficultyOverride(
  world: { isJourney?: boolean; journeyPowers?: JourneyPowersState } | null | undefined,
): number | null {
  if (!world?.isJourney) return null;
  return strengthOfDifficultySlider(world.journeyPowers?.difficultySlider ?? 0);
}
