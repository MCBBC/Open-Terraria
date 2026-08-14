// 原版天气系统 1:1 移植（Terarria1456 Main.cs UpdateWeather/StartRain/StopRain/
// ChangeRain/updateCloudLayer + Sandstorm.cs 全量）。纯逻辑无 DOM——单测与双端共用。
// dayRate 语义：原版 Main.dayRate（正常游戏 =1），所有 tick 数按 60Hz 计。
// 注意 RNG 边界：原版 rand.Next(a,b) 左闭右开；本仓库 RNG.int(a,b) 闭区间 → 移植为 int(a, b-1)。
import { RNG } from '../../core/rng';

/** 天气更新所需的外部上下文（由 Game 每帧填充） */
export interface WeatherCtx {
  /** 时间流速（正常 1；我们时钟 30 分钟/日制不影响——tick 语义独立） */
  dayRate: number;
  /** 是否白天（原版 Main.dayTime） */
  dayTime: boolean;
  /** 白天 tick 进度 0-54000（原版 Main.time；史莱姆雨自然触发门 time<27000） */
  dayTimeTicks: number;
  /** 玩家生命上限 ≥120（雨/风的强度门，NPC.cs:64362/58248） */
  playerStrongEnough: boolean;
  /** 任意玩家就绪打史莱姆王（Main.cs:64645：statLifeMax>140 且 defense>8） */
  playerReadyForKingSlime: boolean;
  /** 专家模式（史莱姆雨刷怪表/频率） */
  expertMode: boolean;
  /** 地表开阔度 0-1（原版 atmo = (y/16-(65+10×(maxTilesX/4200)²))/(worldSurface/5)，UpdateAtmosphereTransparencyToSkyColor Main.cs:62622） */
  atmo: number;
  /** 玩家在岩石层以上（闪电触发门，UpdateWeather L58202） */
  aboveRockLayer: boolean;
  /** 墓园视觉强度 0-1（SceneState.UpdateGraveyard：lerp(16,36,GraveyardTileCount) 向目标 0.02/0.1 逼近） */
  graveyardIntensity: number;
  /** 困难模式（沙尘暴频率门） */
  hardMode: boolean;
  /** 事件冲突门（史莱姆雨不与血月/日食/入侵/南瓜霜月同开，Main.cs:7003） */
  noOtherEvent: boolean;
  /** 杀过史莱姆王（自然触发频率门） */
  downedSlimeKing: boolean;
  /** 世界宽 tile（金币雨数额/atmo 公式用） */
  maxTilesX: number;
  /** 世界地表线 tile（atmo 公式） */
  worldSurface: number;
  /** 视口中心 Y px（atmo 公式的 y） */
  viewCenterY: number;
  /** Main.BackgroundEnabled（Main.cs:790，设置项"背景: 开/关"，默认 true）。
   *  cloudBGAlpha 渐变门（Main.cs:58783）；缺省 true 与原版默认一致 */
  backgroundEnabled?: boolean;
  /** 灯笼夜当夜态（LanternNight.LanternsUp）：阴天层清零+云量钳 30（Main.cs:64288）、
   *  下雨立即停（:64331）、风场停掷（:58249）。缺省 false */
  lanternsUp?: boolean;
  /** 灯笼夜预约态（NextNightIsLanternNight）：无雨时不新开雨（Main.cs:64353） */
  nextNightIsLanternNight?: boolean;
  /** 金币雨掉落回调（WorldGen.cs:71817-71858：type 71 银/72 金/73 铂金） */
  onCoinRain?: (x: number, y: number, type: 71 | 72 | 73, stack: number) => void;
  /** 雷声落点回调（thunderDelay 归零时；参数 = 与玩家的距离 px，已含方向由 Game 决定播放） */
  onThunder?: (distancePx: number) => void;
  /** 开始下雨（公告/toast；false=instant 切换不发） */
  onRainStart?: () => void;
  /** 沙尘暴开始/结束 */
  onSandstormToggle?: (happening: boolean) => void;
  /** 史莱姆雨开始/结束公告 */
  onSlimeRainToggle?: (happening: boolean) => void;
  /** 玩家在雪原带（SceneMetrics.ZoneSnow，SceneMetrics.cs:682）——暴风雪双轨门
   *  （SceneState.cs:101 flag = ZoneRain && ZoneSnow）；缺省 false */
  zoneSnow?: boolean;
  /** SceneMetrics.ZoneRain（SceneMetrics.cs:700 = Main.raining && SurfaceAtmospherics；
   *  cs:703-705 ZoneSandstorm 成立时置 false）——暴风雪双轨门的雨半边（SceneState.cs:102
   *  flag = ZoneRain && ZoneSnow）。地下玩家恒 false → 暴风雪环境音静默。
   *  缺省 undefined 时回退 this.raining（= 接线前的旧行为，露天近似） */
  zoneRain?: boolean;
  /** 玩家在背景墙后（SceneMetrics.BehindBackwall，:671 wall>0）——室外强度
   *  outsideWeatherEffectIntensity 门（:190-191 向 1.1/-0.1 以 0.005/tick 逼近）；
   *  缺省 false（露天） */
  behindBackwall?: boolean;
  /** 旅程力量·冻结风况（CreativePowers.FreezeWindDirectionAndStrength.Enabled，
   *  CreativePowers.cs:1482；消费 Main.cs:58247——true 时 windCounter 重掷整段
   *  跳过，current→target 缓动仍跑）。缺省 false */
  freezeWind?: boolean;
  /** 旅程力量·冻结雨情（CreativePowers.FreezeRainPower.Enabled，CreativePowers.cs:1516；
   *  消费 Main.cs:64329/:64357——true 时雨不停/不换挡/不新开）。缺省 false */
  freezeRain?: boolean;
  /** 天气环境音循环音量下发（每帧；Sfx 常驻轨 setVolume 跟随） */
  onAmbience?: (v: WeatherLoopVolumes) => void;
  /** 金币雨玩家锚定（WorldGen.cs:71825 FindClosest 的单机等价；active/dead 门在 Weather 内判） */
  playerForCoinRain?: { x: number; active: boolean; dead: boolean };
}

