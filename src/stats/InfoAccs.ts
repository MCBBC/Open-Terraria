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

/** GetDrawInfoAccCount(Main.cs:47505-47553)等价——12 门禁命中计数。
 *  原版逐项 `gate && (!hideInfo[i] || playerInventory)`:本函数消费面=开包态
 *  装备列成就顾问 HasSpace 门(★BJ416,Main.cs:3019-3033 INFOACCCOUNT),开包态
 *  hideInfo 全放行 → 只建全计臂;HUD 态按 hideInfo 折算臂不建=登记偏差。 */
export function drawInfoAccCount(g: InfoAccGates): number {
  let n = 0;
  if (g.accWatch > 0) n++;
  if (g.accWeatherRadio) n++;
  if (g.accCalendar) n++;
  if (g.accFishFinder) n++;
  if (g.accOreFinder) n++;
  if (g.accCritterGuide) n++;
  if (g.accThirdEye) n++;
  if (g.accJarOfSouls) n++;
  if (g.accDreamCatcher) n++;
  if (g.accStopwatch) n++;
  if (g.accCompass > 0) n++;
  if (g.accDepthMeter > 0) n++;
  return n;
}

// ================= 雷达(第三只眼)敌怪计数谓词(Main.cs:47800-47816 1:1) =================

/** NPC.dontCountMe 全表——1457 NPC.cs SetDefaults 共 30 处赋 true(NPC.cs:8836/8865/
 *  8911/8929/8968/8988/9287/9305/10001/10019/10037/10055/10073/10139/10158/10194/
 *  10212/10725/10745/13201/14478/14497/14779/14798/14834/14853/15325/15343/17034/
 *  17053;1458 同表逐行核实)→ 32 id。★1456 旧表仅前 10 id(8/9/11/12/14/15/40/41/
 *  88/89)——1457 起新增 23 id(90-92/96/97/99/100/135/136/328/413/414/455-459/
 *  511/512/514/515/622/623,均为蠕虫段/Boss 部件族,各自 damage>0 且 lifeMax>5,
 *  漏排会使雷达把整条蠕虫逐段计入)。运行时无 SetDefaults 之外的赋值位
 *  (全库唯一读点=Main.cs:47813 雷达行);tests/radar-enemy-count.test.ts 反编译
 *  直读双版本(1457+1458)锁表。 */
export const NPC_DONT_COUNT_ME_1457: ReadonlySet<number> = new Set([
  8, 9, 11, 12, 14, 15,        // 1456 旧 6(蠕虫段族)
  40, 41, 88, 89,              // 1456 旧 4
  90, 91, 92,                  // ★1457 新增(NPC.cs:10037/10055/10073)
  96, 97, 99, 100,             // ★1457 新增(:10139/:10158/:10194/:10212)
  135, 136,                    // ★1457 新增 毁灭者体/尾段(:10725/:10745)
  328,                         // ★1457 新增 南瓜王之刃(:13201)
  413, 414,                    // ★1457 新增(:15325/:15343)
  455, 456, 457, 458, 459,     // ★1457 新增 教徒龙段族(:14478/:14497)
  511, 512, 514, 515,          // ★1457 新增(:14834/:14853/:14779/:14798)
  622, 623,                    // ★1457 新增 血鳗体/尾段(:17034/:17053)
]);

/** 雷达计数谓词(Main.cs:47813 逐门 1:1):`active && !friendly && damage>0 &&
 *  lifeMax>5 && !dontCountMe`。本仓映射:active=调用方 dead 门(实体桶无死体)、
 *  friendly=def.friendly(Enemy.ts:1341 fromVanilla 写入)、damage=def.damage
 *  (ScaleStats 缩放后基线,critter/friendly 恒 0≡原版 damage>0 门)、
 *  lifeMax=def.hp(=ScaleStats 后 npc.lifeMax;原版 :18192 弹体 NPC 外下限 6,
 *  故 >5 门对真怪恒真,真过滤=!friendly/damage/dontCountMe)、dontCountMe=
 *  NPC_DONT_COUNT_ME_1457。
 *  ★数据面勘误(2026-09-14,孢子蝙蝠实报):旧谓词读 `def.lifeMax`——EnemyDef 无
 *  此字段(fromVanilla 写 hp,:1347)→ 恒 undefined → `?? 0 > 5` 恒假 → 雷达对
 *  一切敌怪恒 0(「附近没有敌人」),孢子蝙蝠 634 实报即此总漏检面。
 *  距离门(<2000px)与 16 帧节流由调用方扫描环持有(InfoAccsLayer.tick)。 */
