// ============================================================================
// M9 旅程力量 + 研究进度联机同步（msg82 module 5/6/9）
// 标杆（Terarria1456）：
//   Terraria.GameContent.NetModules/NetCreativePowersModule.cs —— {u16 powerId,...}
//   Terraria.GameContent.NetModules/NetCreativePowerPermissionsModule.cs —— S→C
//     {byte 0, u16 powerId, byte level}（netMode==2 时拒收——纯下行）
//   Terraria.GameContent.NetModules/NetCreativeUnlocksPlayerReportModule.cs ——
//     C→S {byte userId, u16 itemId, u16 amount}；dedServ → Broadcast(..., exceptUserId)；
//     客户端收包：LocalPlayer.team>0 && 同队 → RegisterItemSacrifice
//   CreativePowerManager.cs —— 权威模型：Register 15 力量（id 0-14，:86-107 注册序）；
//     SyncThingsToJoiningPlayer（:167-181）= 入房下发 15 权限级 + 各力量当前态
//   CreativePowersHelper.IsAvailableForPlayer（:182-197）—— level 门：
//     LockedForEveryone=恒拒 / HostAlone=countsAsHostForGameplay / Everyone=放行
//   CreativeUI.SacrificeItem（:308-312）—— 献祭即上报（本地注册 + 发服务器）
//
// 与原版线格式的取舍（偏差登记，语义等价）：
//   原版每力量独立 powerId+子消息（per-player 开关位图 255 位 / shared toggle bool /
//   shared slider f32 / 按钮空载荷）。本仓单人实现把世界侧 6 力量聚合进
//   World.journeyPowers + journeyFreezeTime/journeyTimeRate 单对象（M8 前既定），
//   同步该聚合快照（sub0）而非逐力量差分——收敛语义与原版广播一致（每改动全员全量），
//   字节数 <40B。个人侧力量（godmode/放置范围/刷怪率）按原版语义逐玩家广播（sub1）。
// ============================================================================
import { Msg, NetModule, NetWriter, NetReader } from './protocol';
import type { JourneyPowersState } from '../world/JourneyPowers';

// ---------------------------------------------------------------------------
// 世界侧快照（module5 sub0）
// ---------------------------------------------------------------------------

/** 世界侧旅程力量 + 天气快照（S→C 权威态 / C→S 期望态） */
export interface JourneyWorldState {
  freezeTime: boolean;        // FreezeTimePower（world.journeyFreezeTime）
  timeRate: number;           // ModifyTimeRate TargetTimeRate 1-24（world.journeyTimeRate）
  freezeRain: boolean;        // FreezeRainPower.Enabled
  freezeWind: boolean;        // FreezeWindDirectionAndStrength.Enabled
  stopBiomeSpread: boolean;   // StopBiomeSpreadPower.Enabled
  difficultySlider: number;   // DifficultySliderPower 0-1 原始滑杆值
  windTarget: number;         // ModifyWindDirectionAndStrength（weather.windSpeedTarget）
  cloudAlpha: number;         // ModifyRainPower（GetSliderValueInner = Main.cloudAlpha）
}

/** sub0 载荷（C→S 与 S→C 同构；weather 段为非持久力量的当前态镜像） */
export function writeJourneyWorldState(s: JourneyWorldState): Uint8Array {
  const flags = (s.freezeTime ? 1 : 0) | (s.freezeRain ? 2 : 0)
    | (s.freezeWind ? 4 : 0) | (s.stopBiomeSpread ? 8 : 0);
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativePowers);
  w.u8(0);                              // sub0 = 世界态
  w.u8(flags);
  w.u8(Math.max(1, Math.min(24, Math.round(s.timeRate))));
  w.f32(s.difficultySlider);
  w.f32(s.windTarget);
  w.f32(s.cloudAlpha);
  return w.finish();
}

export function readJourneyWorldState(r: NetReader): JourneyWorldState {
  const flags = r.u8();
  return {
    freezeTime: !!(flags & 1),
    freezeRain: !!(flags & 2),
    freezeWind: !!(flags & 4),
    stopBiomeSpread: !!(flags & 8),
    timeRate: r.u8(),
    difficultySlider: r.f32(),
    windTarget: r.f32(),
    cloudAlpha: r.f32(),
  };
}

// ---------------------------------------------------------------------------
// 个人侧快照（module5 sub1；原版 APerPlayerTogglePower SyncOnePlayer + spawn slider）
// ---------------------------------------------------------------------------

export interface JourneyPersonalState {
  godmode: boolean;          // GodmodePower._perPlayerIsEnabled[slot]
  farPlacementRange: boolean;// FarPlacementRangePower（默认 true）
  spawnRateSlider: number;   // SpawnRateSliderPerPlayerPower 0-1（默认 0.5）
}

export function writeJourneyPersonalState(slot: number, s: JourneyPersonalState): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativePowers);
  w.u8(1);                              // sub1 = 个人态
  w.u8(slot);
  w.u8((s.godmode ? 1 : 0) | (s.farPlacementRange ? 2 : 0));
  w.f32(s.spawnRateSlider);
  return w.finish();
}

export function readJourneyPersonalState(r: NetReader): { slot: number; state: JourneyPersonalState } {
  const slot = r.u8();
  const flags = r.u8();
  return {
    slot,
    state: {
      godmode: !!(flags & 1),
      farPlacementRange: !!(flags & 2),
      spawnRateSlider: r.f32(),
    },
  };
}

// ---------------------------------------------------------------------------
// 时段跳跃（module5 sub2；StartDay/Noon/Night/MidnightImmediately——ASharedButtonPower
// 语义：无状态按钮，服务端校验权限后全员广播，各端本地 game.skipToTime）
// ---------------------------------------------------------------------------