/** 原版风/暴雨判定阈值（Main.cs:66137-66140 MainCSS 构造区） */
export const WIND_MIN = 0.34;
export const WIND_MAX = 0.4;
export const RAIN_MIN = 0.4;
export const RAIN_MAX = 0.5;

// ================= 天气环境音循环轨（纯逻辑，无 DOM） =================

/** 各循环轨目标音量 0-1（原版语义：
 *  暴风雪双轨 = SceneState.cs:235-297；雨环境音 = MusicID 28 RainAmbience，MusicID.cs:68）
 *  sandstorm 轨原版无专属 wav（Sandstorm 只有视觉 shader + 风场 BGM）——音量照算，
 *  素材侧 Sfx.playLoop('sandstormWind') 恒 null，登记待素材 */
export interface WeatherLoopVolumes {
  /** 雨环境音：cloudAlpha×atmo（cloudAlpha 向 maxRaining 缓动 Main.cs:17142-17168 → 随雨强） */
  rain: number;
  /** blizzard_strong_loop（室外强暴风雪轨）= min(1,cloudAlpha×2)×室外强度×blizzardSoundVolume（SceneState.cs:253） */
  blizzardStrong: number;
  /** blizzard_inside_building_loop（墙内掩蔽轨）= (1-上式)×blizzardSoundVolume（:276） */
  blizzardInside: number;
  /** 沙暴风轨（缺素材登记）：severity×室外强度（Sandstorm.Severity，Sandstorm.cs） */
  sandstorm: number;
}

// ================= 存档持久化（纯数据，旧档缺省=晴） =================

/** wld 头与本存档共用的天气快照 */
export interface WeatherSave {
  raining: boolean;
  rainTime: number;
  maxRaining: number;
  cloudBGActive: number;
  numClouds: number;
  windSpeedTarget: number;
  sand: { happening: boolean; timeLeft: number; severity: number; intendedSeverity: number };
  coinRain?: number;
  slimeRain?: boolean;
  slimeRainTime?: number;
  slimeRainKillCount?: number;
}

export function weatherToSave(w: WeatherState): WeatherSave {
  return {
    raining: w.raining, rainTime: w.rainTime, maxRaining: w.maxRaining,
    cloudBGActive: w.cloudBGActive, numClouds: w.numClouds, windSpeedTarget: w.windSpeedTarget,
    sand: {
      happening: w.sandstorm.happening, timeLeft: w.sandstorm.timeLeft,
      severity: w.sandstorm.severity, intendedSeverity: w.sandstorm.intendedSeverity,
    },
    coinRain: w.coinRain,
    slimeRain: w.slimeRain,
    slimeRainTime: w.slimeRainTime,
    slimeRainKillCount: w.slimeRainKillCount,
  };
}

/** 回填（读档/wld 导入）；cloudAlpha/windCurrent 由缓动自然收敛 */
export function applyWeatherSave(w: WeatherState, s: Partial<WeatherSave>): void {
  if (s.raining !== undefined) w.raining = s.raining;
  if (s.rainTime !== undefined) w.rainTime = s.rainTime;
  if (s.maxRaining !== undefined) w.maxRaining = s.maxRaining;
  if (s.cloudBGActive !== undefined) w.cloudBGActive = s.cloudBGActive;
  if (s.numClouds !== undefined) { w.numClouds = s.numClouds; w.numCloudsTemp = s.numClouds; }
  if (s.windSpeedTarget !== undefined) w.windSpeedTarget = s.windSpeedTarget;
  if (s.sand) {
    if (s.sand.happening !== undefined) w.sandstorm.happening = s.sand.happening;
    if (s.sand.timeLeft !== undefined) w.sandstorm.timeLeft = s.sand.timeLeft;
    if (s.sand.severity !== undefined) w.sandstorm.severity = s.sand.severity;
    if (s.sand.intendedSeverity !== undefined) w.sandstorm.intendedSeverity = s.sand.intendedSeverity;
  }
  if (s.coinRain !== undefined) w.coinRain = s.coinRain;
  if (s.slimeRain !== undefined) w.slimeRain = s.slimeRain;
  if (s.slimeRainTime !== undefined) w.slimeRainTime = s.slimeRainTime;
  if (s.slimeRainKillCount !== undefined) w.slimeRainKillCount = s.slimeRainKillCount;
}

export class WeatherState {
  /** 天气周期计数（到点落盘云量并重掷 3600-10800，UpdateWeather 尾段） */
  weatherCounter = 3600;
  raining = false;
  rainTime = 0;
  /** 目标雨强 0-1（ChangeRain 掷出） */
  maxRaining = 0;
  /** 当前云雨浓度（向 maxRaining 缓动；IsItRaining = cloudAlpha>0，Main.cs:2659） */
  cloudAlpha = 0;
  /** 阴天覆盖（updateCloudLayer：0→大正数衰减到 1→负数消散回 0） */
  cloudBGActive = 0;
  /** 阴天渐变 0-1（Main.cs:58778-58791：由 cloudBGActive 正负驱动 ±0.0005×dayRate） */
  cloudBGAlpha = 0;
  numClouds = 200;
  numCloudsTemp = this.numClouds;
  windSpeedTarget = 0;
  windSpeedCurrent = 0;
  windCounter = 0;
  extremeWindCounter = 0;
  /** 闪电白 0-1（天空背景色向白 lerp，Main.cs:63346） */
  lightning = 0;
  lightningSpeed = 0;
  lightningDecay = 0;
  thunderDelay = 0;
  thunderDistance = 0;
  /** 风日/暴雨 BGM 门（UpdateWindyDayState 12924） */
  shouldUseWindyDayMusic = false;
  shouldUseStormMusic = false;

