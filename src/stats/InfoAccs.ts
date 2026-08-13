// 信息类饰品门禁聚合 + DrawInfoAccs 12 行显示的纯数据层（全纯函数,可单测）。
// 原版锚点:门禁字段 Player.cs:2442-2476;刷新 RefreshInfoAccsFromItemType
// (Player.cs:12319-12400);显示 Main.DrawInfoAccs(Main.cs:46142-46665)。
// 行序 = else-if 分支序(:46180-46528):Time/Weather/MoonPhase/Fishing/Treasure/
// RareCreatures/CreatureCount/KillCount/DPS/Speed/Position/Depth;
// 图标序(≠行序):0表/1天气/2渔/3罗盘/4深度/5雷达/6击杀/7月相(血月日食用8)/
// 9秒表/10宝藏/11稀有/12DPS;hideInfo 按图标序且 num==8 归并 7(:46546-46548)。
import { Lang } from '../i18n/Lang';

/** Player.cs:2442-2476 的 12 门禁(数值型为 0=无;bool 型) */
export interface InfoAccGates {
  accWatch: number;        // 0无/1铜锡表/2银钨/3金铂(时间精度,:2444)
  accCompass: number;      // 罗盘 393
  accDepthMeter: number;   // 深度计 18
  accCalendar: boolean;    // 月相:六分仪 3096
  accFishFinder: boolean;  // 渔情:渔夫指南 3120
  accWeatherRadio: boolean; // 天气电台 3037
  accThirdEye: boolean;    // 生物数:雷达 3084
  accJarOfSouls: boolean;  // 击杀数:计数器 3095
  accCritterGuide: boolean; // 稀有生物:生命体分析仪 3118
  accStopwatch: boolean;   // 速度:秒表 3099
  accOreFinder: boolean;   // 宝藏:金属探测器 3102
  accDreamCatcher: boolean; // DPS:DPS 计 3119
}

export function emptyInfoAccGates(): InfoAccGates {
  return {
    accWatch: 0, accCompass: 0, accDepthMeter: 0,
    accCalendar: false, accFishFinder: false, accWeatherRadio: false,
    accThirdEye: false, accJarOfSouls: false, accCritterGuide: false,
    accStopwatch: false, accOreFinder: false, accDreamCatcher: false,
  };
}

/** 组合 OR 源(Player.cs:12373-12394):PDA/手机/贝壳手机全开,GPS/三大组合各开三项 */
const ALL_IN_ONE = [3123, 3124, 5358, 5359, 5360, 5361];

/** RefreshInfoAccsFromItemType(Player.cs:12319-12400)1:1——对单个物品 id 累积门禁 */
export function refreshInfoAccsFromItemType(g: InfoAccGates, accType: number): void {
  // 表级(:12336-12351:max 语义)
  if ((accType === 15 || accType === 707) && g.accWatch < 1) g.accWatch = 1;
  if ((accType === 16 || accType === 708) && g.accWatch < 2) g.accWatch = 2;
  if ((accType === 17 || accType === 709) && g.accWatch < 3) g.accWatch = 3;
  if (accType === 393) g.accCompass = 1;
  if (accType === 18) g.accDepthMeter = 1;
  // GPS/全开(:12356-12363):watch=3 + depth + compass
  if (accType === 395 || ALL_IN_ONE.includes(accType)) {
    g.accWatch = 3;
    g.accDepthMeter = 1;
    g.accCompass = 1;
  }
  // 渔情(:12365-12370)
  if (accType === 3120 || accType === 3036 || ALL_IN_ONE.includes(accType)) g.accFishFinder = true;
  // 天气(:12372-12377)
  if (accType === 3037 || accType === 3036 || ALL_IN_ONE.includes(accType)) g.accWeatherRadio = true;
  // 月相(:12379-12384)
  if (accType === 3096 || accType === 3036 || ALL_IN_ONE.includes(accType)) g.accCalendar = true;
  // 雷达(:12386-12391)
  if (accType === 3084 || accType === 3122 || ALL_IN_ONE.includes(accType)) g.accThirdEye = true;
  // 击杀(:12393-12398)
  if (accType === 3095 || accType === 3122 || ALL_IN_ONE.includes(accType)) g.accJarOfSouls = true;
  // 稀有(:12400-12405)
  if (accType === 3118 || accType === 3122 || ALL_IN_ONE.includes(accType)) g.accCritterGuide = true;
  // 秒表(:12407-12412)
  if (accType === 3099 || accType === 3121 || ALL_IN_ONE.includes(accType)) g.accStopwatch = true;
  // 金属探测(:12414-12419)
  if (accType === 3102 || accType === 3121 || ALL_IN_ONE.includes(accType)) g.accOreFinder = true;
  // DPS(:12421-12426)
  if (accType === 3119 || accType === 3121 || ALL_IN_ONE.includes(accType)) g.accDreamCatcher = true;
}

/** 装备侧便捷:一批 vanilla id → 聚合门禁(UpdateEquips :12486 语义) */
export function infoAccGatesOf(vanillaIds: Iterable<number>): InfoAccGates {
  const g = emptyInfoAccGates();
  for (const vid of vanillaIds) refreshInfoAccsFromItemType(g, vid);
  return g;
}