export function radarCountsEnemy(
  e: { vanillaId: number | null; def?: { friendly?: boolean; damage?: number; hp?: number } },
): boolean {
  const def = e.def;
  if (!def) return false;
  if (def.friendly === true) return false;
  if ((def.damage ?? 0) <= 0) return false;
  if ((def.hp ?? 0) <= 5) return false;
  return !(e.vanillaId != null && NPC_DONT_COUNT_ME_1457.has(e.vanillaId));
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
    /** GlobalTimeWrappedHourly 秒（★BJ330:GameTime 单源=Main.TotalGameTime 等价,暂停/失焦冻结——沙尘暴文字 5s 闪烁驱动） */
    globalTimeSec: number;
  };
  moonPhase: number; bloodMoon: boolean; eclipse: boolean;
  /** 渔情(bobber 在水时给缓存值;否则现算):null=未持有数据 */
  fishingText: string | null;
  /** 金属探测器:最近高优矿石的显示名;null=附近无 */
  oreText: string | null;
  /** 生命体分析仪:最近稀有生物名;null=附近无 */
  rareText: string | null;
  /** 稀有生物的原版 npc id(金色生物行染 OurFavoriteColor 判定用);null=无 */
  rareVid: number | null;
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
  /** "附近无 X"行:原版整行文字降灰 Color(100,100,100)(:46328/:46388/:46414/:46426/:46451) */
  grayed?: boolean;
  /** 金色生物行:文字染 OurFavoriteColor(255,231,69)(:46661-46672) */
  gold?: boolean;
}

const inter = (n: number) => Lang.inter(n);

/** Time 行(Main.cs:46182-46236):t/86400*24-19.5 换算+表级精度。
 *  显示风格按语言习惯(2026-08-31 用户拍板「按多语言习惯,中文按中文习惯」——
 *  显式偏离原版统一 12h 制):zh 系 = 中文时段词制(凌晨 0:31);
 *  de/fr/es/it/ru/pl/pt = 24 小时制主流(00:31);
 *  ja = 12h 官方词(午前/午後)+ 0 点制数字(CLRD ja 模式 aK:mm,K=0-11——
 *  日语主流「午前 0:31」,电视节目表/系统均 0 制,勿翻 12);
 *  en/ko 及未知语言 = 原版 12h(0 翻 12)+ 官方 AM/PM 等价词(AM / 오전,CLDR
 *  en a:h / ko a h 均 12 点制)。金标测试锁 vanilla 分支 */
export type WatchTimeStyle = 'vanilla' | 'h24' | 'period' | 'h12_0';

const TIME_STYLE_BY_PREFIX: ReadonlyArray<readonly [string, WatchTimeStyle]> = [
  ['zh', 'period'],
  ['de', 'h24'], ['fr', 'h24'], ['es', 'h24'], ['it', 'h24'],
  ['ru', 'h24'], ['pl', 'h24'], ['pt', 'h24'],
  ['ja', 'h12_0'],
];

/** 文化名(如 zh-Hans)→ 时间显示风格;未知/null 回原版 12h */
export function watchStyleOfCulture(culture: string | null | undefined): WatchTimeStyle {
  if (!culture) return 'vanilla';
  const c = culture.toLowerCase();
  for (const [p, s] of TIME_STYLE_BY_PREFIX) if (c.startsWith(p)) return s;
  return 'vanilla';
}

/** 中文时段分段(主流系统习惯):凌晨 0-5 / 早上 5-8 / 上午 8-12 / 中午 12-13 /
 *  下午 13-18 / 傍晚 18-19 / 晚上 19-24(词 = Mods.SandboxWorld.Time 的 Period 族键,
 *  l10n-custom 12 语言全量补键)。★键必须 switch 完整字面直书——l10n-audit 只
 *  抓 Lang.text('完整键') 字面量,字符串拼接会被截成假键报 MISSING
 *  (★本注释曾写裸前缀被 l10n-audit 误提 MISSING 键,已改写规避) */