  sandstorm = new SandstormState();
  /** 金币雨余量（Main.cs:1266；StartRain 1/25 触发，雨停/风暴即清零） */
  coinRain = 0;
  /** 史莱姆雨（Main.cs:1115-1120）：flag/倒计时（正=进行中，负=冷却向 0 回升）/击杀计数 */
  slimeRain = false;
  slimeRainTime = 0;
  slimeRainKillCount = 0;
  /** 瓢虫雨 boost（Main.cs：ladybug 幸运套装驱动；无幸运系统时恒 0——字段位保留）。
   *  接线（luck 批）：杀瓢虫 604/605 +1800 钳 18000（LadyBugKilled cs:82334-82338），
   *  雨 schedule 第三分支 1/num2 提前开雨（:64384）+ UpdateTime 按 dayRate 衰减（:64296） */
  ladyBugRainBoost = 0;
  /** 墓园视觉强度镜像（Game 每帧从 graveyardIntensity 下发；渲染端 ProcessCloudAlpha 用） */
  graveyardVisual = 0;
  /** 暴风雪循环轨渐入渐出（SceneState.cs:252 _blizzardSoundVolume：MoveTowards(flag?1:0, 0.01)/帧） */
  blizzardSoundVolume = 0;
  /** 室外天气效果强度（SceneState.cs:190-191：BehindBackwall ? -0.1 : 1.1，
   *  0.005/帧 逼近后钳 0-1 → outsideWeatherEffectIntensity） */
  outsideWeatherEffect = 1;
  // （雨点落水涟漪池已退役 2026-08-14：自创"水面扩散椭圆环"近似与原版双画——
  //  原版雨落水只有 Rain.Update 的 splash 尘(Rain.cs:120-133,WeatherRenderer 已 1:1);
  //  Ripples.png 是水体扭曲 shader 掩码非独立视觉,canvas 2D 无扭曲通道不做）

  /** RNG（可注入固定种子做单测） */
  private rng: RNG;

  constructor(seed?: number) {
    this.rng = new RNG(seed ?? ((Math.random() * 1e9) | 0));
    // 开局初值（Main.cs:10801-10802）
    this.windSpeedCurrent = this.rng.int(-800, 800) * 0.001;
    this.windSpeedTarget = this.windSpeedCurrent;
    this.numClouds = this.rng.int(0, 199);
    this.numCloudsTemp = this.numClouds;
    this.resetWindCounter(true);
    this.weatherCounter = this.rng.int(3600, 10799);
  }

  // ================= 原版公开操作（Main.cs:64107-64210） =================

  stopRain(instant = false) {
    this.rainTime = 0;
    this.raining = false;
    this.maxRaining = 0;
    if (instant) this.cloudAlpha = 0;
  }

  startRain(instant = false, strengthOverride?: number) {
    // 金币雨 1/25（Main.cs:64131-64137：数额 = Next(75,151)×10000×maxTilesX/4200）
    const range = 25;
    if (this.rng.int(0, range - 1) === 0) {
      this.coinRain = Math.round(this.rng.int(75, 150) * 100 * 100 * (this.maxTilesXRef / 4200));
      this.coinRainPending = true;
    }
    const num2 = 86400;
    const num3 = num2 / 24; // 3600 = 1 游戏小时(tick)
    let num4 = this.rng.int(num3 * 8, num2 - 1);
    if (this.rng.int(0, 2) === 0) num4 += this.rng.int(0, num3 - 1);
    if (this.rng.int(0, 3) === 0) num4 += this.rng.int(0, num3 * 2 - 1);
    if (this.rng.int(0, 4) === 0) num4 += this.rng.int(0, num3 * 2 - 1);
    if (this.rng.int(0, 5) === 0) num4 += this.rng.int(0, num3 * 3 - 1);
    if (this.rng.int(0, 6) === 0) num4 += this.rng.int(0, num3 * 4 - 1);
    if (this.rng.int(0, 7) === 0) num4 += this.rng.int(0, num3 * 5 - 1);
    let num5 = 1;
    if (this.rng.int(0, 1) === 0) num5 += 0.05;
    if (this.rng.int(0, 2) === 0) num5 += 0.1;
    if (this.rng.int(0, 3) === 0) num5 += 0.15;
    if (this.rng.int(0, 4) === 0) num5 += 0.2;
    this.rainTime = Math.round(num4 * num5);
    this.changeRain(instant, strengthOverride);
    this.raining = true;
  }

  /** 按云量/阴天状态掷目标雨强（Main.cs:64201 ChangeRain） */
  changeRain(instant = false, strengthOverride?: number) {
    let val: number;
    if (strengthOverride !== undefined) {
      val = strengthOverride;
    } else if (this.cloudBGActive >= 1 || this.numClouds > 150) {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(40, 90) * 0.01 : this.rng.int(20, 90) * 0.01;
    } else if (this.numClouds > 100) {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(20, 60) * 0.01 : this.rng.int(10, 70) * 0.01;
    } else {
      val = this.rng.int(0, 2) !== 0 ? this.rng.int(5, 30) * 0.01 : this.rng.int(5, 40) * 0.01;
    }
    this.maxRaining = val;
    if (instant) this.cloudAlpha = this.maxRaining;
  }

  /** 金币雨公告待处理标志（StartRain 1/25；Game 消费后清零） */
  coinRainPending = false;
  /** 世界宽（金币雨数额比例用；Game attach 时回填） */
  maxTilesXRef = 4200;