// ================= 行构造(Main.cs:46180-46539 分支序 1:1) =================

export interface InfoAccCtx {
  gates: InfoAccGates;
  /** Main.time 等价(0-86400 刻度;由 Clock.timeOfDay×86400 换算)与 dayTime */
  mainTime: number;
  dayTime: boolean;
  weather: {
    storming: boolean; maxRaining: number; cloudBGActive: number; numClouds: number;
    windSpeedCurrent: number; sandstorm: boolean;
  };
  moonPhase: number; bloodMoon: boolean; eclipse: boolean;
  /** 渔情(bobber 在水时给缓存值;否则现算):null=未持有数据 */
  fishingText: string | null;
  /** 金属探测器:最近高优矿石的显示名;null=附近无 */
  oreText: string | null;
  /** 生命体分析仪:最近稀有生物名;null=附近无 */
  rareText: string | null;
  /** 雷达:敌怪数;-1=无数据 */
  enemyCount: number;
  /** 击杀计数:"{名}: {n}";null=无数据 */
  killText: string | null;
  /** DPS 值;-1=N/A */
  dps: number;
  /** 秒表 mph(已含液体修正);NaN=无数据 */
  mph: number;
  /** 玩家中心 X(格)、脚底 Y(格) */
  centerX: number; bottomY: number;
  worldSurface: number; rockLevel: number;
  maxTilesX: number; maxTilesY: number;
}

export interface InfoAccRow {
  /** 行序(0-11) */
  row: number;
  /** 图标序(0-12;月相血月/日食为 8) */
  icon: number;
  /** hideInfo 下标(图标序,8 已归并 7) */
  hideIndex: number;
  /** 行文本(已本地化) */
  text: string;
  /** 原版行标签 tooltip(Lang.inter 95-106 → LegacyInterface) */
  label: string;
}

const inter = (n: number) => Lang.inter(n);

/** Time 行(Main.cs:46182-46236):t/86400*24-19.5 换算+表级精度 */
export function formatWatchText(mainTime: number, dayTime: boolean, watchLevel: number): string {
  let t = mainTime;
  if (!dayTime) t += 54000;                    // :46189-46192(夜)
  t = t / 86400 * 24 - 19.5;                   // :46194-46197
  if (t < 0) t += 24;                          // :46198-46201
  const pm = t >= 12;
  let h = Math.floor(t);
  let m = Math.floor((t - h) * 60);
  if (h > 12) h -= 12;
  if (h === 0) h = 12;                         // :46208-46215
  let ms = String(m);
  if (m < 10) ms = '0' + ms;                   // :46216-46219
  if (watchLevel === 1) ms = '00';             // :46222-46223(铜锡:恒整点)
  else if (watchLevel === 2) ms = m >= 30 ? '30' : '00'; // :46224-46227(银钨:半点)
  return `${h}:${ms} ${Lang.text(pm ? 'GameUI.TimePastMorning' : 'GameUI.TimeAtMorning')}`;
}

/** Weather 行(Main.cs:46238-46260):九档链 + 风 mph + 沙尘暴 */
export function formatWeatherText(w: InfoAccCtx['weather']): string {
  let s: string;
  if (w.storming) s = Lang.text('GameUI.Storm');
  else if (w.maxRaining > 0.6) s = Lang.text('GameUI.HeavyRain');
  else if (w.maxRaining >= 0.2) s = Lang.text('GameUI.Rain');
  else if (w.maxRaining > 0) s = Lang.text('GameUI.LightRain');
  else if (w.cloudBGActive > 0) s = Lang.text('GameUI.Overcast');
  else if (w.numClouds > 90) s = Lang.text('GameUI.MostlyCloudy');
  else if (w.numClouds > 55) s = Lang.text('GameUI.Cloudy');
  else if (w.numClouds <= 15) s = Lang.text('GameUI.Clear');
  else s = Lang.text('GameUI.PartlyCloudy');
  const mph = Math.round(w.windSpeedCurrent * 50);   // :46252(1 mph = 0.02)
  if (mph !== 0) s += ` (${Math.abs(mph)} mph ${mph < 0 ? 'E' : 'W'})`; // :46255-46258
  if (w.sandstorm) s += Lang.text('GameUI.Sandstorm') + ' +';
  return s;
}

/** MoonPhase 行(Main.cs:46262-46292):血月夜/日食昼只换图标为 8,
 *  文本恒为月相名(原版分支只改 num,text2 走 moonPhase 名链) */
export function formatMoonPhase(moonPhase: number, bloodMoon: boolean, eclipse: boolean, dayTime: boolean): { icon: 7 | 8; text: string } {
  const icon: 7 | 8 = (bloodMoon && !dayTime) || (eclipse && dayTime) ? 8 : 7;
  const names = ['GameUI.FullMoon', 'GameUI.WaningGibbous', 'GameUI.ThirdQuarter', 'GameUI.WaningCrescent',
    'GameUI.NewMoon', 'GameUI.WaxingCrescent', 'GameUI.FirstQuarter', 'GameUI.WaxingGibbous'];
  return { icon, text: Lang.text(names[moonPhase & 7]) };
}