function periodWord(seg: 0 | 1 | 2 | 3 | 4 | 5 | 6): string {
  switch (seg) {
    case 0: return Lang.text('Mods.SandboxWorld.Time.PeriodDawn');
    case 1: return Lang.text('Mods.SandboxWorld.Time.PeriodEarlyMorning');
    case 2: return Lang.text('Mods.SandboxWorld.Time.PeriodForenoon');
    case 3: return Lang.text('Mods.SandboxWorld.Time.PeriodNoon');
    case 4: return Lang.text('Mods.SandboxWorld.Time.PeriodAfternoon');
    case 5: return Lang.text('Mods.SandboxWorld.Time.PeriodDusk');
    default: return Lang.text('Mods.SandboxWorld.Time.PeriodNight');
  }
}

const PERIOD_BOUNDS: ReadonlyArray<readonly [number, 0 | 1 | 2 | 3 | 4 | 5 | 6]> = [
  [5, 0], [8, 1], [12, 2], [13, 3], [18, 4], [19, 5], [24, 6],
];

export function formatWatchText(mainTime: number, dayTime: boolean, watchLevel: number,
  style: WatchTimeStyle = watchStyleOfCulture(Lang.activeCultureName)): string {
  let t = mainTime;
  if (!dayTime) t += 54000;                    // :46189-46192(夜)
  t = t / 86400 * 24 - 19.5;                   // :46194-46197
  if (t < 0) t += 24;                          // :46198-46201
  const pm = t >= 12;
  let h = Math.floor(t);
  let m = Math.floor((t - h) * 60);
  const mm = m < 10 ? '0' + m : String(m);     // :46216-46219
  if (style === 'h24') {
    const ms = watchLevel === 1 ? '00' : watchLevel === 2 ? (m >= 30 ? '30' : '00') : mm;
    return `${String(h).padStart(2, '0')}:${ms}`;
  }
  if (style === 'period') {
    const ms = watchLevel === 1 ? '00' : watchLevel === 2 ? (m >= 30 ? '30' : '00') : mm;
    const seg = (PERIOD_BOUNDS.find(([lim]) => h < lim) ?? PERIOD_BOUNDS[PERIOD_BOUNDS.length - 1])[1];
    return `${periodWord(seg)} ${h}:${ms}`;
  }
  if (style === 'h12_0') {
    // 12h + 官方午前/午後词,数字 K = h%12 不翻 12(CLRD ja aK:mm):午前 0:31/午後 0:31
    const ms = watchLevel === 1 ? '00' : watchLevel === 2 ? (m >= 30 ? '30' : '00') : mm;
    return `${h % 12}:${ms} ${Lang.text(pm ? 'GameUI.TimePastMorning' : 'GameUI.TimeAtMorning')}`;
  }
  // 原版 12h 分支(Main.cs:47618-47640 逐行,勿动——金标 info-accs.test.ts 锁定)
  if (h > 12) h -= 12;                         // :46208-46215
  if (h === 0) h = 12;
  let ms = String(m);
  if (m < 10) ms = '0' + ms;                   // :46216-46219
  if (watchLevel === 1) ms = '00';             // :46222-46223(铜锡:恒整点)
  else if (watchLevel === 2) ms = m >= 30 ? '30' : '00'; // :46224-46227(银钨:半点)
  return `${h}:${ms} ${Lang.text(pm ? 'GameUI.TimePastMorning' : 'GameUI.TimeAtMorning')}`;
}

/** Weather 行(Main.cs:46238-46260):九档链 + 风 mph + 沙尘暴(文字 5s 闪烁) */
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
  const mph = Math.trunc(w.windSpeedCurrent * 50);   // :46252 `(int)(windSpeedCurrent*50f)` 截断
  if (mph < 0) s += Lang.text('GameUI.EastWind', Math.abs(mph));      // :46255-46258 官译键
  else if (mph > 0) s += Lang.text('GameUI.WestWind', mph);
  if (w.sandstorm) {
    // :46247-46251:沙尘暴中文字按真实墙钟 %10 ≥5 才显示(5s 亮 5s 灭)," +" 恒附
    if ((w.globalTimeSec % 3600) % 10 >= 5) s = Lang.text('GameUI.Sandstorm') + ' +';
    else s += ' +';
  }
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

/** Position 行(Main.cs:46504-46509):1 格 = 2 英尺。
 *  ★`(int)` 截断的是**整个表达式**(px/8 − maxTilesX)——负值向零截断,floor 会
 *  在地表以西多算 1 英尺(2026-08-25 对账勘误) */
export function formatCompassText(centerXpx: number, maxTilesX: number): string {
  const feet = Math.trunc((centerXpx * 2) / 16 - maxTilesX);
  if (feet === 0) return Lang.text('GameUI.CompassCenter');
  return Lang.text(feet > 0 ? 'GameUI.CompassEast' : 'GameUI.CompassWest', Math.abs(feet));
}