  // ================= 每帧主更新（UpdateWeather L58124 + updateCloudLayer + 17142 段） =================

  /** 每 tick 调用（60Hz；暂停/菜单不调） */
  update(ctx: WeatherCtx) {
    this.maxTilesXRef = ctx.maxTilesX;
    // 灯笼夜天空压制（UpdateTime 头段 Main.cs:64288-64294）：阴天层直接清零，
    // 云量超 30 钳回 30——灯笼夜是晴朗夜
    if (ctx.lanternsUp) {
      this.cloudBGActive = 0;
      if (this.numClouds > 30) this.numClouds = 30;
      if (this.numCloudsTemp > 30) this.numCloudsTemp = 30;
    }
    // 瓢虫雨加成衰减（Main.cs:64296-64299 UpdateTime：杀瓢虫累积的提前降雨余量）
    if (this.ladyBugRainBoost > 0) this.ladyBugRainBoost -= ctx.dayRate;
    this.updateLightningTimers(ctx);
    this.updateWind(ctx);
    this.updateCloudAlpha(ctx);
    this.updateCloudBG();
    this.updateCloudCounts();
    this.updateRainSchedule(ctx);
    this.updateMusicGates(ctx.dayTimeTicks / 54000 * 0.5 + (ctx.dayTime ? 0.25 : 0.75) % 1 || 0.5);
    this.sandstorm.update(ctx, this.rng, this.windSpeedCurrent);
    this.updateCoinRain(ctx);
    this.updateSlimeRain(ctx);
    this.updateAmbienceLoops(ctx);
  }

  // ================= 天气环境音循环（SceneState.cs:190-191/235-297） =================

  /** MoveTowards（SceneState 同名助手）：向 target 以 amount/tick 逼近 */
  private static moveTowards(cur: number, target: number, amount: number): number {
    return cur < target ? Math.min(target, cur + amount) : Math.max(target, cur - amount);
  }

  /** 每帧平滑 + 下发循环音量（update 尾段调用） */
  private updateAmbienceLoops(ctx: WeatherCtx): void {
    const dayRate = Math.max(1, ctx.dayRate);
    // 室外强度（SceneState.cs:190-191）：露天 1.1 / 墙内 -0.1，0.005/tick 逼近后钳 0-1
    this.outsideWeatherEffect = Math.max(0, Math.min(1,
      WeatherState.moveTowards(this.outsideWeatherEffect, ctx.behindBackwall ? -0.1 : 1.1, 0.005 * dayRate)));
    // 暴风雪轨渐入（SceneState.cs:252）：flag = ZoneRain && ZoneSnow（:101-102）→ ±0.01/tick
    // ZoneRain = Main.raining && SurfaceAtmospherics（SceneMetrics.cs:700）——ctx.zoneRain
    // 由 SceneMetrics 派生（接线清单）；缺省回退 this.raining（旧露天近似）
    const blizzard = (ctx.zoneRain ?? this.raining) && (ctx.zoneSnow ?? false);
    this.blizzardSoundVolume = WeatherState.moveTowards(
      this.blizzardSoundVolume, blizzard ? 1 : 0, 0.01 * dayRate);
    ctx.onAmbience?.(this.loopVolumes(ctx.atmo));
  }

  /** 各循环轨目标音量（纯读状态；Sfx 侧常驻轨 setVolume 跟随） */
  loopVolumes(atmo = 1): WeatherLoopVolumes {
    // SceneState.cs:253 num13 = min(1, cloudAlpha×2) × outsideWeatherEffectIntensity
    const num13 = Math.min(1, this.cloudAlpha * 2) * this.outsideWeatherEffect;
    return {
      // 雨环境音（MusicID 28）：随 cloudAlpha（→maxRaining 缓动）× 露天可见度
      rain: Math.max(0, Math.min(1, this.cloudAlpha * Math.max(0, Math.min(1, atmo)))),
      blizzardStrong: num13 * this.blizzardSoundVolume,
      blizzardInside: (1 - num13) * this.blizzardSoundVolume,
      // 沙暴：severity 0-1（Sandstorm.UpdateSeverity :115-130）×室外强度——素材侧缺 wav
      sandstorm: this.sandstorm.happening
        ? Math.max(0, Math.min(1, this.sandstorm.severity)) * this.outsideWeatherEffect
        : 0,
    };
  }

  /** 金币雨掉落（WorldGen.cs:71811-71858） */
  private updateCoinRain(ctx: WeatherCtx) {
    if (this.coinRain <= 0) return;
    if (!this.raining || this.shouldUseStormMusic) { this.coinRain = 0; return; }
    if (this.rng.int(0, 29) !== 0) return;
    // 全图随机 x、顶部 5% 高度带（:71818-71823）
    let x = this.rng.int(50, ctx.maxTilesX - 51) * 16;
    const y = this.rng.int(0, Math.floor(this.maxTilesYRef * 0.05) - 1) * 16;
    // 玩家锚定（:71825-71832）：最近玩家活跃且未死 且 1/2 → x = player.X ± 2400，
    // 钳 [800, (maxTilesX-50)*16]。★此前整段缺失（金币总在全图随机处掉落）
    const p = ctx.playerForCoinRain;
    if (p && p.active && !p.dead && this.rng.int(0, 1) === 0) {
      x = p.x + this.rng.int(-2400, 2400);
    }
    x = Math.max(800, Math.min((ctx.maxTilesX - 50) * 16, x));
    // 非实心 32×32 门由 Game 落点回调侧判定（此处只出提案）
    let type: 71 | 72 | 73 = 71;
    let stack = this.rng.int(50, 99);
    let worth = stack;
    if (this.rng.int(0, 2) === 0) { type = 72; stack = this.rng.int(25, 99); worth = stack * 100; }
    if (this.rng.int(0, 8) === 0) { type = 73; stack = 1; worth = 1 * 100 * 100; }
    ctx.onCoinRain?.(x, y, type, stack);
    this.coinRain -= worth;
    if (this.coinRain < 0) this.coinRain = 0;
  }
  private maxTilesYRef = 1200;
  /** 世界高（金币雨 y 带；Game attach 时回填） */
  setWorldSize(w: number, h: number) { this.maxTilesXRef = w; this.maxTilesYRef = h; }