/** Position 行(Main.cs:46504-46509):1 格 = 2 英尺 */
export function formatCompassText(centerXpx: number, maxTilesX: number): string {
  const feet = Math.floor((centerXpx * 2) / 16) - maxTilesX;
  if (feet === 0) return Lang.text('GameUI.CompassCenter');
  return Lang.text(feet > 0 ? 'GameUI.CompassEast' : 'GameUI.CompassWest', Math.abs(feet));
}

/** Depth 行(Main.cs:46512-46539):feet + 四地层 */
export function formatDepthText(
  bottomYpx: number, centerYpx: number,
  worldSurface: number, rockLevel: number, maxTilesX: number, maxTilesY: number,
): string {
  let feet = Math.floor((bottomYpx * 2) / 16) - worldSurface * 2;
  const k = (maxTilesX / 4200) ** 2;
  const spaceRatio = (centerYpx / 16 - (65 + 10 * k)) / (worldSurface / 5);
  const layer =
    bottomYpx > (maxTilesY - 204) * 16 ? Lang.text('GameUI.LayerUnderworld')
      : bottomYpx > rockLevel * 16 ? Lang.text('GameUI.LayerCaverns')
        : feet > 0 ? Lang.text('GameUI.LayerUnderground')
          : spaceRatio < 1 ? Lang.text('GameUI.LayerSpace')
            : Lang.text('GameUI.LayerSurface');
  feet = Math.abs(feet);
  const d = feet !== 0 ? Lang.text('GameUI.Depth', feet) : Lang.text('GameUI.DepthLevel');
  return `${d} ${layer}`;
}

/** 秒表 mph(Main.cs:46449-46499):avg px/tick × 216000/42240 + 液体修正 */
export function mphOf(avgPxPerTick: number, wet: { honey: boolean; shimmer: boolean; water: boolean; merman: boolean }): number {
  let v = avgPxPerTick;
  if (wet.honey) v /= 4;
  else if (wet.shimmer) v *= 0.375;
  else if (wet.water && !wet.merman) v /= 2;
  return v * 216000 / 42240;
}

/**
 * 12 行构造(分支序 1:1)。hidden=hideInfo[13];inventoryOpen 时隐藏行也产图标行
 * (原版 :46537-46592:背包内仍画隐藏项的图标供重新打开,不画文本)。
 */
export function buildInfoAccRows(ctx: InfoAccCtx, hidden: boolean[], inventoryOpen: boolean): InfoAccRow[] {
  const g = ctx.gates;
  const rows: InfoAccRow[] = [];
  const push = (icon: number, text: string, labelN: number) => {
    const hideIndex = icon === 8 ? 7 : icon;
    if (!inventoryOpen && hidden[hideIndex]) return;
    rows.push({ row: rows.length, icon, hideIndex, text, label: inter(labelN) });
  };
  if (g.accWatch > 0) push(0, formatWatchText(ctx.mainTime, ctx.dayTime, g.accWatch), 95);
  if (g.accWeatherRadio) push(1, formatWeatherText(ctx.weather), 96);
  if (g.accCalendar) {
    const mp = formatMoonPhase(ctx.moonPhase, ctx.bloodMoon, ctx.eclipse, ctx.dayTime);
    push(mp.icon, mp.text, 102);
  }
  if (g.accFishFinder && ctx.fishingText !== null) push(2, ctx.fishingText, 97);
  if (g.accOreFinder) {
    push(10, ctx.oreText !== null
      ? Lang.text('GameUI.OreDetected', ctx.oreText)
      : Lang.text('GameUI.NoTreasureNearby'), 104);
  }
  if (g.accCritterGuide) {
    push(11, ctx.rareText !== null ? ctx.rareText : Lang.text('GameUI.NoRareCreatures'), 105);
  }
  if (g.accThirdEye) {
    push(5, ctx.enemyCount > 1
      ? Lang.text('GameUI.EnemiesNearby', ctx.enemyCount)
      : ctx.enemyCount === 1
        ? Lang.text('GameUI.OneEnemyNearby')
        : Lang.text('GameUI.NoEnemiesNearby'), 100);
  }
  if (g.accJarOfSouls) {
    push(6, ctx.killText !== null ? ctx.killText : Lang.text('GameUI.NoKillCount'), 101);
  }
  if (g.accDreamCatcher) {
    push(12, ctx.dps > 0 ? Lang.text('GameUI.DPS', ctx.dps) : Lang.text('GameUI.NoDPS'), 106);
  }
  if (g.accStopwatch && Number.isFinite(ctx.mph)) push(9, Lang.text('GameUI.Speed', Math.round(ctx.mph)), 103);
  if (g.accCompass > 0) push(3, formatCompassText(ctx.centerX, ctx.maxTilesX), 98);
  if (g.accDepthMeter > 0) {
    push(4, formatDepthText(ctx.bottomY, ctx.bottomY - 21, ctx.worldSurface, ctx.rockLevel, ctx.maxTilesX, ctx.maxTilesY), 99);
  }
  return rows;
}