/** Depth 行(Main.cs:46512-46539):feet + 四地层。截断语义同罗盘——
 *  `(int)(bottom/8 − worldSurface×2)` 整式截断(负 = 地表以上,向零靠) */
export function formatDepthText(
  bottomYpx: number, centerYpx: number,
  worldSurface: number, rockLevel: number, maxTilesX: number, maxTilesY: number,
): string {
  let feet = Math.trunc((bottomYpx * 2) / 16 - worldSurface * 2);
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

/** 秒表 mph(Main.cs:46482-46497):avg px/tick × 216000/42240 + 液体修正;
 *  整块修正门 = !merman && !ignoreWater(:46484,水上行走态不视作游泳);
 *  水分支另有 !trident(手持三叉戟 277 免水中减速,Player.cs:12488-12491) */
export function mphOf(avgPxPerTick: number, wet: { honey: boolean; shimmer: boolean; water: boolean; merman: boolean; ignoreWater: boolean; trident: boolean }): number {
  let v = avgPxPerTick;
  if (!wet.merman && !wet.ignoreWater) {
    if (wet.honey) v /= 4;
    else if (wet.shimmer) v *= 0.375;
    else if (wet.water && !wet.trident) v /= 2;
  }
  return v * 216000 / 42240;
}

/** NPCID.Sets.GoldCrittersCollection(Terraria.ID/NPCID.cs:4450-4454):稀有行
 *  命中金色生物时文字染 OurFavoriteColor(255,231,69) */
const GOLD_CRITTERS = new Set([443, 442, 592, 593, 444, 601, 445, 446, 605, 447, 627, 613, 448, 539]);

/**
 * 12 行构造(分支序 1:1)。hidden=hideInfo[13];inventoryOpen 时隐藏行也产图标行
 * (原版 :46537-46592:背包内仍画隐藏项的图标供重新打开,不画文本)。
 */
export function buildInfoAccRows(ctx: InfoAccCtx, hidden: boolean[], inventoryOpen: boolean): InfoAccRow[] {
  const g = ctx.gates;
  const rows: InfoAccRow[] = [];
  const push = (icon: number, text: string, labelN: number, grayed?: boolean, gold?: boolean) => {
    const hideIndex = icon === 8 ? 7 : icon;
    if (!inventoryOpen && hidden[hideIndex]) return;
    rows.push({ row: rows.length, icon, hideIndex, text, label: inter(labelN), grayed, gold });
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
      : Lang.text('GameUI.NoTreasureNearby'), 104, ctx.oreText === null);
  }
  if (g.accCritterGuide) {
    // 金色生物(NPCID.Sets.GoldCrittersCollection)→ 行文字染金色(:46661-46672)
    push(11, ctx.rareText !== null ? ctx.rareText : Lang.text('GameUI.NoRareCreatures'), 105,
      ctx.rareText === null, ctx.rareVid !== null && GOLD_CRITTERS.has(ctx.rareVid));
  }
  if (g.accThirdEye) {
    push(5, ctx.enemyCount > 1
      ? Lang.text('GameUI.EnemiesNearby', ctx.enemyCount)
      : ctx.enemyCount === 1
        ? Lang.text('GameUI.OneEnemyNearby')
        : Lang.text('GameUI.NoEnemiesNearby'), 100, ctx.enemyCount <= 0);
  }
  if (g.accJarOfSouls) {
    push(6, ctx.killText !== null ? ctx.killText : Lang.text('GameUI.NoKillCount'), 101, ctx.killText === null);
  }
  if (g.accDreamCatcher) {
    push(12, ctx.dps > 0 ? Lang.text('GameUI.DPS', ctx.dps) : Lang.text('GameUI.NoDPS'), 106, ctx.dps <= 0);
  }
  if (g.accStopwatch && Number.isFinite(ctx.mph)) push(9, Lang.text('GameUI.Speed', Math.round(ctx.mph)), 103);
  if (g.accCompass > 0) push(3, formatCompassText(ctx.centerX, ctx.maxTilesX), 98);
  if (g.accDepthMeter > 0) {
    push(4, formatDepthText(ctx.bottomY, ctx.bottomY - 21, ctx.worldSurface, ctx.rockLevel, ctx.maxTilesX, ctx.maxTilesY), 99);
  }
  return rows;
}