  /** 史莱姆雨调度（Main.cs:64305-64323 时间推进 + 64368-64412 自然触发） */
  private updateSlimeRain(ctx: WeatherCtx) {
    if (this.slimeRainTime > 0) {
      this.slimeRainTime -= ctx.dayRate;
      if (this.slimeRainTime <= 0) this.stopSlimeRain(ctx);
    } else if (this.slimeRainTime < 0) {
      this.slimeRainTime += ctx.dayRate;
      if (this.slimeRainTime > 0) this.slimeRainTime = 0;
    }
    if (this.slimeRain || !ctx.dayTime || ctx.dayTimeTicks >= 27000 || !ctx.noOtherEvent) return;
    // 自然触发（L64373-64409）：num3 = 450000/dayRate；未杀王 /2；困难 ×1.5；
    // 玩家未就绪 ×5；门 = (就绪 || 专家) 且掷中
    let num3 = Math.floor(450000 / Math.max(1, ctx.dayRate));
    if (!ctx.downedSlimeKing) num3 = Math.floor(num3 / 2);
    if (ctx.hardMode) num3 = Math.floor(num3 * 1.5);
    const ready = ctx.playerReadyForKingSlime;
    if (!ready) num3 *= 5;
    if (num3 > 0 && (ready || ctx.expertMode) && this.rng.int(0, num3 - 1) === 0) {
      this.startSlimeRain(ctx);
    }
  }

  /** StartSlimeRain（Main.cs:64213-64241 netMode 0 主干） */
  startSlimeRain(ctx?: WeatherCtx) {
    if (this.slimeRain) return;
    this.slimeRainTime = this.rng.int(32400, 53999);
    this.slimeRain = true;
    this.slimeRainKillCount = 0;
    ctx?.onSlimeRainToggle?.(true);
  }

  /** StopSlimeRain（Main.cs:64248-64273）：冷却 = -Next(3024,6047)×100 */
  stopSlimeRain(ctx?: WeatherCtx) {
    if (!this.slimeRain) return;
    this.slimeRainTime = -this.rng.int(3024, 6047) * 100;
    this.slimeRain = false;
    ctx?.onSlimeRainToggle?.(false);
  }

  /** 史莱姆雨击杀推进（NPC.cs:79880-79897 DoDeathEvents_AdvanceSlimeRain：
   *  slimeRainNPC 表仅 [1]；阈值 150，杀过王减半 75；≥阈值 → 出王并置 -阈值/2）。
   *  场上无王门（AnyNPCs(50)）由调用方（Game）判 boss 槽近似 */
  advanceSlimeRainKill(vanillaNpcId: number, downedSlimeKing = false): boolean {
    if (!this.slimeRain || vanillaNpcId !== 1) return false;
    let num = 150;
    if (downedSlimeKing) num = Math.floor(num / 2);        // :79886 downed → 75
    this.slimeRainKillCount++;
    if (this.slimeRainKillCount >= num) {
      this.slimeRainKillCount = -Math.floor(num / 2);      // :79894 置 -75/-37 冷却段
      return true;
    }
    return false;
  }

  /** 闪电计时（UpdateWeather L58129-58170） */
  private updateLightningTimers(ctx: WeatherCtx) {
    if (this.thunderDelay > 0) {
      this.thunderDelay--;
      if (this.thunderDelay === 0) {
        ctx.onThunder?.(this.thunderDistance * 15);
      }
    }
    if (this.lightningSpeed > 0) {
      this.lightning += this.lightningSpeed;
      if (this.lightning >= 1) { this.lightning = 1; this.lightningSpeed = 0; }
    } else if (this.lightning > 0) {
      this.lightning -= this.lightningDecay;
      if (this.lightning < 0) this.lightning = 0;
    } else if (this.thunderDelay <= 0 && ctx.aboveRockLayer && ctx.atmo === 1) {
      // 触发门：暴雨或强墓园（L58202-58213）
      if (this.shouldUseStormMusic) {
        let num3 = 600, num4 = 1600;
        if (this.maxRaining > 0.8) { num3 *= 0.6; num4 *= 0.8; }
        if (this.maxRaining > 0.7) { num3 *= 0.7; num4 *= 0.9; }
        if (this.maxRaining > 0.6) { num3 *= 0.8; num4 *= 0.95; }
        const w = Math.abs(this.windSpeedTarget);
        if (w > 0.7) { num3 *= 0.6; num4 *= 0.8; }
        if (w > 0.6) { num3 *= 0.7; num4 *= 0.9; }
        if (w > 0.5) { num3 *= 0.8; num4 *= 0.95; }
        let num5 = this.rng.int(Math.round(num3), Math.round(num4));
        num5 *= (1 - this.maxRaining + 1) / 2;
        num5 *= (1 - this.windSpeedTarget + 1) / 2;
        if (this.rng.int(0, Math.max(1, Math.round(num5)) - 1) === 0) this.newLightning();
      } else if (ctx.graveyardIntensity >= 0.9) {
        if (this.rng.int(0, 119) === 0) this.newLightning();
      }
    }
  }