/** which：1=黎明 2=正午 3=黄昏 4=午夜（registry id 1-4 语义位） */
export function writeJourneyTimeSkip(which: 1 | 2 | 3 | 4): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativePowers);
  w.u8(2);
  w.u8(which);
  return w.finish();
}

export function readJourneyTimeSkip(r: NetReader): 1 | 2 | 3 | 4 {
  const v = r.u8();
  return (v >= 1 && v <= 4 ? v : 0) as 1 | 2 | 3 | 4;
}

// ---------------------------------------------------------------------------
// 研究进度上报（module6；原版 {userId, itemId, amount}——userId 由服务器回填）
// ---------------------------------------------------------------------------

export function writeJourneyUnlockReport(itemId: number, amount: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativeUnlocksReport);
  w.u16(itemId & 0xffff);
  w.u16(Math.max(0, Math.min(0xffff, Math.round(amount))));
  return w.finish();
}

/** S→C 中继帧（含服务器权威 slot） */
export function writeJourneyUnlockRelay(slot: number, itemId: number, amount: number): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativeUnlocksReport);
  w.u8(slot);
  w.u16(itemId & 0xffff);
  w.u16(Math.max(0, Math.min(0xffff, Math.round(amount))));
  return w.finish();
}

export function readJourneyUnlockRelay(r: NetReader): { slot: number; itemId: number; amount: number } {
  return { slot: r.u8(), itemId: r.u16(), amount: r.u16() };
}

// ---------------------------------------------------------------------------
// 权限（module9；原版 {byte 0, u16 powerId, byte level}，S→C 专向 + 本仓房主上行）
// ---------------------------------------------------------------------------

export const enum PowerPermissionLevel {
  LockedForEveryone = 0,
  CanBeChangedByHostAlone = 1,
  CanBeChangedByEveryone = 2,
}

export const JOURNEY_POWER_COUNT = 15;   // CreativePowerManager.Initialize 注册序 :90-104

export function writeJourneyPermission(powerId: number, level: PowerPermissionLevel): Uint8Array {
  const w = new NetWriter(Msg.NetModules);
  w.u16(NetModule.CreativePowerPermissions);
  w.u8(0);                              // _setPermissionLevelId（原版恒 0）
  w.u16(powerId);
  w.u8(level);
  return w.finish();
}

export function readJourneyPermission(r: NetReader): { powerId: number; level: PowerPermissionLevel } {
  if (r.u8() !== 0) return { powerId: -1, level: PowerPermissionLevel.CanBeChangedByEveryone };
  const powerId = r.u16();
  const level = r.u8();
  return { powerId, level: (level >= 0 && level <= 2 ? level : 2) as PowerPermissionLevel };
}

/**
 * CreativePowersHelper.IsAvailableForPlayer（:182-197）。
 * @param isHost countsAsHostForGameplay 的本仓等价（netMode==0 单机恒 true）
 */
export function isPowerAvailableFor(
  level: PowerPermissionLevel,
  isHost: boolean,
): boolean {
  switch (level) {
    case PowerPermissionLevel.CanBeChangedByHostAlone:
      return isHost;
    case PowerPermissionLevel.CanBeChangedByEveryone:
      return true;
    default:
      return false;                     // LockedForEveryone（switch default :186-187）
  }
}

/** 世界态快照读取面（Game 注入 world+weather 的取值器——读写两侧共用） */
export interface JourneyWorldSource {
  journeyPowers: JourneyPowersState;
  journeyFreezeTime: boolean;
  journeyTimeRate: number;
  weather: {
    windSpeedTarget: number;
    cloudAlpha: number;
  };
}

export function snapshotJourneyWorld(w: JourneyWorldSource): JourneyWorldState {
  const jp = w.journeyPowers;
  return {
    freezeTime: w.journeyFreezeTime,
    timeRate: w.journeyTimeRate,
    freezeRain: jp.freezeRain,
    freezeWind: jp.freezeWind,
    stopBiomeSpread: jp.stopBiomeSpread,
    difficultySlider: jp.difficultySlider,
    windTarget: w.weather.windSpeedTarget,
    cloudAlpha: w.weather.cloudAlpha,
  };
}

/** 快照应用到本地世界（服务器权威态 / 本端期望态共用——幂等全量覆写）。
 *  雨段按 ModifyRainPower.UpdateInfoFromSliderValueCache（:1327-1337）：0 → StopRain
 *  (instant)，否则 StartRain(instant, slider)——raining/maxRaining/cloudAlpha 三态齐置。 */
export function applyJourneyWorldState(
  w: JourneyWorldSource & {
    journeyFreezeTime: boolean;
    journeyTimeRate: number;
    weather: {
      windSpeedTarget: number; cloudAlpha: number; windSpeedCurrent: number;
      stopRain(instant?: boolean): void;
      startRain(instant?: boolean, strengthOverride?: number): void;
    };
  },
  s: JourneyWorldState,
): void {
  w.journeyFreezeTime = s.freezeTime;
  w.journeyTimeRate = s.timeRate;
  const jp = w.journeyPowers;
  jp.freezeRain = s.freezeRain;
  jp.freezeWind = s.freezeWind;
  jp.stopBiomeSpread = s.stopBiomeSpread;
  jp.difficultySlider = s.difficultySlider;
  w.weather.windSpeedTarget = s.windTarget;
  w.weather.windSpeedCurrent = s.windTarget;   // ModifyWind :1197 current=target 同置
  if (s.cloudAlpha === 0) w.weather.stopRain(true);
  else w.weather.startRain(true, s.cloudAlpha);
}