  /** NewLightning（Main.cs:58095-58120） */
  newLightning(instant = false) {
    if (this.rng.int(0, 2) === 0) this.thunderDelay = this.rng.int(1, 30);
    else if (this.rng.int(0, 1) === 0) this.thunderDelay = this.rng.int(31, 120);
    else this.thunderDelay = this.rng.int(11, 60);
    this.thunderDistance = this.thunderDelay;
    this.lightningDecay = this.rng.range(0, 0.05) + 0.008;
    this.lightningSpeed = this.rng.range(0, 0.05) + 0.05;
    if (instant) {
      this.lightningSpeed = 0.2;
      this.thunderDelay = 1;
      this.thunderDistance = 0;
    }
  }

  /** 风场（UpdateWeather L58219-58347） */
  private updateWind(ctx: WeatherCtx) {
    // current 向 target×(1+5/9×maxRaining) 逼近（L58221-58237）
    const target = this.windSpeedTarget * (1 + 5 / 9 * this.maxRaining);
    const step = 0.0003 + Math.abs(target - this.windSpeedCurrent) * 0.0015;
    if (this.windSpeedCurrent < target) {
      this.windSpeedCurrent += step;
      if (this.windSpeedCurrent > target) this.windSpeedCurrent = target;
    } else if (this.windSpeedCurrent > target) {
      this.windSpeedCurrent -= step;
      if (this.windSpeedCurrent < target) this.windSpeedCurrent = target;
    }
    // windCounter 掷 target 增量（L58252-58295）——灯笼夜整段跳过（Main.cs:58249：
    // LanternsUp → return；风场保持当前值漂移到既定 target，不再重掷）；
    // 旅程冻结风况同门（Main.cs:58247 !FreezeWindDirectionAndStrength.Enabled 才进）
    if (ctx.lanternsUp || ctx.freezeWind) return;
    this.windCounter--;
    if (this.windCounter <= 0) {
      const prevSign = this.windSpeedTarget < 0 ? -1 : 1;
      // 增量三级（L58278-58290）：if Next(4)==0 ±25；【else-if 再掷】Next(2)==0 ±50；
      // 否则 ±100——两掷分布 = ±25 1/4 / ±50 3/8 / ±100 3/8。
      // ★曾单掷三段映射（1/4, 1/2, 1/4）= 分布偏差（±50 过多/±100 过少）
      if (this.rng.int(0, 3) === 0) this.windSpeedTarget += this.rng.int(-25, 25) * 0.001;
      else if (this.rng.int(0, 1) === 0) this.windSpeedTarget += this.rng.int(-50, 50) * 0.001;
      else this.windSpeedTarget += this.rng.int(-100, 100) * 0.001;
      if (!ctx.playerStrongEnough && Math.abs(this.windSpeedTarget) > 0.35) {
        this.windSpeedTarget = 0.35 * Math.sign(this.windSpeedTarget);
      }
      this.extremeWindCounter--;
      if (this.extremeWindCounter <= 0) {
        this.resetWindCounter(true);
        if (this.rng.int(0, 29) < 13) {
          if (this.rng.int(0, 1) === 0) {
            this.windSpeedTarget = 0;
            this.windCounter = this.rng.int(7200, 28800);
          } else {
            this.windSpeedTarget = this.rng.int(-200, 200) * 0.001;
          }
        } else if (this.rng.int(0, 19) < 13) {
          this.windSpeedTarget = this.rng.int(-400, 400) * 0.001;
        } else {
          this.windSpeedTarget = this.rng.int(-850, 850) * 0.001;
        }
        if (!ctx.playerStrongEnough && Math.abs(this.windSpeedTarget) > 0.35) {
          this.windSpeedTarget = 0.35 * Math.sign(this.windSpeedTarget);
        }
        if (Math.abs(this.windSpeedTarget) > 0.3) this.extremeWindCounter += this.rng.int(5, 10);
        if (Math.abs(this.windSpeedTarget) > 0.5) this.extremeWindCounter += this.rng.int(10, 20);
        if (Math.abs(this.windSpeedTarget) > 0.7) this.extremeWindCounter += this.rng.int(15, 30);
      } else {
        this.resetWindCounter();
      }
      // 反向 2/3 概率翻回（L58336-58339）
      if (this.rng.int(0, 2) !== 0 && ((prevSign < 0 && this.windSpeedTarget > 0) || (prevSign > 0 && this.windSpeedTarget < 0))) {
        this.windSpeedTarget *= -1;
      }
    }
    if (this.windSpeedTarget > 0.8) this.windSpeedTarget = 0.8;
    if (this.windSpeedTarget < -0.8) this.windSpeedTarget = -0.8;
  }

  /** ResetWindCounter（Main.cs:58085-58093） */
  resetWindCounter(resetExtreme = false) {
    this.windCounter = this.rng.int(900, 2700);
    if (resetExtreme) this.extremeWindCounter = this.rng.int(10, 30);
  }

  /** cloudAlpha/cloudBGAlpha 缓动（Main.cs:17142-17168 + 58778-58791，每帧） */
  private updateCloudAlpha(ctx: WeatherCtx) {
    const step = 0.0005 * Math.max(1, ctx.dayRate);
    if (this.raining) {
      if (this.cloudAlpha > this.maxRaining) {
        this.cloudAlpha -= step;
        if (this.cloudAlpha < this.maxRaining) this.cloudAlpha = this.maxRaining;
      } else if (this.cloudAlpha < this.maxRaining) {
        this.cloudAlpha += step;
        if (this.cloudAlpha > this.maxRaining) this.cloudAlpha = this.maxRaining;
      }
    } else {
      this.cloudAlpha -= step;
      if (this.cloudAlpha < 0) this.cloudAlpha = 0;
    }
    // cloudBGAlpha（阴天渐变）门（Main.cs:58776-58791）：
    //   !drunkWorldGen && ShouldDrawSurfaceBackground() && BackgroundEnabled
    //   && screenPosition.Y/16 <= worldSurface + 10
    // drunkWorldGen/ShouldDrawSurfaceBackground 的 remix·drunk·全屏地图分支本仓库
    // 无对应体系（恒真），保留 BackgroundEnabled 设置项与深度门
    if ((ctx.backgroundEnabled ?? true) && ctx.viewCenterY / 16 <= ctx.worldSurface + 10) {
      if (this.cloudBGActive > 0) {
        this.cloudBGAlpha += step;
        if (this.cloudBGAlpha > 1) this.cloudBGAlpha = 1;
      } else {
        this.cloudBGAlpha -= step;
        if (this.cloudBGAlpha < 0) this.cloudBGAlpha = 0;
      }
    }
  }

  /** updateCloudLayer（Main.cs:13112-13166） */
  private updateCloudBG() {
    const num = 86400;
    const num2 = num / 24;
    const num3 = Math.max(1, 1 + 4 * this.cloudAlpha);
    if (this.cloudBGActive > 0) {
      if (this.cloudBGActive > 1) this.cloudBGActive -= 1 / num3;
      if (this.cloudBGActive < 1) this.cloudBGActive = 1;
      if (this.cloudBGActive === 1 && this.rng.int(0, Math.round((num2 * 2) * num3) - 1) === 0) {
        this.cloudBGActive = -this.rng.int(num2 * 4, num * 4 - 1);
      }
      return;
    }
    if (this.cloudBGActive < 0) {
      this.cloudBGActive += num3;
      if (this.raining) this.cloudBGActive += 2 * num3;
    }
    if (this.cloudBGActive > 0) this.cloudBGActive = 0;
    if (this.cloudBGActive === 0 && this.rng.int(0, Math.round(num2 * 12 / num3) - 1) === 0) {
      this.cloudBGActive = this.rng.int(num2 * 3, num * 2 - 1);
    } else if (this.shouldUseStormMusic) {
      this.cloudBGActive = this.rng.int(num2, num2 * 4 - 1);
    }
  }

  /** 云量漂移 + 天气周期落盘（UpdateWeather L58341-58403） */
  private updateCloudCounts() {
    if (this.rng.int(0, 59) === 0) this.numCloudsTemp += this.rng.int(-1, 1);
    if (this.rng.int(0, 999) < 50 * this.cloudBGAlpha) this.numCloudsTemp++;
    if (this.rng.int(0, 1299) < 25 * (1 - this.cloudBGAlpha)) this.numCloudsTemp--;
    if (this.rng.int(0, 999) < 200 * this.cloudAlpha && this.numCloudsTemp < 100) this.numCloudsTemp++;
    if (this.rng.int(0, 999) < 50 * this.cloudAlpha) this.numCloudsTemp++;
    if (this.numCloudsTemp > 66 && this.rng.int(0, 99) === 0) this.numCloudsTemp -= this.rng.int(1, 2);
    if (this.numCloudsTemp < 50 && this.rng.int(0, 99) === 0) this.numCloudsTemp += this.rng.int(1, 2);
    if (this.cloudBGActive <= 0 && this.numCloudsTemp > 100 && this.cloudAlpha === 0) this.numCloudsTemp = 100;
    if (this.numCloudsTemp < -20) this.numCloudsTemp = -20;
    // 下雨时云量强制爬升（L58390-58398）
    if (this.cloudAlpha > 0 && this.numClouds < 200 * this.cloudAlpha) {
      while (this.numClouds < 200 * this.cloudAlpha) {
        this.numClouds += this.rng.int(0, 29);
        if (this.numClouds > 200) this.numClouds = 200;
        if (this.numCloudsTemp < this.numClouds) this.numCloudsTemp = this.numClouds;
      }
    }
    this.weatherCounter--;
    if (this.weatherCounter <= 0) {
      if (this.rng.int(0, 1) === 0) {
        if (this.rng.int(0, 1) === 0) this.numCloudsTemp += this.rng.int(0, 249);
        else this.numCloudsTemp += this.rng.int(0, 99);
      }
      if (this.numCloudsTemp < 0) this.numCloudsTemp = 0;
      if (this.numCloudsTemp > 200) this.numCloudsTemp = 200;
      this.numClouds = this.numCloudsTemp;
      this.weatherCounter = this.rng.int(3600, 10799);
    }
  }

  /** 雨调度（UpdateTime 段 Main.cs:64327-64390） */
  private updateRainSchedule(ctx: WeatherCtx) {
    if (this.raining) {
      // 旅程冻结雨情（Main.cs:64329 !FreezeRainPower.Enabled 才推进——雨不停/
      // 不换挡；灯笼夜停雨同受冻结门压制 :64331 在门内）
      if (ctx.freezeRain) return;
      // 灯笼夜落雨立即停（Main.cs:64331-64335：LanternsUp → StopRain，不改雨强渐变）
      if (ctx.lanternsUp) { this.stopRain(); return; }
      this.rainTime -= ctx.dayRate;
      if (ctx.dayRate > 0) {
        const num = Math.floor(86400 / ctx.dayRate / 24); // 3600
        if (this.rainTime <= 0) {
          this.stopRain();
        } else if (this.rng.int(0, num * 2 - 1) === 0) {
          this.changeRain();
        }
      }
    } else {
      // 灯笼夜当夜或次夜预约都不开新雨（Main.cs:64353 else-if 门）
      if (ctx.lanternsUp || ctx.nextNightIsLanternNight) return;
      const num2 = Math.floor(86400 / Math.max(1, ctx.dayRate));
      // 旅程冻结门（Main.cs:64357 flag = !FreezeRainPower.Enabled && dayRate != 0）
      let canStart = ctx.dayRate !== 0 && !ctx.freezeRain && ctx.playerStrongEnough;
      if (canStart) {
        if (this.rng.int(0, Math.round(num2 * 5.75) - 1) === 0) this.tryStartRain(ctx);
        else if (this.cloudBGActive >= 1 && this.rng.int(0, Math.round(num2 * 4.25) - 1) === 0) this.tryStartRain(ctx);
        // 瓢虫雨加成（Main.cs:64384-64386：杀瓢虫累积余量 >0 时 1/num2 提前开雨）
        else if (this.ladyBugRainBoost > 0 && this.rng.int(0, num2 - 1) === 0) this.tryStartRain(ctx);
      }
    }
  }

  private tryStartRain(ctx: WeatherCtx) {
    this.startRain();
    ctx.onRainStart?.();
  }

  /** UpdateWindyDayState（Main.cs:12924-12961）：BGM 门。
   *  原版 time∈(10800,43200)（白天 tick/54000）= 我们 timeOfDay∈(0.35,0.65) */
  updateMusicGates(timeOfDay01 = 0.5) {
    const midDay = timeOfDay01 > 0.35 && timeOfDay01 < 0.65;
    if (this.cloudAlpha === 0) {
      this.shouldUseStormMusic = false;
      const w = Math.abs(this.windSpeedTarget);
      if (!midDay) {
        this.shouldUseWindyDayMusic = false;
      } else if (w < WIND_MIN) {
        this.shouldUseWindyDayMusic = false;
      } else if (w >= WIND_MAX) {
        this.shouldUseWindyDayMusic = true;
      }
    } else {
      if (this.cloudAlpha < RAIN_MIN || Math.abs(this.windSpeedTarget) < WIND_MIN) {
        this.shouldUseStormMusic = false;
      } else if (this.cloudAlpha >= RAIN_MAX && Math.abs(this.windSpeedTarget) >= WIND_MAX) {
        this.shouldUseStormMusic = true;
      }
      this.shouldUseWindyDayMusic = false;
    }
  }

  /** UI 天气词（Main.cs:46236 八档链；风句/沙暴闪句由消费端 Renderer 拼接——
   *  原版 :46240-46254 GlobalTimeWrappedHourly%10≥5 才显词、恒加 " +"） */
  statusText(): string {
    if (this.slimeRain) return 'SlimeRain';
    if (this.shouldUseStormMusic) return 'Storm';
    if (this.maxRaining > 0.6) return 'HeavyRain';
    if (this.maxRaining >= 0.2) return 'Rain';
    if (this.maxRaining > 0) return 'LightRain';
    if (this.cloudBGActive > 0) return 'Overcast';
    if (this.numClouds > 90) return 'MostlyCloudy';
    if (this.numClouds > 55) return 'Cloudy';
    if (this.numClouds <= 15) return 'Clear';
    return 'PartlyCloudy';
  }
}

/** 沙尘暴（Sandstorm.cs 全量） */
export class SandstormState {
  happening = false;
  timeLeft = 0;
  severity = 0;
  intendedSeverity = 0;

  update(ctx: WeatherCtx, rng: RNG, windSpeedCurrent: number) {
    if (this.happening) {
      if (this.timeLeft > 86400) this.timeLeft = 0;
      this.timeLeft -= ctx.dayRate;
      // HasSufficientWind（Sandstorm.cs:22）：|windSpeedCurrent|≥0.6；风停立即结束
      if (Math.abs(windSpeedCurrent) < 0.6) this.timeLeft -= 15 * ctx.dayRate;
      if (windSpeedCurrent === 0) this.timeLeft = 0;
      if (this.timeLeft <= 0) this.stop(rng, ctx);
    } else {
      // 频率门（Sandstorm.cs:53-63）：21600×(困难 2:3)，需风足够
      if (Math.abs(windSpeedCurrent) >= 0.6) {
        const num = 21600 * (ctx.hardMode ? 2 : 3);
        for (let i = 0; i < Math.max(1, ctx.dayRate); i++) {
          if (rng.int(0, num - 1) === 0) {
            this.start(rng);
            ctx.onSandstormToggle?.(true);
          }
        }
      }
    }
    if (rng.int(0, 17999) === 0) this.changeSeverityIntentions(rng, this.happening);
    this.updateSeverity();
  }

  start(rng: RNG) {
    this.happening = true;
    this.timeLeft = rng.int(28800, 86400);
    this.changeSeverityIntentions(rng, true);
  }

  stop(rng: RNG, ctx: WeatherCtx) {
    this.happening = false;
    this.timeLeft = 0;
    this.changeSeverityIntentions(rng, false);
    ctx.onSandstormToggle?.(false);
  }

  /** ChangeSeverityIntentions（Sandstorm.cs:99-112） */
  changeSeverityIntentions(rng: RNG, happening: boolean) {
    if (happening) {
      this.intendedSeverity = 0.4 + rng.next();
    } else if (rng.int(0, 2) === 0) {
      this.intendedSeverity = 0;
    } else {
      this.intendedSeverity = rng.next() * 0.3;
    }
  }

  /** UpdateSeverity（Sandstorm.cs:115-130）：0.003/tick 向意图逼近 */
  updateSeverity() {
    if (Number.isNaN(this.severity)) this.severity = 0;
    if (Number.isNaN(this.intendedSeverity)) this.intendedSeverity = 0;
    const dir = Math.sign(this.intendedSeverity - this.severity);
    this.severity = Math.min(1, Math.max(0, this.severity + 0.003 * dir));
    const dir2 = Math.sign(this.intendedSeverity - this.severity);
    if (dir !== dir2) this.severity = this.intendedSeverity;
  }
}
