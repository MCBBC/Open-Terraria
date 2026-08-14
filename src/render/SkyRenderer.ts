// 天空渲染：昼夜渐变、太阳/月亮、星星、云
// 注意:Clock 必须值导入——DAWN/DUSK 是运行时常量,import type 会被擦除
// (:528/:561 运行时取值 → "Clock is not defined" 每帧崩渲染循环)
import { Clock } from '../world/World';
import { Clock as ClockVal } from '../world/World';

/** 天空实体染色缓存（GetColor RGB × 贴图 multiply 预染；键含 1/16 量化色档） */
const AMB_TINT_CACHE = new Map<string, HTMLCanvasElement>();
import { shade, mix } from '../assets/Palette';
import { LanternNight } from '../world/LanternNight';
import { UnifiedRandom } from '../core/rng';

// 天空关键色 [时刻, 顶色, 底色]（时刻 0-1）
const SKY_KEYS: Array<[number, string, string]> = [
  [0.0, '#050A1E', '#0E1630'],   // 午夜
  [0.22, '#050A1E', '#1A2440'],  // 黎明前
  [0.27, '#3A4A8A', '#E89A5A'],  // 日出
  [0.35, '#4A8AD4', '#A8D4F0'],  // 上午
  [0.5, '#4A90E0', '#B8DCF5'],   // 正午
  [0.65, '#4A8AD4', '#A8D0E8'],  // 下午
  [0.73, '#4A5A9A', '#E88A5A'],  // 日落
  [0.78, '#101838', '#2A2448'],  // 黄昏后
  [0.85, '#050A1E', '#0E1630'],  // 夜
  [1.0, '#050A1E', '#0E1630'],
];

function lerpColor(a: string, b: string, t: number): string {
  return mix(a, b, t);
}

/** 原版日月贴图(Main.cs:62279 DrawSunAndMoon):Sun.png 整图 114×114;
 *  Moon_N.png 50×400 竖条 = 8 个相位帧(moonType 0-8 选表,moonPhase 选帧) */
function loadTex(name: string): HTMLImageElement {
  const im = new Image();
  im.src = `sprites/vanilla/${name}`;
  return im;
}

/** 原版云（Cloud.cs 语义）：贴图五族 Cloud_0-3 常态/4-8 高层薄云/9-13 远空灰云/
 *  14-17 低空白云/18-21 雨云·风暴云（addCloud 选型链 Cloud.cs:114-138）、
 *  scale 0.70-1.31、风驱动 ±9*parallax px/帧、旋转微摆 ±0.02、按 scale 三层深度
 *  （远景压暗 R 通道）、AABB 拒绝重叠生成、淡入淡出。 */
interface VanillaCloud {
  type: number;
  x: number; y: number;         // 像素（y 为屏幕上部带）
  scale: number;
  rot: number; rSpeed: number;
  alpha: number;
  flip: boolean;
  kill: boolean;
}

/** 云选型链结果（pickCloudType 返回） */
export interface CloudTypePick {
  type: number;
  /** 风暴云（18-21）大块上移量：scale≥1.15 → 150、scale≥1 → 150，两档叠加（Cloud.cs:118-125） */
  stormShift: number;
}

/** #rrggbb → [r,g,b]（atmo 相乘）——云色链的 ColorOfTheSkies 换算 */
function hexRGB(hex: string, atmo = 1): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) * atmo, ((v >> 8) & 255) * atmo, (v & 255) * atmo];
}

/** Utils.GetLerpValue（Utils.cs）钳位版本：from>to 时单调递减（淡出段用） */
function lerpValueClamped(from: number, to: number, t: number): number {
  if (from === to) return t < from ? 0 : 1;
  return Math.max(0, Math.min(1, (t - from) / (to - from)));
}

/**
 * 云贴图选型链（Cloud.cs addCloud :114-138 五族 1:1，纯函数供测试）：
 *  ① 雨云/风暴云：cloudAlpha>0 且 3/4 概率，或阴天（cloudBGActive≥1）且 1/2 概率
 *     → type 18-21（贴图 Cloud_18-21，530×218 级大块云，故整体上移腾位置）；
 *  ② 远空灰云 9-13：晴天无雨、scale<1、高位、云量≤80 时；
 *  ③ 高层薄云 4-8：高空或小 scale 高位，云量>70 或阴天；
 *  ④ 低空白云 14-17：低位 + 1/2 概率 + 云量>20；
 *  ⑤ 缺省 0-3 常态云。
 *  注意 9-13 在下雨/阴天转为 kill（Cloud.cs Update :449-452）——它们是"晴天远空灰云"，
 *  雨天出场的深色云是 18-21（任务描述里"Cloud_9-13 深雨云"系误记，以源码为准）。
 *  稀有云 22-40（:139-146 → RollRareCloud）见 rollRareCloud，已实装。
 */
export function pickCloudType(i: {
  scale: number; y: number; viewH: number;
  numClouds: number; cloudAlpha: number; cloudBGActive: number;
  rnd: () => number;
}): CloudTypePick {
  const r = i.rnd;
  let type = Math.floor(r() * 4);                                    // :114 Next(4)
  let stormShift = 0;
  if ((i.cloudAlpha > 0 && Math.floor(r() * 4) !== 0) || (i.cloudBGActive >= 1 && Math.floor(r() * 2) === 0)) {
    // :115-126 —— C# || 短路：第一支为真时第二支的 Next(2) 不掷（rnd 序列对齐）
    type = 18 + Math.floor(r() * 4);                                 // :117 Next(18,22)
    if (i.scale >= 1.15) stormShift += 150;                          // :118-120
    if (i.scale >= 1) stormShift += 150;                             // :122-124
  } else if (i.cloudBGActive <= 0 && i.cloudAlpha === 0 && i.scale < 1
    && i.y < -i.viewH * 0.15 && i.numClouds <= 80) {
    type = 9 + Math.floor(r() * 5);                                  // :129 Next(9,14)
  } else if (((i.scale < 1.15 && i.y < -i.viewH * 0.3) || (i.scale < 0.85 && i.y < i.viewH * 0.15))
    && (i.numClouds > 70 || i.cloudBGActive >= 1)) {
    type = 4 + Math.floor(r() * 5);                                  // :133 Next(4,9)
  } else if (i.y > -i.viewH * 0.15 && Math.floor(r() * 2) === 0 && i.numClouds > 20) {
    type = 14 + Math.floor(r() * 4);                                 // :137 Next(14,18)
  }
  return { type, stormShift };
}

/** 稀有云世界旗标门输入（Cloud.cs RollRareCloud :183-227）。 */
export interface RareCloudFlags {
  /** NPC.downedBoss1（克眼）→ 稀有云 25/26（克眼云） */
  downedBoss1: boolean;
  /** NPC.downedBoss2（世吞/克脑）且 WorldGen.crimson → 稀有云 36（克脑云） */
  downedBoss2: boolean;
  /** NPC.downedBoss3（骷髅王）→ 稀有云 31（骷髅云） */
  downedBoss3: boolean;
  /** Main.hardMode → 稀有云 30（南瓜王云）/35（飞龙云） */
  hardMode: boolean;
  /** WorldGen.crimson */
  crimson: boolean;
  /** Main.dontStarveWorld → 37-40 直通（+触发概率 1/25） */
  dontStarveWorld: boolean;
  /** Main.tenthAnniversaryWorld → 37-40 不掷（范围收窄 22-36）+触发概率 1/25 与 1/3 */
  tenthAnniversaryWorld: boolean;
}

/** RollRareCloud（Cloud.cs:183-227 一比一，纯函数供测试）：22-40 掷点（十周年世界
 *  22-36），旗标门未过的类型重掷。稀有云贴图语义见 CloudID.cs:49-85（鸟/兔/世吞/
 *  克眼×2/金鱼/Redigit/心/南瓜王/骷髅/星/剑/树/飞龙/克脑/饥荒四角色）。 */
export function rollRareCloud(f: RareCloudFlags, rnd: () => number): number {
  let num = -1;
  let ok = false;
  let guard = 0;
  while (!ok && guard++ < 512) {
    num = 22 + Math.floor(rnd() * (f.tenthAnniversaryWorld ? 15 : 19));   // :189 Next(22,41)/Next(22,37)
    switch (num) {
      case 31: ok = f.downedBoss3; break;                                  // :195-197
      case 36: ok = f.downedBoss2 && f.crimson; break;                     // :198-200
      case 25: case 26: ok = f.downedBoss1; break;                         // :201-204
      case 30: case 35: ok = f.hardMode; break;                            // :205-208
      case 28: ok = Math.floor(rnd() * 10) === 0; break;                   // :209-214 1/10
      case 37: case 38: case 39: case 40:
        ok = f.dontStarveWorld || Math.floor(rnd() * 10) === 0; break;     // :215-223
      default: ok = true; break;
    }
  }
  return num;
}

// ================= AmbientSky 天空实体（AmbientSky.cs FadingSkyEntity 全族 17/19） =================

/** 天空装饰族（AmbienceServer.cs:60-84 十七族 + Meteor :1316 已由 spawnSkyMeteor 单接）。
 *  BoneSerpent（:1078）为空类且 Spawn 分发 :1446-1531 无 case——原版死代码，不实装。 */
export type AmbientFamily =
  | 'birds' | 'wyvern' | 'airship' | 'airballoon' | 'eyeball' | 'butterflies'
  | 'lostkite' | 'vulture' | 'bats' | 'pixieposse' | 'seagulls' | 'slimeBalloons'
  | 'gastropod' | 'pegasus' | 'eos' | 'crimera' | 'hellbats';

/** 选族判定输入（AmbienceServer 各判定 + 玩家高度带；新增字段均可选，向后兼容） */
export interface AmbientSpawnInput {
  dayTime: boolean;
  /** Main.IsItRaining = cloudAlpha>0（Main.cs:2659） */
  raining: boolean;
  eclipse: boolean;
  bloodMoon: boolean;
  pumpkinMoon: boolean;
  snowMoon: boolean;
  /** 次级条件（AmbienceServer.cs:77-84）：各族 Zone 门 */
  zoneHallow: boolean;
  /** 玩家在可见天空高度带（AmbienceServer.cs:190-193：position.Y ≤ worldSurface*16+1600） */
  playerAtSkyHeight: boolean;
  /** Main.rand.Next(5) 掷点 0-4（:119：<3 时走放宽列表 → 60% 概率忽略次级条件） */
  roll5: number;
  /** source2.ElementAt(Next(num)) 的均匀选点 0-1 */
  pick: number;
  // ---- 全族扩展（天空视觉深化批；均缺省 false → 只影响对应族） ----
  zoneDesert?: boolean;       // Vulture（:77）
  zoneBeach?: boolean;        // Seagulls（:79）
  zoneJungle?: boolean;       // Bats（:84）
  zoneCorrupt?: boolean;      // EaterOfSouls（:82）
  zoneCrimson?: boolean;      // Crimera（:83）
  /** Main.hardMode（Wyvern 门 :61） */
  hardMode?: boolean;
  /** Main.IsItAHappyWindyDay = _shouldUseWindyDayMusic（Main.cs:2976） */
  windyDay?: boolean;
  /** IsSunset（:39-46：白天 time>40500 → timeOfDay>0.625）——Bats 黄昏支 :68 */
  sunset?: boolean;
  /** NPC.TooWindyForButterflies（NPC.cs:6801：|windSpeedTarget|≥0.4） */
  tooWindyForButterflies?: boolean;
  /** NPC.butterflyChance<6（:65；每日黎明掷，<6 仅约 13% 的日子） */
  butterflyChanceLow?: boolean;
  /** 玩家地狱高度带（:195-198：position.Y ≥ (UnderworldLayer-100)×16）——Hellbats 专属高度门 */
  playerAtHellHeight?: boolean;
  /** 月总在场（AnActiveSkyConflictsWithAmbience :1362-1369 → Ambience 整体禁出） */
  moonLordActive?: boolean;
}

/**
 * 天空装饰选族纯函数（AmbienceServer.Update :96-129 一比一，全 17 族）：
 *  ① source = 主条件（:60-76）成立的族（注册序 = Dictionary 插入序）；
 *  ② source2 严格列表 = 高度门（:87-94：Hellbats 走地狱带门、其余走天空带门）
 *     + 有次级条件且满足（:117）；
 *  ③ 严格列表空或 roll5<3（60%）→ 放宽到「高度门 + 无次级条件或满足」（:119-123）；
 *  ④ 均匀选点（:126）。
 *  月总天空冲突（:1362-1369）在 :1383 直接 Deactivate——此处以 null 表达。
 */
export function pickAmbientFamily(i: AmbientSpawnInput): AmbientFamily | null {
  if (i.moonLordActive) return null;                                // :1362-1369/:1383
  const sunny = !i.raining && i.dayTime && !i.eclipse;              // :30-37 IsSunnyDay
  const calmNight = !i.raining && !i.dayTime && !i.bloodMoon && !i.pumpkinMoon && !i.snowMoon; // :48-55
  const windy = i.windyDay ?? false;
  const sunset = i.sunset ?? false;
  const butterfliesOK = sunny && !windy && !(i.tooWindyForButterflies ?? false)
    && (i.butterflyChanceLow ?? false);                            // :65
  /** [族, 主条件, 次级条件(undefined=无), 是否地狱高度门]——顺序 = _spawnConditions 注册序 :60-76 */
  const table: Array<[AmbientFamily, boolean, boolean | undefined, boolean]> = [
    ['birds', sunny, undefined, false],                             // :60
    ['wyvern', sunny && (i.hardMode ?? false), undefined, false],   // :61
    ['airship', sunny && windy, undefined, false],                  // :62
    ['airballoon', sunny && !windy, undefined, false],              // :63
    ['eyeball', !i.dayTime, undefined, false],                      // :64
    ['butterflies', butterfliesOK, undefined, false],               // :65
    ['lostkite', i.dayTime && !i.eclipse && windy, undefined, false], // :66
    ['vulture', sunny, i.zoneDesert ?? false, false],               // :67 + :77
    ['bats', (sunset && sunny) || calmNight, i.zoneJungle ?? false, false], // :68 + :84
    ['pixieposse', sunny || calmNight, i.zoneHallow, false],        // :69 + :78
    ['seagulls', sunny, i.zoneBeach ?? false, false],               // :70 + :79
    ['slimeBalloons', sunny && windy, undefined, false],            // :71
    ['gastropod', calmNight, i.zoneHallow, false],                  // :72 + :80
    ['pegasus', sunny, i.zoneHallow, false],                        // :73 + :81
    ['eos', sunny || calmNight, i.zoneCorrupt ?? false, false],     // :74 + :82
    ['crimera', sunny || calmNight, i.zoneCrimson ?? false, false], // :75 + :83
    ['hellbats', true, undefined, true],                            // :76（:89-91 地狱高度门）
  ];
  const source = table.filter((row) => row[1]);
  if (!source.length) return null;                                  // :108-111
  const heightOk = (row: typeof source[number]) =>
    row[3] ? (i.playerAtHellHeight ?? false) : i.playerAtSkyHeight; // :87-94
  let pool = source.filter((row) => heightOk(row) && row[2] === true);   // :117 严格列表
  if (pool.length === 0 || i.roll5 < 3) {                           // :119
    pool = source.filter((row) => heightOk(row) && row[2] !== false);    // :121 放宽列表
  }
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(i.pick * pool.length))][0];  // :126
}

/** 单体族参数表（AmbientSky.cs 各类构造器 1:1；纯数据供测试对账） */
export interface AmbientFamilyParams {
  /** SpriteFrame(1, rows)——帧行数（变体族由生成侧覆盖：butterflies 17/19、eos/crimera 3-4 档） */
  rows: number;
  /** FramingSpeed（0 = int.MaxValue 不推进） */
  framingSpeed: number;
  fadeIn: number; fadeOut: number;    // OpacityNormalizedTimeTo*
  /** BrightnessLerper（GetColor :165-168 向白 lerp 系数；gastropod 走专属色） */
  brightness: number;
  /** LifeTime = Next(a,b)*60 */
  life: [number, number];
  /** Depth = depthMin + rand*depthSpan */
  depthMin: number; depthSpan: number;
  /** 高度带 y = yOff + rand*(surfacePx - ySub - yOff)（airballoon/eoc 族为定位特例，生成侧自算） */
  yOff: number; ySub: number;
  /** 横速 |v| = speedA + |WindForVisuals|*speedB（Main.cs:2896 = windSpeedCurrent） */
  speedA: number; speedB: number;
  /** Draw 传 depthScale-adj（PixiePosse -0.1 :440 / Seagulls -1.5 :561） */
  depthScaleAdj?: number;
  /** spriteDir 与风无关（Airship :1087 / AirBalloon :1134 = random.Next(2)） */
  randomDir?: boolean;
  /** 固定纵向速度（SlimeBalloons -0.01 :751） */
  vy?: number;
  /** EOCSkyEntity 状态机（eyeball/eos/crimera：3/4 折线 1/4 追玩家 :1244-1251） */
  eoc?: boolean;
  /** 出生帧随机推进 Next(RowCount)（LostKite :257 / Seagulls :523 / Bats :954 / HellBats :842 / SlimeBalloons :736） */
  frameRandom?: boolean;
  /** FrameOffset 随机相位（Seagulls :522 / Bats :953 / HellBats :841） */
  frameOffset?: boolean;
  /** GetColor = Lerp(白, 灰, Depth/15)（HellBats :871——越远越灰） */
  grayDepthFade?: boolean;
  /** 地狱带族：y = UnderworldLayer*16 + rand*800（HellBats CreateGroup :890） */
  hellBand?: boolean;
}

export const AMBIENT_FAMILY_PARAMS: Record<AmbientFamily, AmbientFamilyParams> = {
  birds:         { rows: 4, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [60, 121], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 3, speedB: 0.8 },                       // BirdsPack :444-487
  wyvern:        { rows: 5, framingSpeed: 4, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [40, 71], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 3, speedB: 0.8 },                        // Wyvern :1026-1059
  airship:       { rows: 4, framingSpeed: 4, fadeIn: 0.05, fadeOut: 0.95, brightness: 0.2, life: [40, 71], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 6, speedB: 1.6, randomDir: true },        // Airship :1082-1124
  airballoon:    { rows: 5, framingSpeed: 0, fadeIn: 0.05, fadeOut: 0.95, brightness: 0.2, life: [20, 51], depthMin: 3, depthSpan: 3, yOff: 0, ySub: 0, speedA: 0, speedB: 4, randomDir: true },               // AirBalloon :1126-1176（vx=wind*4、vy 自算）
  eyeball:       { rows: 3, framingSpeed: 5, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [18, 31], depthMin: 4.5, depthSpan: 3, yOff: 0, ySub: 0, speedA: 3, speedB: 0, eoc: true },                     // EOC :1226-1314
  butterflies:   { rows: 17, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [60, 121], depthMin: 3, depthSpan: 3, yOff: 4000, ySub: 0, speedA: 0.1, speedB: 0.05 },                      // Butterflies :186-229（rows 变体 17/19）
  lostkite:      { rows: 42, framingSpeed: 6, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [60, 121], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 1.2, speedB: 3, frameRandom: true },    // LostKite :231-287（风暴 FramingSpeed 4 / 速度×1.5）
  vulture:       { rows: 10, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [60, 121], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 3, speedB: 0.8 },                      // Vulture :338-387
  bats:          { rows: 10, framingSpeed: 4, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [30, 61], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 3, speedB: 0.8, frameOffset: true, frameRandom: true }, // Bats :919-1024
  pixieposse:    { rows: 25, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.6, life: [60, 121], depthMin: 2, depthSpan: 3, yOff: 4000, ySub: 0, speedA: 0.12, speedB: 0.08, depthScaleAdj: -0.1 }, // PixiePosse :389-442（y 带 :406 = 4000..surface*16）
  seagulls:      { rows: 9, framingSpeed: 4, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [30, 61], depthMin: 1, depthSpan: 2, yOff: 2400, ySub: 1600, speedA: 4, speedB: 0, depthScaleAdj: -1.5, frameOffset: true, frameRandom: true }, // Seagulls :488-599
  slimeBalloons: { rows: 7, framingSpeed: 0, fadeIn: 0.025, fadeOut: 0.975, brightness: 0.2, life: [80, 121], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 1, speedB: 1, vy: -0.01, frameRandom: true }, // SlimeBalloons :708-805
  gastropod:     { rows: 1, framingSpeed: 0, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.75, life: [60, 121], depthMin: 2, depthSpan: 3, yOff: 3200, ySub: 1600, speedA: 1.5, speedB: 0.2, depthScaleAdj: -0.1 },  // Gastropod :601-708（BrightnessLerper .75 → 色 (102,0,63)）
  pegasus:       { rows: 11, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.2, life: [60, 121], depthMin: 3, depthSpan: 3, yOff: 2400, ySub: 1600, speedA: 1.5, speedB: 0.6 },                    // Pegasus :289-336
  eos:           { rows: 4, framingSpeed: 5, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [18, 31], depthMin: 4.5, depthSpan: 3, yOff: 0, ySub: 0, speedA: 3, speedB: 0, eoc: true },                     // EOS :1202-1224（继承 EOC）
  crimera:       { rows: 3, framingSpeed: 5, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [18, 31], depthMin: 4.5, depthSpan: 3, yOff: 0, ySub: 0, speedA: 3, speedB: 0, eoc: true },                     // Crimera :1178-1200
  hellbats:      { rows: 10, framingSpeed: 4, fadeIn: 0.1, fadeOut: 0.9, brightness: 0.2, life: [30, 61], depthMin: 3, depthSpan: 5, yOff: 0, ySub: 0, speedA: 3, speedB: 0.8, frameOffset: true, frameRandom: true, grayDepthFade: true, hellBand: true }, // HellBats :807-917
};

/** 群体族参数（各族 CreateGroup 1:1；单体族不在此表） */
export interface AmbientGroupSpec {
  /** 群内数量 = Next(a,b) */
  count: [number, number];
  /** 磁吸加速度基 = a + rand*b（Gastropod :691 异于其余族的 0.5+rand*0.5） */
  accX: [number, number]; accY: [number, number];
  /** 加速度因子 = (rand*factorA + factorB) * 0.05（Gastropod :701 / 其余 :594/:903/:1019） */
  factorA: number; factorB: number;
  /** 磁吸目标偏移 ±target（Gastropod 120 / Slime 150 / 其余 100） */
  target: number;
  /** 群内散布乘子（(rand*20-10, rand*3) * spread :590/:697/:796/:899/:1015） */
  spread: number;
  /** 逐体 Depth 抖动（+ rand*depthJitter） */
  depthJitter: number;
  /** 逐体 LifeTime 抖动（+ Next(301)） */
  lifeJitter: number;
  /** 基础寿命 = Next(a,b)*60（群族统一在 spec.life 上，此字段保留对账） */
  baseLife: [number, number];
}

export const AMBIENT_GROUP_SPEC: Partial<Record<AmbientFamily, AmbientGroupSpec>> = {
  seagulls:      { count: [5, 9], accX: [0.5, 0.5], accY: [0.5, 0.5], factorA: 0.3, factorB: 0.85, target: 100, spread: 50, depthJitter: 0.5, lifeJitter: 301, baseLife: [30, 61] },      // :564-598
  gastropod:     { count: [3, 8], accX: [0.1, 0.1], accY: [0.3, 0.3], factorA: 0.5, factorB: 0, target: 120, spread: 60, depthJitter: 0.5, lifeJitter: 301, baseLife: [30, 61] },        // :672-705
  slimeBalloons: { count: [5, 10], accX: [0.1, 0.1], accY: [0.1, 0.1], factorA: 0.2, factorB: 0, target: 150, spread: 80, depthJitter: 0.5, lifeJitter: 301, baseLife: [80, 121] },       // :771-804
  bats:          { count: [20, 40], accX: [0.5, 0.5], accY: [0.5, 0.5], factorA: 0.3, factorB: 0.85, target: 100, spread: 50, depthJitter: 0.5, lifeJitter: 301, baseLife: [30, 61] },    // :990-1023
  hellbats:      { count: [20, 40], accX: [0.5, 0.5], accY: [0.5, 0.5], factorA: 0.3, factorB: 0.85, target: 100, spread: 50, depthJitter: 0.5, lifeJitter: 301, baseLife: [30, 61] },    // :874-907
};

/** 月塔天空激活门（SceneState.cs:105-115 + SceneMetrics.cs:276-282/921-928 一比一）：
 *  塔近距门 = 玩家中心与塔 NPC 距离² ≤ NPCEventZoneRadius²(4000²)；
 *  器件门 = 无任何塔近距 且 ActiveMonolithType 对应（:111-115 !flag4 && type==N）。 */
export function towerSkyActive(nearTower: boolean, monolithType: number, familyIndex: number,
  anyTowerNear: boolean): boolean {
  if (nearTower) return true;
  return !anyTowerNear && monolithType === familyIndex;             // :111-115
}

/** VirtualCamera（Terraria.Graphics/VirtualCamera.cs:5-14）：Center=Player.Center、
 *  Position=Center−Size/2、Size=(Main.maxScreenW, maxScreenH)。HiDef 档下
 *  maxScreenW/H = 4096（Main.cs:3753-3755）——即出生域是**以玩家为中心的 4096×4096
 *  虚拟视口**，与真实渲染视口尺寸无关（Reach 档才退回 MaxWorldViewSize）。
 *  消费点：各族构造器 `Position.X = vcam.Position.X ± …/ + Size.X + 100`（:195-199 等）
 *  与 EOC BeginZigZag/BeginChasingPlayer（:1266-1282）。 */
const VIRTUAL_CAM_SIZE = 4096;
const VIRTUAL_CAM_HALF = VIRTUAL_CAM_SIZE / 2;

/** FadingSkyEntity（AmbientSky.cs:88-184）本仓表示（全族） */
interface AmbientEnt {
  kind: AmbientFamily;
  x: number; y: number;             // SkyEntity.Position（世界 px）
  depth: number;
  dir: 1 | -1;
  life: number; bornAt: number;     // LifeTime / TimeEntitySpawnedIn（tick）
  fadeIn: number; fadeOut: number;
  frame: number; rows: number; framingSpeed: number; frameOffset: number;
  opacity: number; vx: number; vy: number; rotation: number;
  brightness: number;               // BrightnessLerper
  depthScaleAdj: number;
  grayDepthFade: boolean;
  texKey: string;
  /** PixiePosse 昼夜变体（1 日 / 2 夜 :409-413）——env 门按变体判 */
  variant: number;
  /** 磁吸弹簧四元组（群体族 :530-537/:639-644/:747-752） */
  magAccX: number; magAccY: number; magTX: number; magTY: number;
  magPX: number; magPY: number; magVX: number; magVY: number;
  /** EOCSkyEntity 状态机（:1232-1237：1 折线 / 2 追玩家） */
  state: number; waviness: number;
  dead: boolean;
}

/** Utils.Remap（Utils.cs）= Lerp(toMin, toMax, GetLerpValue(fromMin, fromMax, value, clamped)) */
function remap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + (toMax - toMin) * lerpValueClamped(fromMin, fromMax, value);
}

/** MoonLordSkyIntensity（SceneMetrics.cs:297-305）：1 − SmoothStep(3000,6000, 玩家距 398 核)。
 *  Utils.SmoothStep（Utils.cs:126-130）= 钳位线性（非 Hermite 平滑）。 */
export function moonLordSkyIntensity(distancePx: number): number {
  return 1 - Math.max(0, Math.min(1, (distancePx - 3000) / 3000));
}

// ================= 月塔天空族（Nebula/Solar/Stardust/Vortex Sky 1:1） =================

type TowerFamily = 'vortex' | 'nebula' | 'stardust' | 'solar';

/** 各族贴图文件（展平键）：Background/Planet 公共 + 族专属件 */
const TOWER_SKY_TEX: Record<TowerFamily, Record<string, string>> = {
  vortex: {
    Background: 'Misc_VortexSky_Background.png', Planet: 'Misc_VortexSky_Planet.png',
    Bolt: 'Misc_VortexSky_Bolt.png', Flash: 'Misc_VortexSky_Flash.png',
  },
  nebula: {
    Background: 'Misc_NebulaSky_Background.png', Planet: 'Misc_NebulaSky_Planet.png',
    Beam: 'Misc_NebulaSky_Beam.png', Rock0: 'Misc_NebulaSky_Rock_0.png',
    Rock1: 'Misc_NebulaSky_Rock_1.png', Rock2: 'Misc_NebulaSky_Rock_2.png',
  },
  solar: {
    Background: 'Misc_SolarSky_Background.png', Planet: 'Misc_SolarSky_Planet.png',
    Meteor: 'Misc_SolarSky_Meteor.png',
  },
  stardust: {
    Background: 'Misc_StarDustSky_Background.png', Planet: 'Misc_StarDustSky_Planet.png',
    Star0: 'Misc_StarDustSky_Star 0.png', Star1: 'Misc_StarDustSky_Star 1.png',
  },
};

/** 单族天空状态（对应一个 CustomSky 实例：SceneState 同族也供 Monolith* 复用） */
class TowerSkyState {
  /** _isActive */
  active = false;
  /** _fadeOpacity（Activate 置 0.002，±0.01/帧 1:1 Update :47-67） */
  fade = 0;
  /** Main.GlobalTimeWrappedHourly 近似（秒，驱动星尘闪烁/星云落石） */
  time = 0;
  private texs = new Map<string, HTMLImageElement>();
  // NebulaSky._pillars（Activate :121-133：40 根光柱，X 均布世界宽±20000、Y -2000..-1800、Depth 7-15）
  private pillars: Array<{ x: number; y: number; depth: number }> = [];
  // SolarSky._meteors（Activate :124-147：150 颗，2/3 近层 Depth 1.8-4.8、1/3 远层 4.8-9.8）
  private meteors: Array<{ x: number; y: number; depth: number; frame: number; scale: number; startX: number }> = [];
  // StardustSky._stars（Activate :121-146：200×10 颗，Depth 1.5-9.5）
  private stars: Array<{ x: number; y: number; depth: number; tex: number; off: number; amp: number; freq: number }> = [];
  // VortexSky._bolts（Activate :131-140：500 槽；Update :59-83 每 1-4t 一道，寿命 30）
  private bolts: Array<{ x: number; y: number; depth: number; life: number; alive: boolean }> = [];
  private boltTimer = 0;

  private tex(fam: TowerFamily, key: string): HTMLImageElement | null {
    const k = `${fam}|${key}`;
    let t = this.texs.get(k);
    if (!t) {
      t = loadTex(TOWER_SKY_TEX[fam][key]);
      this.texs.set(k, t);
    }
    return t;
  }

  /** ManageSpecialBiomeVisuals 翻转（Activate :121-147 / Deactivate :140-143） */
  setActive(on: boolean, fam: TowerFamily, maxTilesX: number, surfacePx: number): void {
    if (on && !this.active) this.generate(fam, maxTilesX, surfacePx);
    else if (!on) this.active = false;
  }

  reset(): void {
    this.active = false;
    this.fade = 0;
    this.pillars = [];
    this.meteors = [];
    this.stars = [];
    this.bolts = [];
  }

  /** Activate 实体生成（按族分发；调用方持有族名） */
  generate(fam: TowerFamily, maxTilesX: number, surfacePx: number): void {
    const r = Math.random;
    this.fade = 0.002;
    this.active = true;
    this.maxTilesX = maxTilesX;
    this.surfacePx = surfacePx;
    if (fam === 'nebula') {
      // NebulaSky.Activate :125-132
      const maxTilesX = this.maxTilesX, N = 40;
      this.pillars = new Array(N);
      for (let i = 0; i < N; i++) {
        this.pillars[i] = {
          x: (i / N) * (maxTilesX * 16 + 20000) + r() * 40 - 20 - 20000,
          y: r() * 200 - 2000,
          depth: r() * 8 + 7,
        };
      }
      this.pillars.sort((a, b) => b.depth - a.depth);   // Array.Sort(降 Depth)
    } else if (fam === 'solar') {
      // SolarSky.Activate :128-146
      const maxTilesX = this.maxTilesX, surfacePx = this.surfacePx, N = 150;
      this.meteors = new Array(N);
      for (let i = 0; i < N; i++) {
        const depth = Math.floor(r() * 3) !== 0 ? r() * 3 + 1.8 : r() * 5 + 4.8;  // :134-141
        const x = (i / N) * maxTilesX * 16 + r() * 40 - 20;
        this.meteors[i] = {
          x, y: -(r() * (surfacePx + 10000)) - 10000,
          depth, frame: Math.floor(r() * 12), scale: r() * 0.5 + 1, startX: x,
        };
      }
      this.meteors.sort((a, b) => b.depth - a.depth);
    } else if (fam === 'stardust') {
      // StardustSky.Activate :124-145
      const maxTilesX = this.maxTilesX, surfacePx = this.surfacePx;
      const N1 = 200, N2 = 10;
      this.stars = new Array(N1 * N2);
      for (let i = 0; i < N1; i++) {
        for (let j = 0; j < N2; j++) {
          this.stars[i * N2 + j] = {
            x: (i / N1) * maxTilesX * 16,
            y: (j / N2) * (surfacePx + 2000) - 1000,
            depth: r() * 8 + 1.5,
            tex: Math.floor(r() * 2),
            off: r() * 6.28, amp: r() * 5, freq: r() + 1,
          };
        }
      }
      this.stars.sort((a, b) => b.depth - a.depth);
    } else {
      // VortexSky.Activate :131-139
      this.bolts = new Array(500);
      for (let i = 0; i < 500; i++) this.bolts[i] = { x: 0, y: 0, depth: 0, life: 0, alive: false };
      this.boltTimer = 0;
    }
  }

  /** Activate 所需世界尺寸（generate 前由调用方注入） */
  maxTilesX = 4200;
  surfacePx = 4800;

  /** Update（各 Sky.Update :47-67 通用淡入淡出 + Solar 流星下坠/Vortex 落雷计时） */
  update(fam: TowerFamily, dtMs: number): void {
    const frames = dtMs / (1000 / 60);
    this.time += dtMs / 1000;
    this.fade = this.active
      ? Math.min(1, 0.01 * frames + this.fade)
      : Math.max(0, this.fade - 0.01 * frames);
    if (fam === 'solar' && this.fade > 0.001) {
      // SolarSky.Update :56-66：1200px/s 斜向下坠，落过地表线回顶
      const dtSec = dtMs / 1000;
      for (const m of this.meteors) {
        m.x -= 1200 * dtSec;
        m.y += 1200 * dtSec;
        if (m.y > this.surfacePx) { m.x = m.startX; m.y = -10000; }
      }
    } else if (fam === 'vortex' && this.fade > 0.001) {
      // VortexSky.Update :59-83
      this.boltTimer -= frames;
      if (this.boltTimer <= 0) {
        this.boltTimer = 1 + Math.floor(Math.random() * 4);        // Next(1,5)
        let slot = this.bolts.findIndex((b) => !b.alive);
        if (slot < 0) slot = this.bolts.length - 1;
        this.bolts[slot] = {
          x: Math.random() * (this.maxTilesX * 16 + 4000) - 2000,
          y: Math.random() * 500,
          depth: Math.random() * 8 + 2,
          life: 30, alive: true,
        };
      }
      for (const b of this.bolts) {
        if (!b.alive) continue;
        if (--b.life <= 0) b.alive = false;
      }
    }
  }

  /** Draw（各 Sky.Draw 1:1）：黑幕 + 背景带 + 行星（远景段）→ 族专属实体（视差段） */
  draw(ctx: CanvasRenderingContext2D, fam: TowerFamily, viewW: number, viewH: number,
    screenX: number, screenY: number, maxTilesX: number, surfacePx: number): void {
    if (this.fade <= 0.001) return;                                  // IsActive 语义
    this.maxTilesX = maxTilesX;
    this.surfacePx = surfacePx;
    // ---- 远景段（maxDepth==MaxValue 分支，各族同构 :66-73/:76-83/:71-78/:93-100）----
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${this.fade.toFixed(4)})`;           // BlackTile × fade
    ctx.fillRect(0, 0, viewW, viewH);
    const bg = this.tex(fam, 'Background');
    if (bg && (bg.width > 0) && bg.width) {
      // :69 背景带竖向偏移 + :69 alpha = min(1,(screenY-800)/1000)×fade
      const y = Math.max(0, (surfacePx - screenY - 2400) * 0.1);
      ctx.globalAlpha = Math.max(0, Math.min(1, (screenY - 800) / 1000)) * this.fade;
      ctx.drawImage(bg, 0, y, viewW, viewH);
    }
    const planet = this.tex(fam, 'Planet');
    if (planet && (planet.width > 0) && planet.width) {
      // :70-72 屏中心 + (-200,-200) + 0.01×(maxTilesX*8 − screenX, worldSurface/2 − screenY)
      const px = viewW / 2 - 200 + 0.01 * (maxTilesX * 8 - screenX);
      const py = viewH / 2 - 200 + 0.01 * (surfacePx / 16 / 2 - screenY);
      ctx.globalAlpha = 0.9 * this.fade;
      ctx.drawImage(planet, px - planet.width / 2, py - planet.height / 2);
    }
    // ---- 族专属实体段（:74-113/:84-117/:79-114/:101-123）----
    const num3 = Math.max(0, Math.min(1, (screenY - 1000) / 1000)); // 高度门 alpha
    const camCX = screenX + viewW / 2, camCY = screenY + viewH / 2; // vector3
    const inRect = (x: number, y: number) =>
      x > -1000 && x < viewW + 1000 && y > -1000 && y < viewH + 1000;
    const project = (x: number, y: number, depth: number, sy: number): [number, number] => {
      const px = (x - camCX) / depth + camCX - screenX;
      const py = (y - camCY) * sy / depth + camCY - screenY;
      return [px, py];
    };
    ctx.imageSmoothingEnabled = true;
    if (fam === 'nebula') {
      for (let j = 0; j < this.pillars.length; j++) {
        const p = this.pillars[j];
        const [px, py] = project(p.x, p.y, p.depth, 0.9);
        if (!inRect(px, py)) continue;
        const num4 = (1 / p.depth) * 450;                            // :103
        const beam = this.tex(fam, 'Beam');
        if (beam && (beam.width > 0) && beam.width) {
          // :104 原点 (0,0)，scale=(num4/70, num4/45)，alpha 0.2×num3×fade
          ctx.globalAlpha = 0.2 * num3 * this.fade;
          ctx.drawImage(beam, px, py, num4, beam.height * (num4 / 45));
        }
        // :105-111 每 0.03 一颗落石（34 颗/柱），num7=1−(phase%1) 驱动纵落/旋转/亮度
        for (let k = 0, rockIdx = 0; k <= 1.0001; k += 0.03, rockIdx++) {
          const num6 = k;
          const num7 = 1 - ((num6 + this.time * 0.02 + Math.sin(j)) % 1);
          const rock = this.tex(fam, `Rock${rockIdx % 3}`);
          if (!rock || !(rock.width > 0) || !rock.width) continue;
          const rx = px + Math.sin(num6 * 1582) * (num4 * 0.5) + num4 * 0.5;
          const ry = py + num7 * 2000;
          ctx.save();
          ctx.globalAlpha = num7 * num3 * this.fade;
          ctx.translate(rx, ry);
          ctx.rotate(num7 * 20);
          ctx.drawImage(rock, -rock.width * 0.9 / 2, -rock.height * 0.9 / 2,
            rock.width * 0.9, rock.height * 0.9);
          ctx.restore();
        }
      }
    } else if (fam === 'solar') {
      for (const m of this.meteors) {
        const [px, py] = project(m.x, m.y, m.depth, 0.9);
        if (!inRect(px, py)) continue;
        const tex = this.tex(fam, 'Meteor');
        if (!tex || !(tex.width > 0) || !tex.width) continue;
        const frame = Math.floor(m.frame / 3);                        // :110
        m.frame = (m.frame + 1) % 12;                                 // :111（Draw 内推进）
        const fh = tex.height / 4;
        const s = (1 / m.depth) * 5 * m.scale;                        // :114
        ctx.globalAlpha = num3 * this.fade;
        ctx.drawImage(tex, 0, frame * fh, tex.width, fh, px, py,
          tex.width * s, fh * s);
      }
    } else if (fam === 'stardust') {
      for (const s of this.stars) {
        const [px, py] = project(s.x, s.y, s.depth, 1.1);             // :103 星尘垂直视差 1.1
        if (!inRect(px, py)) continue;
        const tex = this.tex(fam, s.tex === 0 ? 'Star0' : 'Star1');
        if (!tex || !(tex.width > 0) || !tex.width) continue;
        // :107-109 双正弦亮度
        let value = Math.sin(s.freq * this.time + s.off) * s.amp + s.amp;
        const num4 = Math.sin(s.freq * this.time * 5 + s.off) * 0.1 - 0.1;
        value = Math.max(0, Math.min(1, value));
        const a = num3 * value * 0.8 * (1 - num4) * this.fade;        // :111
        if (a <= 0.01) continue;
        const scale = ((1 / s.depth) * 0.5 + 0.5) * (value * 0.3 + 0.7);
        ctx.globalAlpha = a;
        ctx.drawImage(tex, px - tex.width * scale / 2, py - tex.height * scale / 2,
          tex.width * scale, tex.height * scale);
      }
    } else {
      for (const b of this.bolts) {
        if (!b.alive) continue;
        const [px, py] = project(b.x, b.y, b.depth, 0.9);
        if (!inRect(px, py)) continue;
        const flash = b.life > 26 && b.life % 2 === 0;                // :115-119
        const tex = this.tex(fam, flash ? 'Flash' : 'Bolt');
        if (!tex || !(tex.width > 0) || !tex.width) continue;
        const a = num3 * (b.life / 30) * this.fade;                   // :121
        const s = (1 / b.depth) * 5;                                  // :121
        ctx.globalAlpha = a;
        ctx.drawImage(tex, px, py, tex.width * s, tex.height * s);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ================= 月总死亡戏剧件（MoonlordDeathDrama.cs :12-146） =================

type DramaPieceKind = 'spine' | 'shoulder' | 'torso' | 'head' | 'explosion';

const DRAMA_TEX_FILE: Record<DramaPieceKind, string> = {
  spine: 'Misc_MoonExplosion_Spine.png',
  shoulder: 'Misc_MoonExplosion_Shoulder.png',
  torso: 'Misc_MoonExplosion_Torso.png',
  head: 'Misc_MoonExplosion_Head.png',
  explosion: 'Misc_MoonExplosion_Explosion.png',
};

const dramaTexCache = new Map<DramaPieceKind, HTMLImageElement>();
function dramaTex(kind: DramaPieceKind): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let t = dramaTexCache.get(kind);
  if (!t) {
    t = new Image();
    t.src = `sprites/vanilla/${DRAMA_TEX_FILE[kind]}`;
    dramaTexCache.set(kind, t);
  }
  return t;
}

/** MoonlordPiece（:12-87）：重力 0.3 + 角速度衰减 0.99 + 出界判死 */
class DramaPiece {
  rot = 0;
  dead = false;
  constructor(
    readonly kind: DramaPieceKind,
    public x: number, public y: number,
    public vx: number, public vy: number,
    readonly ox: number, readonly oy: number,   // 贴图 origin（:235-241 显式值）
    public rotV: number,
  ) {}
  update(maxTilesX: number, maxTilesY: number): void {
    this.vy += 0.3;                              // :50
    this.rot += this.rotV;                       // :51
    this.rotV *= 0.99;                           // :52
    this.x += this.vx; this.y += this.vy;        // :53
    if (this.y > maxTilesY * 16 - 480 || this.x < 480 || this.x >= maxTilesX * 16 - 480) {
      this.dead = true;                          // :26-36
    }
  }
}

/** MoonlordExplosion（:89-146）：7 帧竖条，帧速 2-4，恒 (255,255,255,127) */
class DramaExplosion {
  counter = 0;
  dead = false;
  constructor(public x: number, public y: number, readonly speed: number) {}
  update(): void {
    this.counter++;                              // :127
    if (this.counter >= this.speed * 7) this.dead = true;   // :103-113
  }
}

/** MoonlordDeathDrama.ThrowPieces（:231-242）的种子 RNG：原版 `new UnifiedRandom(DramaSeed)`
 *  + `r.NextFloat()`×8（每件散射角+角速度各一次，顺序 = spine/shoulder/torso/head）。
 *  NextFloat = (float)NextDouble()（Utils.cs:1201-1204）→ Math.fround 镜像 C# double→float
 *  收缩；后续 float 算术（×(π/2)−π/4+π / ×6..12 / ×0.1−0.05）逐运算 fround = 位级同源。
 *  （原近似实现非 .NET 位级，已退役——见 git 历史。） */
const F_PI_2 = Math.fround(Math.PI / 2);
const F_PI_4 = Math.fround(Math.PI / 4);
/** 单件散射参数（angle = UnitY.RotatedBy 的弧度、rotV = 角速度）——纯函数供测试对拍 */
export function moonlordThrowSeq(seed: number): Array<{ angle: number; rotV: number }> {
  const rng = new UnifiedRandom(seed);
  const nextFloat = () => Math.fround(rng.nextDouble());          // (float)NextDouble
  const out: Array<{ angle: number; rotV: number }> = [];
  for (let i = 0; i < 4; i++) {
    const angle = Math.fround(
      Math.fround(Math.fround(Math.fround(nextFloat()) * F_PI_2) - F_PI_4) + Math.PI);
    const rotV = Math.fround(Math.fround(Math.fround(nextFloat()) * 0.1) - 0.05);
    out.push({ angle, rotV });
  }
  return out;
}

// ================= 晨昏耀斑贴图（Misc/Sunflare/*） =================

type SunflareTex = 'flare1' | 'flare2' | 'bokeh' | 'spectra' | 'pointblurry' | 'pointsharp' | 'colorgradient';

const SUNFLARE_TEX_FILE: Record<SunflareTex, string> = {
  flare1: 'Misc_Sunflare_flare1.png',
  flare2: 'Misc_Sunflare_flare2.png',
  bokeh: 'Misc_Sunflare_Lens_Flare1.png',
  spectra: 'Misc_Sunflare_Lens_Flare2.png',
  pointblurry: 'Misc_Sunflare_Lens_PointBlurry.png',
  pointsharp: 'Misc_Sunflare_Lens_PointSharp.png',
  colorgradient: 'Misc_Sunflare_colorgradient.png',
};

/** 镜头元素乘色缓存（lighter 叠加前先 multiply 着色——LensFlareElement.Color :422 等） */
const flareTintCache = new Map<string, HTMLCanvasElement>();
function tintedFlareSprite(tex: HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${tex.src}|${r},${g},${b}`;
  const hit = flareTintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = tex.width; c.height = tex.height;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = true;
  cx.drawImage(tex, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${r},${g},${b})`;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(tex, 0, 0);
  flareTintCache.set(key, c);
  if (flareTintCache.size > 24) {
    const first = flareTintCache.keys().next().value;
    if (first !== undefined) flareTintCache.delete(first);
  }
  return c;
}

/** 帧数据挂点（Renderer.render 每帧一行注入 sky.frameCtx；结构化类型避免反向依赖）。
 *  消费：月塔天空近距门 / 月总死亡戏剧 / 稀有云世界旗标 / AmbientSky zone 门 /
 *  涟漪水面采样。null = 未注入（菜单等），各子系统自静默。 */
export interface SkyFrameCtx {
  /** 场上实体（月塔 493/422/507/517 与月总 398 扫描用；vanillaId/ai0/ai1 为 Enemy
   *  侧字段——可选以兼容 Entity 基类条目，消费侧以 !== 严格比对自然跳过缺省值） */
  entities: ReadonlyArray<{
    vanillaId?: number | null; cx: number; cy: number;
    ai0?: number; ai1?: number; dead: boolean;
  }>;
  world: {
    w: number; h: number;
    /** groundLevel（tile）——与 fx.surfaceY 同源（px = ×16） */
    groundLevel: number;
    /** 地狱顶（tile；= UnderworldLayer，0 缺省时以 h-200 回退） */
    lavaLine: number;
    crimson: boolean;
    flags: Record<string, boolean>;
    /** 彩蛋种子旗标（SeedEasterEggs.parseSeed；稀有云门消费 theConstant/tenthAnniversary） */
    seedFlags?: { theConstant?: boolean; tenthAnniversary?: boolean };
    store: {
      inBounds(x: number, y: number): boolean;
      isSolid(x: number, y: number): boolean;
      idx(x: number, y: number): number;
      liquid: ArrayLike<number>;
    };
  } | null;
  scene: {
    zoneDesert: boolean; zoneBeach: boolean; zoneJungle: boolean;
    zoneCorrupt: boolean; zoneCrimson: boolean; zoneHallow: boolean;
  } | null;
  player: { cx: number; cy: number } | null;
  clock: { dayCount: number; timeOfDay: number; isDay: boolean } | null;
  camX: number; camY: number; z: number; viewW: number; viewH: number;
}

export class SkyRenderer {
  private stars: Array<{ x: number; y: number; s: number }> = [];
  /** 原版云贴图（Cloud.cs:114-146）：0-3 常态/4-8 高层薄云/9-13 远空灰云/
   *  14-17 低空白云/18-21 雨云·风暴云/22-40 稀有云（RollRareCloud 世界旗标门） */
  private cloudTexs: Array<HTMLImageElement | null> = new Array(41).fill(null);
  private vclouds: VanillaCloud[] = [];
  /** 风——原版风场模型(Main.cs:10800/58222-58310):
   *  windSpeedTarget 随机游走 ±0.001 步、钳 ±0.35;windSpeedCurrent 以
   *  0.0003+|diff|*0.0015 /帧 向目标缓动。旧实现是满幅正弦(±1),云速快 3~10 倍。 */
  private wind = 0;            // windSpeedCurrent
  private windTarget = 0;      // windSpeedTarget
  private windCounter = 0;     // 重掷计数(帧)
  private windRng: () => number = Math.random;
  /** 稀有云世界旗标（frameCtx 每帧刷新；缺省全 false = 只出无门稀有云） */
  private rareCloudFlags: RareCloudFlags = {
    downedBoss1: false, downedBoss2: false, downedBoss3: false,
    hardMode: false, crimson: false, dontStarveWorld: false, tenthAnniversaryWorld: false,
  };

  constructor() {
    for (let i = 0; i < 120; i++) {
      this.stars.push({ x: Math.random(), y: Math.random() * 0.7, s: Math.random() < 0.2 ? 2 : 1 });
    }
    // 云贴图五族(Cloud_0-21)首用懒加载:绘制/选型路径经 cloudTex(i) 触发,未就绪
    // 跳帧自愈(云淡入本身 >1s,无可见差异)。此前构造器全量装载 22 张——雨云/
    // 风暴云(18-21)无雨天气永不出现,白载;且 SkyRenderer 在菜单+进图各构造一次,
    // 急载翻倍
    this.sunTex = loadTex('Sun.png');
    for (let i = 0; i <= 8; i++) this.moonTexs[i] = loadTex(`Moon_${i}.png`);
    // 事件月亮(Main.cs:62400-62408):南瓜月 kind=2 / 霜月 kind=1,50×400 相位竖条
    // ——只在对应月亮事件进行时才画,改首用懒加载(月亮绘制分支内 ensure)
    // 风场初值(Main.cs:10800):current = ±0.8 随机,计数 7200-28800 帧
    this.wind = (Math.floor(Math.random() * 1601) - 800) * 0.001;
    this.windCounter = 7200 + Math.floor(Math.random() * 21601);
  }

  /** 云贴图首用懒加载(in-flight 去重:占位即标记;未就绪时调用方以 complete 守卫跳帧) */
  private cloudTex(i: number): HTMLImageElement | null {
    let t = this.cloudTexs[i];
    if (!t) {
      t = new Image();
      t.src = `sprites/vanilla/Cloud_${i}.png`;
      this.cloudTexs[i] = t;
    }
    return t;
  }

  sunTex: HTMLImageElement;
  moonTexs: Array<HTMLImageElement | null> = [null, null, null, null, null, null, null, null, null];
  /** 事件月亮（kind 1=霜月 Snow / 2=南瓜月 Pumpkin,Main.cs:62400-62408）——
   *  事件进行时才需要,首用懒加载(绘制分支 ensureEventMoonTex) */
  private eventMoonTexs: Array<HTMLImageElement | null> = [null, null]; // [1]=Snow [2]=Pumpkin
  /** 事件月亮贴图(首用懒加载,未就绪调用方跳帧) */
  private ensureEventMoonTex(kind: 1 | 2): HTMLImageElement | null {
    let t = this.eventMoonTexs[kind];
    if (!t) {
      t = new Image();
      t.src = `sprites/vanilla/Moon_${kind === 2 ? 'Pumpkin' : 'Snow'}.png`;
      this.eventMoonTexs[kind] = t;
    }
    return t;
  }
  /** 世界月亮样式(原版 header moonType 0-8;默认 0 标准月) */
  moonType = 0;
  // ---- 天幕流星(AmbientSky.MeteorSkyEntity :1316-1341;spawnMeteor 期间夜 15000-16200
  //      窗口恰一颗划过,Main.HandleMeteorFall :64952-64967)----
  private meteorTex: HTMLImageElement | null = null;
  /** 活动实体:null = 无;spawn() 后按 vanilla 参数运动 */
  private meteor: {
    x: number; y: number; vx: number; vy: number; rot: number; t: number; life: number; flip: boolean;
    depth: number;
  } | null = null;
  /** 贴图 62×384 = 4 帧竖排(FramingSpeed 5 → 每 5 帧进一格) */
  private static readonly METEOR_FW = 62;
  private static readonly METEOR_FH = 96;

  /** 触发一颗(Game:夜间过 15000 线时恰调一次;原版 _canShowMeteorFall 门) */
  spawnSkyMeteor(playerCx: number, playerCy: number, worldSurfacePx: number) {
    if (this.meteor) return;   // 原版每窗口一颗(ForceEntitySpawn 一次)
    if (!this.meteorTex) {
      this.meteorTex = loadTex('Background_Meteor.png');
    }
    // :1321-1325:flip 掷;角度 π/4 + rand(π/2) 的单位向量(向下)
    const ang = Math.PI / 4 + Math.random() * (Math.PI / 2);
    const vx = Math.cos(ang), vy = Math.sin(ang);
    // :1326-1333:速度 = 使行进 worldSurface*16 距离恰 1200 帧;出生 = 玩家中心 ±100
    //  减去 velocity*1200*0.5(前半程从屏外来)
    const spd = worldSurfacePx / vy / 1200;
    this.meteor = {
      vx: vx * spd, vy: vy * spd,
      x: playerCx + (Math.floor(Math.random() * 201) - 100) - vx * spd * 600,
      y: playerCy + (Math.floor(Math.random() * 201) - 100) - vy * spd * 600,
      rot: ang + Math.PI / 2,   // :1340 rotation = Velocity.ToRotation()+π/2
      t: 0, life: 1200,         // :1327/1334 LifeTime=1200
      flip: Math.random() >= 0.5,
      depth: 3 + Math.random() * 3,  // :1322 Depth = rand*3+3 ∈[3,6)
    };
  }

  /** 原版 GetParallax（Cloud.cs:324-343） */
  private cloudParallax(scale: number): number {
    let base: number, s: number;
    if (scale < 1) { base = 0.07; s = (scale + 0.15 + 1) / 2; }
    else if (scale <= 1.15) { base = 0.19; s = scale - 0.075; }
    else { base = 0.23; s = scale - 0.15 - 0.075; }
    return base * s * s;
  }

  /** 原版 SpawnCloud（Cloud.cs:60-170 一比一）：scale/rotation/flip/位置/五族选型/重叠拒绝 */
  private spawnCloud(viewW: number, viewH: number, initial: boolean): VanillaCloud | null {
    const r = Math.random;
    // scale = Next(70,131)*0.01（:81）；rot = Next(-10,11)*0.01（:82）
    const c: VanillaCloud = {
      type: 0,
      x: 0, y: 0,
      scale: Math.floor(70 + r() * 61) / 100,
      rot: (Math.floor(r() * 21) - 10) / 100,
      rSpeed: 0,
      alpha: initial ? 1 : 0,
      flip: r() < 0.5,               // :87-90 50% 水平翻转
      kill: false,
    };
    // Y 带（:109-113）：[-0.25H, 0.15H)，1/3 概率再上抬 rand*0.1H
    c.y = -viewH * 0.25 + r() * viewH * 0.4;
    if (Math.floor(r() * 3) === 0) c.y -= r() * viewH * 0.1;
    // 五族选型链（:114-138）：雨/阴天 → 18-21 风暴云（含大块上移量）
    const wr = this.weatherRef;
    const pick = pickCloudType({
      scale: c.scale, y: c.y, viewH,
      numClouds: wr ? wr.numClouds : 200,
      cloudAlpha: wr ? wr.cloudAlpha : 0,
      cloudBGActive: wr ? wr.cloudBGActive : 0,
      rnd: r,
    });
    c.type = pick.type;
    c.y -= pick.stormShift;          // :118-125 风暴云大块腾位
    // 稀有云（Cloud.cs:139-146）：1/150（饥荒/十周年世界 1/25）掷中 → RollRareCloud；
    //  十周年世界另 1/3 直通。掷点替换在五族选型之后（覆盖任意常规族）
    const rareDenom = this.rareCloudFlags.dontStarveWorld || this.rareCloudFlags.tenthAnniversaryWorld ? 25 : 150;
    if (Math.floor(r() * rareDenom) === 0) {
      c.type = rollRareCloud(this.rareCloudFlags, r);
    } else if (this.rareCloudFlags.tenthAnniversaryWorld && Math.floor(r() * 3) === 0) {
      c.type = rollRareCloud(this.rareCloudFlags, r);
    }
    // scale>1.2 下移 100（:147-149）；scale 钳 0.7/1.3（:151-158）
    if (c.scale > 1.2) c.y += 100;
    if (c.scale > 1.3) c.scale = 1.3;
    if (c.scale < 0.7) c.scale = 0.7;
    // X：顺风侧留屏外缓冲（:96-107：风>0 → 左界 -500；风<0 → 右界 +500）
    const num3 = this.wind > 0 ? -200 : 0;
    const num4 = this.wind < 0 ? 200 : 0;
    const lo = num3 - 300, hi = viewW + num4 + 300;
    c.x = lo + r() * (hi - lo);      // :107 Next(num3-300, screenWidth+num4+300)
    // 远端屏外直接全显（:161-168：x>屏+400 或 x+宽<-400 → Alpha=1）
    const tw = (this.cloudTex(c.type)?.width ?? 200) * c.scale;
    if (c.x > viewW + 400 || c.x + tw < -400) c.alpha = 1;
    // AABB 重叠拒绝（:169-180）
    const tex = this.cloudTex(c.type);
    const w = (tex?.width ?? 200) * c.scale, h = (tex?.height ?? 80) * c.scale;
    for (const o of this.vclouds) {
      const ot = this.cloudTex(o.type);
      const ow = (ot?.width ?? 200) * o.scale, oh = (ot?.height ?? 80) * o.scale;
      if (c.x < o.x + ow && c.x + w > o.x && c.y < o.y + oh && c.y + h > o.y) return null;
    }
    return c;
  }

  /** 原版风场步进(Main.cs:58270-58310):每帧目标随机游走/重掷,钳 ±0.35;
   *  当前值以 0.0003+|diff|*0.0015 /帧缓动(L58222-58245)。
   *  天气系统接入后弃用（weather.update 每帧推进权威风场，此处只读） */
  private updateWind(frames: number): void {
    if (this.weatherRef) {
      this.wind = this.weatherRef.windSpeedCurrent;
      this.windTarget = this.weatherRef.windSpeedTarget;
      return;
    }
    for (let f = 0; f < Math.ceil(frames); f++) {
      // 目标随机游走(L58270-58276):1/4 ±0.025 / 1/2 ±0.05 / 其余 ±0.1(×0.001)
      if (this.windRng() < 0.25) this.windTarget += (Math.floor(this.windRng() * 51) - 25) * 0.001;
      else if (this.windRng() < 0.5) this.windTarget += (Math.floor(this.windRng() * 101) - 50) * 0.001;
      else this.windTarget += (Math.floor(this.windRng() * 201) - 100) * 0.001;
      this.windTarget = Math.max(-0.35, Math.min(0.35, this.windTarget));
      // 重掷计数(L58284-58310):多数落在 0/±0.2,少数 ±0.4,极端 ±0.85
      if (--this.windCounter <= 0) {
        this.windCounter = 7200 + Math.floor(this.windRng() * 21601); // 7200-28800 帧
        const r = this.windRng();
        if (r < 13 / 30) {
          this.windTarget = this.windRng() < 0.5 ? 0 : (Math.floor(this.windRng() * 401) - 200) * 0.001;
        } else if (r < 13 / 30 + 13 / 20 * 17 / 30) {
          this.windTarget = (Math.floor(this.windRng() * 801) - 400) * 0.001;
        } else {
          this.windTarget = (Math.floor(this.windRng() * 1701) - 850) * 0.001;
        }
        this.windTarget = Math.max(-0.35, Math.min(0.35, this.windTarget));
      }
      // 当前值缓动(L58228-58244)
      const step = 0.0003 + Math.abs(this.windTarget - this.wind) * 0.0015;
      this.wind += Math.max(-step, Math.min(step, this.windTarget - this.wind));
    }
  }

  /** 原版 Update（Cloud.cs:348-443）：风驱动位移 + 淡入淡出 + 旋转微摆 + 越界回收。
   *  速度随雨增强由 Weather.updateWind 承担（Main.cs:58221-58237：
   *  current 向 target×(1+5/9×maxRaining) 逼近——暴雨云速最高 +~56%） */
  private updateClouds(dtMs: number, viewW: number, camX = 0) {
    const frames = dtMs / (1000 / 60);
    this.updateWind(frames);
    // 相机视差（Cloud.cs UpdateCloudParallax :313-330）：云.x −= 相机位移 × GetParallax
    if (this.lastCloudCamX !== null) {
      const d = camX - this.lastCloudCamX;
      if (d !== 0) for (const c of this.vclouds) c.x -= d * this.cloudParallax(c.scale);
    }
    this.lastCloudCamX = camX;
    const wr = this.weatherRef;
    for (const c of this.vclouds) {
      c.x += this.wind * 9 * this.cloudParallax(c.scale) * frames;
      // 远空灰云（9-13）在下雨/阴天转为 kill 淡出（Cloud.cs:449-452）——
      // 它们是晴天专属；雨天出场的深色云是新刷出的 18-21 风暴云
      if (c.type >= 9 && c.type <= 13 && wr && (wr.cloudAlpha > 0 || wr.cloudBGActive >= 1)) {
        c.kill = true;
      }
      if (!c.kill && c.alpha < 1) c.alpha = Math.min(1, c.alpha + 0.001 * frames);
      if (c.kill) {
        c.alpha -= 0.001 * frames;
        if (c.alpha <= 0) c.alpha = 0;
      }
      c.rSpeed += (Math.random() * 21 - 10) * 2e-5 * frames;
      c.rSpeed = Math.max(-0.0002, Math.min(0.0002, c.rSpeed));
      c.rot = Math.max(-0.02, Math.min(0.02, c.rot + c.rSpeed * frames));
    }
    const off = 600;
    this.vclouds = this.vclouds.filter((c) => {
      const tex = this.cloudTex(c.type);
      const w = (tex?.width ?? 200) * c.scale;
      return c.alpha > 0 && c.x + w > -off && c.x < viewW + off;
    });
  }

  /** 维持云量（Cloud.cs UpdateClouds :230-296 1:1）：目标 = Main.numClouds【直连】
   *  （0-200 朵——★曾视口公式映射 8-21 朵=云量严重偏少）。缺 → 每帧 addCloud 一朵；
   *  超 → 每帧随机 kill 一朵。首次进场按 resetClouds(:39-59) 铺满且 Alpha=1。
   *  下雨加密由 Weather.updateCloudCounts（numClouds 强制爬升 200×cloudAlpha）自动传导 */
  private targetCloudCount(): number {
    return this.weatherRef ? Math.max(0, Math.round(this.weatherRef.numClouds)) : 200;
  }
  private cloudsInitialized = false;
  private maintainClouds(viewW: number, viewH: number) {
    const target = this.targetCloudCount();
    if (!this.cloudsInitialized) {
      this.cloudsInitialized = true;                       // resetClouds 铺满段
      let guard = 0;
      while (this.vclouds.length < target && guard++ < 400) {
        const c = this.spawnCloud(viewW, viewH, true);
        if (c) this.vclouds.push(c);
      }
      return;
    }
    let alive = 0;
    for (const c of this.vclouds) if (!c.kill) alive++;
    if (alive < target) {                                  // :291 每帧补一朵
      const c = this.spawnCloud(viewW, viewH, false);
      if (c) this.vclouds.push(c);
    } else if (alive > target) {                           // :292-300 随机 kill 一朵
      const idx: number[] = [];
      for (let i = 0; i < this.vclouds.length; i++) if (!this.vclouds[i].kill) idx.push(i);
      if (idx.length) this.vclouds[idx[Math.floor(Math.random() * idx.length)]].kill = true;
    }
  }

  /** 天气联动（Game.afterWorldLoad 注入）：风场以 weather 为权威（弃用内部迷你模型），
   *  云染色在下雨时向灰过渡（原版 cloudAlpha 下云变暗），闪电读 weather.lightning */
  weatherRef: import('../world/weather/Weather').WeatherState | null = null;
  attachWeather(w: import('../world/weather/Weather').WeatherState) {
    this.weatherRef = w;
  }

  /** 塔天空激活时的云量乘子（GetCloudAlpha()；sky.draw 每帧写，drawVanillaClouds 读） */
  private towerCloudMul = 1;

  // ---- 器件驱动的天空效果（SceneMetrics 器件态；Renderer 每帧写入）----
  fx: {
    monolith: number; party: boolean; surfaceY: number; worldW: number; worldH: number;
    moonEventKind: 0 | 1 | 2;
  } =
    { monolith: -1, party: false, surfaceY: 0, worldW: 0, worldH: 0, moonEventKind: 0 };

  /** 天塔柱全屏滤镜颜色/不透明度（ScreenEffectInitializer.cs:18-21 FilterMiniTower 1:1；
   *  类型映射 SceneState.cs:111-115：0 星璇/1 星云/2 星尘/3 耀斑/4 月总）。
   *  【依赖登记】柱背景天空贴图（VortexSky/NebulaSky/StardustSky/SolarSky/MoonLordSky）
   *  与 FilterMoonLord 专用 shader 未接入——此处只有滤镜层 */
  private static readonly MONOLITH_FILTER: Record<number, readonly [number, number, number, number]> = {
    0: [0, 0.7, 0.7, 0.5],        // MonolithVortex（ScreenEffectInitializer.cs:21）
    1: [1, 0, 0.9, 0.35],         // MonolithNebula（:18）
    2: [0, 0.5, 1, 0.5],          // MonolithStardust（:20）
    3: [1, 0.7, 0, 0.3],          // MonolithSolar（:19）
    4: [0.35, 0.3, 0.42, 0.35],   // MonolithMoonLord（:24 FilterMoonLord——深紫压暗近似）
  };

  /** 天塔柱滤镜：multiply 混合近似 shader 染色（result = screen × mix(白, 柱色, opacity)）。
   *  原版为全屏后处理（Filters.Scene）；此处只染天空+群系背景层，tile 前景不染——
   *  视觉近似点登记 */
  drawMonolithFilter(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    const f = SkyRenderer.MONOLITH_FILTER[this.fx.monolith];
    if (!f) return;
    const [r, g, b, a] = f;
    const mixv = (c: number) => Math.round(255 * (1 - a + c * a));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${mixv(r)},${mixv(g)},${mixv(b)})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  // ---- 派对气球天空（PartySky.cs 精简核：BirthdayParty.PartyIsUp 时激活）----
  private partyBalloons: Array<{ tex: number; variant: number; x: number; y: number; depth: number; speed: number }> = [];
  private partyTexs: Array<HTMLImageElement | null> = [null, null, null];

  /** 生成气球（PartySky.ResetBalloon :109-122 + GenerateBalloons :88-107：
   *  贴图 Extra_69/70 二选一（1/30 换 Extra_71）、variant 0-2、speed -1.5..-4、
   *  depth 1.6..3.35；X 绘制时模 4000 包裹 :325-330） */
  private spawnBalloon(viewH: number, respawn = false): void {
    this.partyBalloons.push({
      tex: Math.random() < 1 / 30 ? 2 : Math.floor(Math.random() * 2),
      variant: Math.floor(Math.random() * 3),
      x: Math.random() * 4000 - 500,
      y: respawn ? this.fx.surfaceY + 1600 : -viewH + Math.random() * (viewH + 1600),
      depth: 1.6 + Math.random() * 1.75,
      speed: -1.5 - 2.5 * Math.random(),
    });
  }

  // ---- 灯笼夜天空（LanternSky.cs 1:1，贴图 Extra_134 三变体 20×20）----
  private lanternTex: HTMLImageElement | null = null;
  private lanternOpacity = 0;   // _opacity：±0.01/帧向 LanternsUp 逼近（Update :119）
  private lanterns: Array<{
    x: number; y: number; depth: number; speed: number; variant: number;
    time: number; timeMax: number; rot: number; active: boolean;
  }> = [];
  private lanternsLeaving = false;

  /** ResetLantern（LanternSky.cs:103-111）：depth = (1-i/N)×4.4+1.6、
   *  speed = -1.5-2.5×rand、变体 0-2、漂浮倒计时 (2000+rand1200)×2 */
  private resetLantern(l: { depth: number; speed: number; variant: number; time: number; timeMax: number }, i: number): void {
    l.depth = (1 - i / this.lanterns.length) * 4.4 + 1.6;
    l.speed = -1.5 - 2.5 * Math.random();
    l.variant = Math.floor(Math.random() * 3);
    l.time = (2000 + Math.floor(Math.random() * 1200)) * 2;
    l.timeMax = l.time;
  }

  /** GenerateLanterns（:83-101）：N = maxTilesY/4，Y 带在世界地表上方（视口高度的
   *  0.7 视差源 → num..num-screenHeight 对应世界 px 带） */
  private generateLanterns(): void {
    const N = Math.max(24, Math.floor(this.fx.worldH / 4));
    this.lanterns = new Array(N);
    const surfacePx = this.fx.surfaceY * 1; // tile → px（fx.surfaceY 已是 px）
    for (let i = 0; i < N; i++) {
      const l = {
        x: Math.random() * this.fx.worldW * 16, y: 0,
        depth: 0, speed: 0, variant: 0, time: 0, timeMax: 1, rot: 0, active: true,
      };
      // 原版 y 带 = rand(minValue..num)，num = screenY×0.7 - 屏高、min = num - 地表px
      l.y = surfacePx - 900 + Math.random() * 900;
      this.resetLantern(l, i);
      l.active = true;
      this.lanterns[i] = l;
    }
  }

  /** 灯笼夜夜空绘制（LanternSky.Update/Draw 1:1：浮升 + 风漂移 + 深度视差 + X 4000 包裹）。
   *  载体注明：原版为 SkyManager「Lantern」自定义天空层（spritebatch），此处 canvas 2D
   *  以同参数直接绘制（视差 (1/depth, 0.9/depth)×1.2、深度 alpha 分档 0.3-1.0、
   *  三份旋转光晕副本 + 主贴图 :243-254） */
  private drawLanterns(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number, dtMs: number): void {
    const up = LanternNight.lanternsUp;
    // _opacity ±0.01/帧（:119）
    this.lanternOpacity = Math.max(0, Math.min(1, this.lanternOpacity + (up ? 0.01 : -0.01) * (dtMs / (1000 / 60))));
    if (this.lanternOpacity <= 0.001) {
      if (!up) { this.lanterns.length = 0; this.lanternsLeaving = false; }
      return;
    }
    // 相机在地表以下不画（Draw :165：screenPosition.Y > worldSurface×16 直接返回）
    if (camY > this.fx.surfaceY) return;
    if (!this.lanternTex) {
      const im = new Image();
      im.src = 'sprites/vanilla/Extra_134.png';
      this.lanternTex = im;
    }
    if (this.lanterns.length === 0 || (up && this.lanternsLeaving)) {
      this.generateLanterns();
      this.lanternsLeaving = false;
    }
    if (!up && !this.lanternsLeaving) this.lanternsLeaving = true; // Deactivate：升顶后逐个熄灭
    const tex = this.lanternTex;
    const frames = dtMs / (1000 / 60);
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    const w0 = wind === 0 ? 0.1 : wind;   // Update :126-130
    const N = this.lanterns.length;
    let drawing = 0;
    for (let i = 0; i < N; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;
      // Update :131-149
      const num2 = Math.sin(l.x / 120) * 0.5;
      l.y += num2 * 0.5 * frames;
      l.y += (l.speed * (l.time / l.timeMax)) * 0.5 * frames;   // FloatAdjustedSpeed
      l.x += (0.1 + w0) * (3 - l.speed) * 0.5 * ((i / N) + 1.5) / 2.5 * frames;
      l.rot = num2 * (w0 < 0 ? -1 : 1) * 0.5;
      l.time = Math.max(0, l.time - frames);
      if (l.y < 300) {
        if (!this.lanternsLeaving) {
          this.resetLantern(l, i);
          l.y = this.fx.surfaceY + 1600;
          l.x = Math.random() * this.fx.worldW * 16;
        } else {
          l.active = false;
          continue;
        }
      }
      drawing++;
    }
    if (drawing === 0 || !tex || !(tex.width > 0) || tex.width === 0) return;
    const fw = tex.width / 3, fh = tex.height;
    const cx = camX + viewW / 2, cy = camY + viewH / 2; // 屏中心（世界 px）
    const hourY = Math.sin(((performance.now() / 1000) % 6) / 6 * Math.PI * 2); // GlobalTime 6s 环绕的 Y 分量
    const flicker = hourY * 0.2 + 0.8;                  // DrawLantern :245-246
    for (let i = 0; i < N; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;
      // 深度 alpha 分档（:196-224）
      let mul = 1;
      if (l.depth > 5) mul = 0.3;
      else if (l.depth > 4.5) mul = 0.4;
      else if (l.depth > 4) mul = 0.5;
      else if (l.depth > 3.5) mul = 0.6;
      else if (l.depth > 3) mul = 0.7;
      else if (l.depth > 2.5) mul = 0.8;
      else if (l.depth > 2) mul = 0.9;
      const scale = (1 / l.depth) * 1.2, scaleY = (0.9 / l.depth) * 1.2;
      // 视差（:225-234）：(pos-屏中心)×(scale, scaleY)+屏中心，X 模 4000 包裹
      let sx = (l.x - cx) * scale + cx - camX;
      const sy = (l.y - cy) * scaleY + cy - camY;
      sx = (((sx + 500) % 4000) + 4000) % 4000 - 500;
      if (sx < -100 || sx > viewW + 100 || sy < -100 || sy > viewH + 100) continue;
      // 光晕三副本（:248-252）：绕 (0,2) 旋转 120° 均布 × 环绕 Y
      const glowA = 0.4 * mul * this.lanternOpacity * flicker;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(l.rot);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = glowA;
      for (let k = 0; k < 3; k++) {
        const a = (Math.PI * 2 * k) / 3 + l.rot;
        ctx.drawImage(tex, fw * l.variant, 0, fw, fh,
          Math.cos(a) * 2 * hourY - (fw * scale * 2) / 2,
          Math.sin(a) * 2 * hourY - (fh * scale * 2) / 2, fw * scale * 2, fh * scale * 2);
      }
      // 主贴图：Color(250,120,60,120) × 分档 × 不透明度（:194-253）
      ctx.globalAlpha = 0.47 * mul * this.lanternOpacity;
      ctx.drawImage(tex, fw * l.variant, 0, fw, fh, -(fw * scale * 2) / 2, -(fh * scale * 2) / 2, fw * scale * 2, fh * scale * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** 派对气球绘制（PartySky.Update/Draw :130-198 精简核：上升 + 风漂移 + 视差 1/depth） */
  private drawPartyBalloons(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, dtMs: number): void {
    if (!this.fx.party || this.fx.surfaceY <= 0) {
      this.partyBalloons.length = 0;
      return;
    }
    // 相机在地表以下不画（PartySky.Draw :172：screenPosition.Y > worldSurface*16 直接返回）
    if (this.partyTexs[0] === null) {
      for (let i = 0; i < 3; i++) {
        const im = new Image();
        im.src = `sprites/vanilla/Extra_${69 + i}.png`;
        this.partyTexs[i] = im;
      }
    }
    while (this.partyBalloons.length < 48) this.spawnBalloon(viewH);
    const frames = dtMs / (1000 / 60);
    const wind = this.wind;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const b of this.partyBalloons) {
      b.y += b.speed * frames;
      b.x += wind * (3 - b.speed) * frames;
      if (b.y < -viewH) {  // 升出屏顶：重掷（PartySky.Update :151-158）
        b.y = this.fx.surfaceY + 1600;
        b.x = Math.random() * 4000 - 500;
        b.tex = Math.random() < 1 / 30 ? 2 : Math.floor(Math.random() * 2);
        b.variant = Math.floor(Math.random() * 3);
        b.speed = -1.5 - 2.5 * Math.random();
        b.depth = 1.6 + Math.random() * 1.75;
      }
      const tex = this.partyTexs[b.tex];
      if (!tex || !(tex.width > 0) || tex.width === 0) continue;
      // 视差（:320-322：(pos - 屏中心) × (1/depth, 0.9/depth) + 屏中心）+ X 4000 包裹（:325-330）
      const par = 1 / b.depth;
      const sx = (((b.x - camX) * par + camX + 500) % 4000 + 4000) % 4000 - 500;
      const sy = (b.y - viewH / 2) * (0.9 * par) + viewH / 2;
      const fw = tex.width / 3, fh = tex.height / 3;
      const scale = par * 2 * 0.9;  // :337 vector2.X * 2 × 天色亮度 0.9 近似
      ctx.globalAlpha = 0.8;
      ctx.drawImage(tex, fw * b.variant, 0, fw, fh, sx, sy, fw * scale, fh * scale);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 原版三层绘制（DrawClouds_Distant/Closer/Closest + NextHorizonRenderer.DrawCloud）：
   *  按视口宽缩放（cloud.position.Y*(H/600) 语义近似为 y 带），远景(scale<1)压暗 R/G 通道。 */
  private lastCloudCamX: number | null = null;
  /** 垂直视差因子与 bgTopY（DrawSurfaceBG :58743-58744）：num3 = (300−camTop)/(worldSurface×16)、
   *  bgTopY = num3×1200+1190（scAdj=0）——云三通道 Y 变换的锚（fx.surfaceY=groundLevel×16） */
  private cloudBgTop(camY: number, viewH: number): { num3: number; bgTopY: number } {
    const camTop = camY - viewH / 2;
    const num3 = (300 - camTop) / Math.max(1, this.fx.surfaceY);
    return { num3, bgTopY: num3 * 1200 + 1190 };
  }
  /** 云三通道（Main.cs DrawClouds_Distant :59112 / _Closer :59093 / _Closest :59073）：
   *  distant（scale<1）画在群系背景【后】= sky 层内（DrawSurfaceBG 层间 :58755-58758）；
   *  closer/closest 画在背景【前】（drawCloudsNear，Renderer 于 biomeBg.draw 后调）。
   *  地表上门 = camTop < worldSurface×16+16（:59119） */
  private drawVanillaClouds(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, isNight: boolean, dtMs: number, camX = 0, camY = 0) {
    this.updateClouds(dtMs, viewW, camX);
    this.maintainClouds(viewW, viewH);
    const camTop = camY - viewH / 2;
    if (camTop >= this.fx.surfaceY + 16) return;
    const { num3 } = this.cloudBgTop(camY, viewH);
    const distY = num3 * 750 + 830;                          // :59115（scAdj/pushBGTopHack=0）
    this.drawCloudPass(ctx, this.vclouds.filter((c) => c.scale < 1), 1, camY,
      (c) => c.y + distY);
    void isNight;
  }
  /** DrawClouds_Closer + _Closest（:58871/:58942——群系背景层之后）：
   *  pass2 scale∈[1,1.15)：cY = y×(H/600)+bgTopY+150；pass3 ≥1.15：cY = y×(H/600)−100+bgTopY×1.01−150 */
  drawCloudsNear(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camY: number) {
    const camTop = camY - viewH / 2;
    if (camTop >= this.fx.surfaceY + 16) return;
    const { bgTopY } = this.cloudBgTop(camY, viewH);
    const sH = viewH / 600;
    this.drawCloudPass(ctx, this.vclouds.filter((c) => c.scale >= 1 && c.scale < 1.15), 2, camY,
      (c) => c.y * sH + bgTopY + 150);
    this.drawCloudPass(ctx, this.vclouds.filter((c) => c.scale >= 1.15), 3, camY,
      (c) => c.y * sH - 100 + bgTopY * 1.01 - 150);
    void viewW;
  }
  /** 单通道绘制（云色链 NextHorizonRenderer.DrawCloud :246-268 1:1）：
   *  cloudColor = ColorOfTheSkies×(scale×Alpha) → pass1 压暗 → ×atmo（二次）→ α×globalCloudAlpha
   *  （:58752 = max(cloudAlpha,墓园×.92)×atmo；ColorOfTheSkies 源 = 本帧天空色,存储侧已×atmo） */
  private drawCloudPass(
    ctx: CanvasRenderingContext2D, clouds: VanillaCloud[], pass: 1 | 2 | 3,
    camY: number, yOf: (c: VanillaCloud) => number,
  ) {
    if (!clouds.length) return;
    const atmo = this.atmoValue(camY);
    const wr = this.weatherRef;
    const basis = wr ? Math.max(wr.cloudAlpha, (wr.graveyardVisual ?? 0) * 0.92) : 0;
    const globalCloudAlpha = basis * atmo;
    const sky = hexRGB(this.lastSkyTop, atmo);
    const sorted = [...clouds].sort((a, b) => b.scale - a.scale);   // scale 交换序等价
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 原版云为软边贴图，平滑缩放
    for (const c of sorted) {
      const tex = this.cloudTex(c.type);
      if (!tex || !(tex.width > 0) || tex.width === 0) continue;
      const w = tex.width * c.scale, h = tex.height * c.scale;
      const k = Math.min(1, c.scale * c.alpha);              // cloudColor num（:203-215）
      let r = sky[0] * k, g = sky[1] * k, b = sky[2] * k;
      if (pass === 1) {                                      // OriginalColorsForCloud（:259-268）
        r *= c.scale * 0.8;
        g *= ((c.scale + 1) / 2) * 0.9;
      }
      r *= atmo; g *= atmo; b *= atmo;                       // DrawCloud :252-255
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.min(1, c.alpha * this.towerCloudMul) * globalCloudAlpha);
      ctx.translate(c.x + w / 2, yOf(c) + h / 2);
      ctx.rotate(c.rot);
      if (c.flip) ctx.scale(-1, 1);
      const tinted = this.cloudTint(tex, Math.round(r), Math.round(g), Math.round(b));
      ctx.drawImage(tinted, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private cloudTintCache = new Map<string, HTMLCanvasElement>();
  /** 云朵着色缓存（multiply + destination-in 保形） */
  private cloudTint(tex: HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement {
    const key = `${tex.src}|${r},${g},${b}`;
    const hit = this.cloudTintCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = true;
    cx.drawImage(tex, 0, 0);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(tex, 0, 0);
    this.cloudTintCache.set(key, c);
    if (this.cloudTintCache.size > 64) {
      const first = this.cloudTintCache.keys().next().value;
      if (first !== undefined) this.cloudTintCache.delete(first);
    }
    return c;
  }

  // ================= AmbientSky 天空实体（渲染层：群系背景之上、实体之下） =================

  /** 天空实体驱动输入（AmbienceServer 判定语义；Renderer 每帧注入到 fx.amb） */
  amb: {
    dayTime: boolean; raining: boolean; eclipse: boolean; bloodMoon: boolean;
    moonEventKind: 0 | 1 | 2; zoneHallow: boolean;
    playerX: number; playerY: number;
  } = { dayTime: true, raining: false, eclipse: false, bloodMoon: false, moonEventKind: 0, zoneHallow: false, playerX: 0, playerY: 0 };

  /** FadingSkyEntity（AmbientSky.cs:88-184）表示（模块级，见 AmbientEnt） */
  private ambEntities: AmbientEnt[] = [];
  /** AmbientSky._frameCounter（每 60Hz tick +1） */
  private ambFrame = 0;
  /** AmbienceServer._updatesUntilNextAttempt */
  private ambNextAttempt = 0;
  /** 族贴图缓存（texKey → Image，首用懒加载） */
  private ambTexCache = new Map<string, HTMLImageElement>();
  /** NPC.butterflyChance（NPC.cs:94583-94599 每日黎明掷）——按 dayCount 重掷 */
  private butterflyDay = -1;
  private butterflyChance = 999999;
  /** 最近天空色（GetColor 的 bgColor = Main.ColorOfTheSkies；sky.draw 每帧写入） */
  private lastSkyTop = '#4A90E0';
  private lastSkyBottom = '#B8DCF5';

  /** 清空（退世界/换图时由 Game.destroy 调用，防跨世界残留） */
  clearAmbience(): void {
    this.ambEntities = [];
    this.ambFrame = 0;
    this.ambNextAttempt = 0;
    this.butterflyDay = -1;
    this.clearTowerSky();
    this.clearMoonlordDrama();
  }

  /** SetPositionInWorldBasedOnScreenSpace（AmbientSky.cs:47-51）：
   *  屏幕空间提议位 → 世界位（相对相机中心的偏移 × depth/3） */
  private ambientWorldPos(sx: number, sy: number, depth: number, camX: number, camY: number): [number, number] {
    return [camX + (sx - camX) * (depth / 3), camY + (sy - camY) * (depth / 3)];
  }

  /** 族贴图键（各族 Texture 请求 1:1；变体族按掷点/深度/昼夜选表） */
  private ambientTexKey(kind: AmbientFamily, r: () => number, depth: number): { key: string; rows: number; variant: number } {
    switch (kind) {
      case 'birds': return { key: 'Ambience_BirdsVShape', rows: 4, variant: 0 };                    // :462
      case 'wyvern': return { key: 'Ambience_Wyvern', rows: 5, variant: 0 };                        // :1044
      case 'airship': return { key: 'Ambience_FlyingShip', rows: 4, variant: 0 };                   // :1100
      case 'airballoon':                                                                            // :1138
        return { key: Math.floor(r() * 2) === 0 ? 'Ambience_AirBalloons_Large' : 'Ambience_AirBalloons_Small', rows: 5, variant: 0 };
      case 'eyeball': return { key: 'Ambience_EOC', rows: 3, variant: 0 };                          // :1241
      case 'butterflies': {                                                                         // :204-206
        const n = Math.floor(r() * 2) + 1;
        return { key: `Ambience_ButterflySwarm${n}`, rows: n === 2 ? 19 : 17, variant: n };
      }
      case 'lostkite': return { key: 'Ambience_LostKite', rows: 42, variant: 0 };                   // :249-250
      case 'vulture': return { key: 'Ambience_Vulture', rows: 10, variant: 0 };                     // :356
      case 'bats': { const n = 1 + Math.floor(r() * 3); return { key: `Ambience_Bat${n}`, rows: 10, variant: n }; }   // :945
      case 'pixieposse': {                                                                          // :409-413
        const n = this.amb.dayTime ? 1 : 2;
        return { key: `Ambience_PixiePosse${n}`, rows: 25, variant: n };
      }
      case 'seagulls': return { key: 'Ambience_Seagull', rows: 9, variant: 0 };                     // :514
      case 'slimeBalloons': return { key: 'Ambience_SlimeBalloons', rows: 7, variant: 0 };          // :734
      case 'gastropod': return { key: 'Ambience_Gastropod', rows: 1, variant: 0 };                  // :627
      case 'pegasus': return { key: 'Ambience_Pegasus', rows: 11, variant: 0 };                     // :307
      case 'eos': case 'crimera': {                                                                 // :1183-1193/:1207-1217
        let n = 3;
        if (depth <= 6) n = 2;
        if (depth <= 5) n = 1;
        return { key: `${kind === 'eos' ? 'Ambience_EOS' : 'Ambience_Crimera'}${n}`, rows: kind === 'eos' ? 4 : 3, variant: n };
      }
      case 'hellbats': { const n = 1 + Math.floor(r() * 2); return { key: `Ambience_HellBat${n}`, rows: 10, variant: n }; }  // :833
    }
  }

  private mkAmbient(kind: AmbientFamily, sx: number, sy: number, depth: number, dir: 1 | -1,
    life: number, camX: number, camY: number, texKey: string, rows: number, variant: number): AmbientEnt {
    const spec = AMBIENT_FAMILY_PARAMS[kind];
    const [x, y] = this.ambientWorldPos(sx, sy, depth, camX, camY);
    return {
      kind, x, y, depth, dir, life, bornAt: this.ambFrame,
      fadeIn: spec.fadeIn, fadeOut: spec.fadeOut,
      frame: spec.frameRandom ? Math.floor(Math.random() * rows) : 0,
      rows, framingSpeed: spec.framingSpeed || 0x7fffffff,
      frameOffset: spec.frameOffset ? Math.floor(Math.random() * rows) : 0,
      opacity: 0, vx: 0, vy: 0, rotation: 0,
      brightness: spec.brightness, depthScaleAdj: spec.depthScaleAdj ?? 0,
      grayDepthFade: !!spec.grayDepthFade, texKey, variant,
      magAccX: 0, magAccY: 0, magTX: 0, magTY: 0, magPX: 0, magPY: 0, magVX: 0, magVY: 0,
      state: 0, waviness: 0, dead: false,
    };
  }

  /** 生成一族（AmbientSky.Spawn :1425-1537 分发 → 各类构造器/CreateGroup 1:1） */
  private spawnAmbientFamily(kind: AmbientFamily, camX: number, camY: number): void {
    const r = Math.random;
    const spec = AMBIENT_FAMILY_PARAMS[kind];
    const group = AMBIENT_GROUP_SPEC[kind];
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    // spriteDir（各族 :191 等：WindForVisuals≤0 → Flip；Airship :1087/AirBalloon :1134 = random.Next(2)）
    const dir: 1 | -1 = spec.randomDir
      ? (Math.floor(r() * 2) !== 0 ? -1 : 1)
      : (wind > 0 ? 1 : -1);
    // VirtualCamera（VirtualCamera.cs:5-14）：Position = 玩家中心 − 2048、Size = 4096²
    // （Main.cs:3753-3755 HiDef 档）——出生域以玩家为锚，与渲染视口无关
    const px = this.amb.playerX;
    const vcamX = px - VIRTUAL_CAM_HALF;                       // vcam.Position.X
    const vcamY = this.amb.playerY - VIRTUAL_CAM_HALF;         // vcam.Position.Y
    // :452-459（各族同构）：Effects==None（顺风）→ 左沿外 100；Flip → 右沿(Position.X+Size.X)外 100
    const edgeX = dir > 0 ? vcamX - 100 : vcamX + VIRTUAL_CAM_SIZE + 100;
    const mk = (sx: number, sy: number, d: number, l: number, key: string, rows: number, variant: number) =>
      this.mkAmbient(kind, sx, sy, d, dir, l, camX, camY, key, rows, variant);
    const randLife = () => (spec.life[0] + Math.floor(r() * (spec.life[1] - spec.life[0]))) * 60;

    // EOCSkyEntity 族（eyeball/eos/crimera :1238-1258）：3/4 折线 / 1/4 追玩家；不走常规 y 带
    if (spec.eoc) {
      const depth = spec.depthMin + r() * spec.depthSpan;           // :1243
      const t = this.ambientTexKey(kind, r, depth);
      const life = randLife();                                      // :1263/:1281 Next(18,31)*60
      let e: AmbientEnt;
      if (Math.floor(r() * 4) !== 0) {
        // BeginZigZag :1260-1276：方向掷（1 = 左侧入屏右飞）；y=虚拟相机顶、x 对侧域外
        const d: 1 | -1 = Math.floor(r() * 2) === 1 ? 1 : -1;
        e = mk(d === 1 ? vcamX - 100 : vcamX + VIRTUAL_CAM_SIZE + 100, vcamY, depth, life, t.key, t.rows, t.variant);
        e.state = 1; e.dir = d; e.waviness = 1 + r();               // :1265
      } else {
        // BeginChasingPlayer :1278-1283：虚拟相机 4096² 域内均匀随机点
        e = mk(vcamX + r() * VIRTUAL_CAM_SIZE, vcamY + r() * VIRTUAL_CAM_SIZE, depth, life, t.key, t.rows, t.variant);
        e.state = 2;
      }
      this.ambEntities.push(e);
      return;
    }
    // AirBalloon（:1130-1147）：锚玩家列 ±100 格、地表上 50-80 格（不走常规 y 带）
    if (kind === 'airballoon') {
      const depth = spec.depthMin + r() * spec.depthSpan;
      const t = this.ambientTexKey(kind, r, depth);
      const sx = (Math.floor(px / 16) + 100 * (r() * 2 - 1)) * 16;  // :1133-1135
      const sy = this.fx.surfaceY - (50 + Math.floor(r() * 31)) * 16;  // :1136 Next(50,81)
      this.ambEntities.push(mk(sx, sy, depth, randLife(), t.key, t.rows, t.variant));
      return;
    }
    // 常规高度带 y = yOff + rand*(surfacePx - ySub - yOff)（各族 :201/:246/:304/:353/:411/
    // :459/:511/:624/:731/:942/:1041/:1097）；HellBats = 地狱层 + rand*800（:890）
    const bandY = () => spec.hellBand
      ? this.underworldLayerPx() + r() * 800
      : r() * Math.max(0, this.fx.surfaceY - spec.ySub - spec.yOff) + spec.yOff;
    const depth = () => spec.depthMin + r() * spec.depthSpan;
    if (group) {
      // CreateGroup（:564-598/:672-705/:771-804/:874-907/:990-1023）
      const count = group.count[0] + Math.floor(r() * (group.count[1] - group.count[0]));
      const baseY = bandY();
      const baseDepth = depth();
      // 群族基础寿命 = Next(a,b)*60（与单体 spec.life 不同：Gastropod/Seagulls/Bats/HellBats 30-60s）
      const baseLife = (group.baseLife[0] + Math.floor(r() * (group.baseLife[1] - group.baseLife[0]))) * 60;
      const accX = group.accX[0] + r() * group.accX[1];             // :584/:691/:790/:893/:1009
      const accY = group.accY[0] + r() * group.accY[1];
      const tX = (r() * 2 - 1) * group.target, tY = (r() * 2 - 1) * group.target;  // :585/:692/:791/:894/:1010
      for (let i = 0; i < count; i++) {
        const d = baseDepth + r() * group.depthJitter;              // :589/:696/:795/:898/:1014
        const tex = this.ambientTexKey(kind, r, d);
        const ox = (r() * 20 - 10) * group.spread, oy = r() * 3 * group.spread;    // :590/:697/:796/:899/:1015
        const e = mk(edgeX + ox, baseY + oy, d, baseLife + Math.floor(r() * group.lifeJitter), tex.key, tex.rows, tex.variant);
        const k = (r() * group.factorA + group.factorB) * 0.05;     // :594/:701/:800/:903/:1019
        e.magAccX = accX * k; e.magAccY = accY * k;
        e.magTX = tX; e.magTY = tY;
        this.ambEntities.push(e);
      }
      return;
    }
    // 单体族
    const d = depth();
    const tex = this.ambientTexKey(kind, r, d);
    this.ambEntities.push(mk(edgeX, bandY(), d, randLife(), tex.key, tex.rows, tex.variant));
  }

  /** StartFadingOut（AmbientSky.cs:170-176）：把出生点前推到"淡出已开始"的时刻 */
  private ambientStartFadingOut(e: AmbientEnt, frame: number): void {
    const n = Math.floor(e.life * e.fadeOut);
    const t = frame - n;
    if (t < e.bornAt) e.bornAt = t;
  }

  /** FadingSkyEntity.Update（AmbientSky.cs:103-121）+ 各族 UpdateVelocity/Update */
  private stepAmbientEntity(e: AmbientEnt, frame: number, wind: number): void {
    const spec = AMBIENT_FAMILY_PARAMS[e.kind];
    const age = frame - e.bornAt;
    if (age >= e.life) { e.dead = true; return; }                  // IsMovementDone :128-140
    // UpdateOpacity :151-165：淡出段（age≥life×fadeOut）反向 1→0
    e.opacity = age >= e.life * e.fadeOut
      ? lerpValueClamped(e.life, e.life * e.fadeOut, age)
      : lerpValueClamped(0, e.life * e.fadeIn, age);
    // 帧推进 :110-113（(frame+FrameOffset)%FramingSpeed==0 → 下一行）；
    // LostKite 风暴时 FramingSpeed=4（:276-279）
    const fs = e.kind === 'lostkite' && this.storming() ? 4 : e.framingSpeed;
    if (fs < 0x7fffffff && ((frame + e.frameOffset) % fs) === 0) {
      e.frame = (e.frame + 1) % e.rows;
    }
    // SlimeBalloons :758 / LostKite :280：每帧按风重估朝向
    if (e.kind === 'slimeBalloons' || e.kind === 'lostkite') e.dir = wind > 0 ? 1 : -1;
    const group = AMBIENT_GROUP_SPEC[e.kind];
    if (spec.eoc) {
      // EOCSkyEntity.UpdateVelocity :1285-1297
      if (e.state === 1) {
        // ZigzagMove :1299-1302：dir*3 横速 + cos(frame/1200×2π)×waviness 纵摆
        e.vx = e.dir * 3;
        e.vy = Math.cos((frame / 1200) * Math.PI * 2) * e.waviness;
      } else {
        // ChasePlayerTop :1304-1313：朝玩家上方 500px 以 0.1/tick 加速，钳 ±18
        const p = this.frameCtx?.player;
        if (p) {
          const dx = p.cx - e.x, dy = (p.cy - 500) - e.y;
          if (Math.hypot(dx, dy) >= 100) {
            e.vx = Math.max(-18, Math.min(18, e.vx + 0.1 * Math.sign(dx)));
            e.vy = Math.max(-18, Math.min(18, e.vy + 0.1 * Math.sign(dy)));
          }
        }
      }
      e.rotation = Math.atan2(e.vy, e.vx);                         // :1296
    } else if (group) {
      // 磁吸弹簧（Seagulls :530-537 / Gastropod :637-644 / Slime :745-752 /
      // Bats :961-967 / HellBats :849-855 同构）
      e.magVX += e.magAccX * Math.sign(e.magTX - e.magPX);
      e.magVY += e.magAccY * Math.sign(e.magTY - e.magPY);
      e.magPX += e.magVX; e.magPY += e.magVY;
      e.vx = (spec.speedA + Math.abs(wind) * spec.speedB) * e.dir + e.magVX;
      e.vy = (spec.vy ?? 0) + e.magVY;
      if (e.kind === 'gastropod' || e.kind === 'slimeBalloons') e.rotation = e.vx * 0.1;  // :644/:752
    } else if (e.kind === 'airballoon') {
      // :1149-1165：vx = wind*4；vy = -(3+|wind|)，y<worldSurface×12/8/4 三档各减半
      e.vx = wind * 4;
      let rise = 3 + Math.abs(wind);
      const surfTiles = this.fx.surfaceY / 16;
      if (e.y < surfTiles * 12) rise *= 0.5;
      if (e.y < surfTiles * 8) rise *= 0.5;
      if (e.y < surfTiles * 4) rise *= 0.5;
      e.vy = -rise;
    } else if (e.kind === 'lostkite') {
      // :264-272：1.2+|wind|×3，风暴 ×1.5
      let v = spec.speedA + Math.abs(wind) * spec.speedB;
      if (this.storming()) v *= 1.5;
      e.vx = v * e.dir; e.vy = 0;
    } else {
      // 常规单体族（Birds :472-474 / Wyvern :1054-1057 / Airship :1110-1113 / Butterflies
      // :215-218 / Vulture :366-369 / PixiePosse :423-426 / Pegasus :317-320）
      e.vx = (spec.speedA + Math.abs(wind) * spec.speedB) * e.dir;
      e.vy = 0;
    }
    e.x += e.vx; e.y += e.vy;                                      // :115 Position += Velocity
  }

  /** 各族 Update 尾部的环境门（StartFadingOut 触发条件 1:1） */
  private ambientEnvGate(e: AmbientEnt, frame: number): void {
    const a = this.amb;
    const rainDayEclipse = a.raining || !a.dayTime || a.eclipse;   // Birds :481 等 8 族同构
    let out = false;
    switch (e.kind) {
      case 'gastropod':   // :650
        out = a.raining || a.dayTime || a.bloodMoon || a.moonEventKind === 2 || a.moonEventKind === 1;
        break;
      case 'pixieposse':  // :432：昼夜变体错位即淡出 + 雨/日食/血月/南瓜霜月
        out = (e.variant === 1 && !a.dayTime) || (e.variant === 2 && a.dayTime) || a.raining
          || a.eclipse || a.bloodMoon || a.moonEventKind === 2 || a.moonEventKind === 1;
        break;
      case 'slimeBalloons':  // :759
        out = !this.windyDay() || a.raining || !a.dayTime || a.eclipse;
        break;
      case 'lostkite':    // :282（无雨门）
        out = !a.dayTime || a.eclipse;
        break;
      case 'birds': case 'vulture': case 'pegasus': case 'seagulls':
      case 'airship': case 'airballoon': case 'butterflies': case 'bats':
        out = rainDayEclipse;
        break;
      default:
        // Wyvern/Eyeball/EOS/Crimera/HellBats 无 Update 覆盖 = 无环境门
        out = false;
        break;
    }
    if (out) this.ambientStartFadingOut(e, frame);
  }

  /**
   * 天空实体推进 + 绘制。由 Renderer 在群系背景（biomeBg）之后、世界实体变换之前调用
   * （原版 SkyManager「Ambience」天空层叠在 DrawBG 之上、tile 之前）。
   * 调度 1:1 AmbienceServer.Update :96-129：到期一次尝试（间隔 Next(600,7200)=10-120s），
   * 选族走 pickAmbientFamily（全 17 族）；Main.rand.Next(5)<3（60%）放宽次级条件。
   */
  drawAmbience(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    camX: number, camY: number, dtMs = 16.7): void {
    if (this.fx.surfaceY <= 0) return;   // 未进世界（fx 未注入）
    const ticks = Math.max(1, Math.round(dtMs / (1000 / 60)));
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    const moonlord = this.moonLordPresent();   // :1362-1369 月总天空冲突 → Ambience 禁出
    for (let f = 0; f < ticks; f++) {
      this.ambFrame++;
      if (this.ambNextAttempt > 0) {
        this.ambNextAttempt -= 1;                                   // :100-104
      } else if (!moonlord) {
        this.ambNextAttempt = 600 + Math.floor(Math.random() * 6600);  // :133 Next(600,7200)
        const a = this.amb;
        const fam = pickAmbientFamily({
          dayTime: a.dayTime, raining: a.raining, eclipse: a.eclipse, bloodMoon: a.bloodMoon,
          pumpkinMoon: a.moonEventKind === 2, snowMoon: a.moonEventKind === 1,
          zoneHallow: a.zoneHallow,
          zoneDesert: !!this.frameCtx?.scene?.zoneDesert,           // :77
          zoneBeach: !!this.frameCtx?.scene?.zoneBeach,             // :79
          zoneJungle: !!this.frameCtx?.scene?.zoneJungle,           // :84
          zoneCorrupt: !!this.frameCtx?.scene?.zoneCorrupt,         // :82
          zoneCrimson: !!this.frameCtx?.scene?.zoneCrimson,         // :83
          hardMode: this.hardMode(),                                // :61
          windyDay: this.windyDay(),                                // Main.cs:2976
          sunset: this.isSunset(),                                  // :39-46
          tooWindyForButterflies: Math.abs(this.weatherRef?.windSpeedTarget ?? 0) >= 0.4,  // NPC.cs:6801
          butterflyChanceLow: this.butterflyChanceLow(),            // :65
          playerAtSkyHeight: a.playerY <= this.fx.surfaceY + 1600,  // :190-193
          playerAtHellHeight: a.playerY >= (this.underworldLayerPx() - 100) * 16,  // :195-198
          moonLordActive: moonlord,                                 // :1362-1369
          roll5: Math.floor(Math.random() * 5),
          pick: Math.random(),
        });
        if (fam) this.spawnAmbientFamily(fam, camX, camY);
      }
      for (const e of this.ambEntities) {
        if (moonlord) this.ambientStartFadingOut(e, this.ambFrame); // :1383-1385 冲突即整体淡出
        this.stepAmbientEntity(e, this.ambFrame, wind);
        this.ambientEnvGate(e, this.ambFrame);
      }
      this.ambEntities = this.ambEntities.filter((e) => !e.dead);
    }
    // 月总死亡戏剧（DrawPieces/DrawExplosions Main.cs:62711-62712：WoF/背景碎块之后、
    // NPC 缓存之前 = tile 之前——本仓 pre-world 变换段等价；白闪走帧尾
    // drawMoonlordWhiteFlash（Renderer 7c' 段））
    this.drawMoonlordDrama(ctx, camX, camY, viewW, viewH, this.frameCtx?.z ?? 1);
    if (!this.ambEntities.length) return;
    // atmo（Game.updateWeather 同公式，Main.cs:62622）——CommonDraw :76 color × atmo
    const atmo = Math.max(0, Math.min(1,
      (camY / 16 - (65 + 10 * (this.fx.worldW / 4200) ** 2)) / Math.max(1, this.fx.surfaceY / 16 / 5)));
    // GetColor 的 bgColor = Main.ColorOfTheSkies；以本帧天空底色近似（登记）
    const sky = this.lastSkyBottom;
    const sv = parseInt(sky.slice(1), 16);
    const sr = (sv >> 16) & 255, sg = (sv >> 8) & 255, sb = sv & 255;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const e of this.ambEntities) {
      const tex = this.ambTex(e.texKey);
      if (!tex || !(tex.width > 0) || tex.width === 0) continue;
      // GetDrawPositionByDepth :85-88：(Position-相机中心)×(1/depth, 0.9/depth)+相机中心
      const wx = (e.x - camX) / e.depth + camX;
      const wy = (e.y - camY) * 0.9 / e.depth + camY;
      const sx = wx - camX + viewW / 2;
      const sy = wy - camY + viewH / 2;
      if (sx < -400 || sx > viewW + 400 || sy < -400 || sy > viewH + 400) continue;
      const fw = tex.width, fh = tex.height / e.rows;
      const scale = (3 + e.depthScaleAdj) / e.depth;   // CommonDraw :79 + 各族 Draw depthScale 偏移
      // GetColor（各族覆盖）：
      //  常规 = Lerp(bg, 白, BrightnessLerper)（:165-168）；
      //  gastropod = Lerp(bg, (102,0,63), 0.75)（:658 + Colors.cs:39）；
      //  hellbats = Lerp(白, 灰, Depth/15)（:871，无 atmo 乘）
      let cr: number, cg: number, cb: number;
      if (e.kind === 'gastropod') {
        cr = sr + (102 - sr) * 0.75; cg = sg * 0.25; cb = sb + (63 - sb) * 0.75;
      } else if (e.grayDepthFade) {
        const k = Math.min(1, e.depth / 15);
        cr = 255 + (128 - 255) * k; cg = cr; cb = cr;
      } else {
        const b = e.brightness;
        cr = sr + (255 - sr) * b; cg = sg + (255 - sg) * b; cb = sb + (255 - sb) * b;
      }
      // GetColor 染色落贴图 RGB（XNA SourceBlend.One 预乘语义：out = texel.RGB × color.RGB）：
      //  multiply 预染缓存（量化 1/16 限幅防缓存打爆——同火把 Disco 16 档先例）
      const key8 = `${e.texKey}:${e.frame}:${cr >> 4},${cg >> 4},${cb >> 4}`;
      let tinted = AMB_TINT_CACHE.get(key8);
      if (!tinted) {
        tinted = document.createElement('canvas');
        tinted.width = fw; tinted.height = fh;
        const tc = tinted.getContext('2d')!;
        tc.drawImage(tex, 0, e.frame * fh, fw, fh, 0, 0, fw, fh);
        tc.globalCompositeOperation = 'multiply';
        tc.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        tc.fillRect(0, 0, fw, fh);
        tc.globalCompositeOperation = 'destination-in';
        tc.drawImage(tex, 0, e.frame * fh, fw, fh, 0, 0, fw, fh);
        if (AMB_TINT_CACHE.size > 96) AMB_TINT_CACHE.clear();   // 简易容量闸
        AMB_TINT_CACHE.set(key8, tinted);
      }
      // 群系前景背景层 alpha 乘子（各族 GetColor 覆盖 ×Main.bgAlphaFrontLayer[i]，索引语义
      //  = Main.cs:58951-59030 的 bgStyle 槽：0/10-12 森林系 1 腐化 2 沙漠 3 丛林 4 海洋
      //  5/13/14 善恶沙漠 6 神圣 7 雪原 8 猩红 9 蘑菇——与 BiomeBackground.bgStyle 同表）
      const alpha = Math.min(1, e.opacity * (e.grayDepthFade ? 1 : atmo)
        * this.familyBiomeAlphaMul(e.kind));
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      ctx.rotate(e.rotation);
      if (e.dir < 0) ctx.scale(-1, 1);   // SpriteEffects.FlipHorizontally
      ctx.drawImage(tinted, -fw * scale / 2, -fh * scale / 2, fw * scale, fh * scale);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ================= 帧数据挂点 + 各子系统共用的小读数 =================

  /** Renderer.render 每帧一行注入；null = 未进世界（各子系统自静默） */
  frameCtx: SkyFrameCtx | null = null;

  /** Main.bgAlphaFrontLayer 等价源（BiomeBackground.alphaFront，逐 bgStyle 槽的渐变 alpha；
   *  Renderer 初始化时 attachBiomeBg 注入）。null = 未注入（菜单等），乘子按 1。 */
  private bgAlphaFront: ArrayLike<number> | null = null;
  attachBiomeBgAlpha(front: ArrayLike<number>): void {
    this.bgAlphaFront = front;
  }
  private bgFront(i: number): number {
    const a = this.bgAlphaFront;
    return a ? (a[i] ?? 0) : 1;
  }

  /** 各族 GetColor 的群系前景层乘子（AmbientSky.cs 六族覆盖 1:1；其余族无覆盖 = 1）：
   *  Pegasus×[6]（:334 神圣）/ Vulture×max([2],[5],[13],[14])（:383-385 沙漠系）/
   *  Seagulls×[4]（:556 海洋）/ Bats×Utils.Max([3],[0],[10],[11],[12])（:987 丛林+森林系）/
   *  Crimera×[8]（:1198 猩红）/ EOS×[1]（:1222 腐化）。索引槽语义见 Main.cs:58951-59030。 */
  private familyBiomeAlphaMul(kind: AmbientFamily): number {
    switch (kind) {
      case 'pegasus': return this.bgFront(6);
      case 'vulture': return Math.max(this.bgFront(2), this.bgFront(5), this.bgFront(13), this.bgFront(14));
      case 'seagulls': return this.bgFront(4);
      case 'bats': return Math.max(this.bgFront(3), this.bgFront(0), this.bgFront(10), this.bgFront(11), this.bgFront(12));
      case 'crimera': return this.bgFront(8);
      case 'eos': return this.bgFront(1);
      default: return 1;
    }
  }

  /** 族贴图首用懒加载（texKey → Image；未就绪调用方跳帧自愈） */
  private ambTex(key: string): HTMLImageElement | null {
    let t = this.ambTexCache.get(key);
    if (!t) {
      t = loadTex(`${key}.png`);
      this.ambTexCache.set(key, t);
    }
    return t;
  }

  /** Main.IsItStorming（Main.cs:2978 = _shouldUseStormMusic） */
  private storming(): boolean { return !!this.weatherRef?.shouldUseStormMusic; }
  /** Main.IsItAHappyWindyDay（Main.cs:2976 = _shouldUseWindyDayMusic） */
  private windyDay(): boolean { return !!this.weatherRef?.shouldUseWindyDayMusic; }
  private hardMode(): boolean { return !!this.frameCtx?.world?.flags?.hardMode; }

  /** 地狱顶 px（Main.UnderworldLayer = maxTilesY-200；lavaLine 缺省回退） */
  underworldLayerPx(): number {
    const fc = this.frameCtx;
    if (!fc?.world) return 0;
    return (fc.world.lavaLine || (fc.world.h - 200)) * 16;
  }

  /** IsSunset（AmbienceServer.cs:39-46：白天且 Main.time>40500 → timeOfDay>0.625） */
  private isSunset(): boolean {
    const c = this.frameCtx?.clock;
    return !!c && c.isDay && c.timeOfDay > 0.625;
  }

  /** NPC.butterflyChance<6（AmbienceServer.cs:65）。NPC.cs:94583-94599 每日黎明掷：
   *  1/3 无蝶；否则 Next(1,21) 且 1/5 无蝶 → <6 仅约 13% 的日子有天空蝶群 */
  private butterflyChanceLow(): boolean {
    const day = this.frameCtx?.clock?.dayCount ?? -1;
    if (day !== this.butterflyDay) {
      this.butterflyDay = day;
      if (Math.random() < 1 / 3) this.butterflyChance = 999999;
      else {
        this.butterflyChance = 1 + Math.floor(Math.random() * 20);
        if (Math.random() < 1 / 5) this.butterflyChance = 999999;
      }
    }
    return this.butterflyChance < 6;
  }

  /** 月总在场（SceneState.cs:109 ClosestNPCPosition[398] != Zero → MoonLord 天空激活，
   *  同时 :1362-1369 与 Ambience 冲突） */
  private moonLordPresent(): boolean { return this.dramaCore !== null; }

  // ================= 月塔天空装饰层（Nebula/Solar/Stardust/Vortex Sky 1:1） =================

  /** 四塔族索引（SceneState.cs:111-115 MonolithType 映射：0 星璇/1 星云/2 星尘/3 耀斑） */
  private static readonly TOWER_FAMILY = ['vortex', 'nebula', 'stardust', 'solar'] as const;
  /** 塔族 → 塔 NPC id（NPCID：422 星璇 / 507 星云 / 493 星尘 / 517 耀斑） */
  private static readonly TOWER_NPC: Record<TowerFamily, number> =
    { vortex: 422, nebula: 507, stardust: 493, solar: 517 };

  private towerSky: Record<TowerFamily, TowerSkyState> = {
    vortex: new TowerSkyState(), nebula: new TowerSkyState(),
    stardust: new TowerSkyState(), solar: new TowerSkyState(),
  };

  clearTowerSky(): void {
    for (const k of SkyRenderer.TOWER_FAMILY) this.towerSky[k].reset();
  }

  /** SceneState.ApplyVisuals :105-115 每帧扫描：近距门（SceneMetrics.cs:276-282/921-928
   *  距离²≤4000²）+ 器件门（!flag4 && ActiveMonolithType==N）→ Activate/Deactivate */
  private updateTowerSky(): void {
    const fc = this.frameCtx;
    const player = fc?.player;
    const monolith = this.fx.monolith;
    const maxTilesX = fc?.world?.w ?? Math.max(1, Math.round(this.fx.worldW));
    const surfacePx = this.fx.surfaceY;
    const near: Partial<Record<TowerFamily, boolean>> = {};
    let anyTowerNear = false;
    if (fc && player) {
      for (const fam of SkyRenderer.TOWER_FAMILY) {
        const npcId = SkyRenderer.TOWER_NPC[fam];
        let found = false;
        for (const e of fc.entities) {
          if (e.vanillaId !== npcId || e.dead) continue;
          const d2 = (e.cx - player.cx) ** 2 + (e.cy - player.cy) ** 2;
          if (d2 <= 4000 * 4000) { found = true; break; }   // NPCEventZoneRadius（SceneMetrics.cs:130）
        }
        near[fam] = found;
        if (found) anyTowerNear = true;
      }
    }
    for (let idx = 0; idx < SkyRenderer.TOWER_FAMILY.length; idx++) {
      const fam = SkyRenderer.TOWER_FAMILY[idx];
      const active = towerSkyActive(!!near[fam], monolith, idx, anyTowerNear);
      this.towerSky[fam].setActive(active, fam, maxTilesX, surfacePx);
    }
  }

  /** 绘制四塔天空层（sky.draw 星星之后、日月之前——原版 SkyManager 远景层在星星后） */
  private drawTowerSky(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    camX: number, camY: number, dtMs: number): void {
    this.updateTowerSky();
    const fc = this.frameCtx;
    const maxTilesX = fc?.world?.w ?? Math.max(1, Math.round(this.fx.worldW));
    const surfacePx = this.fx.surfaceY;
    const screenX = camX - viewW / 2, screenY = camY - viewH / 2;
    for (const fam of SkyRenderer.TOWER_FAMILY) {
      this.towerSky[fam].update(fam, dtMs);
      this.towerSky[fam].draw(ctx, fam, viewW, viewH, screenX, screenY, maxTilesX, surfacePx);
    }
  }

  /** 当前塔天空云量乘子（GetCloudAlpha 四族同式；任一激活即取最小） */
  towerCloudAlphaMul(): number {
    let mul = 1;
    for (const fam of SkyRenderer.TOWER_FAMILY) {
      if (this.towerSky[fam].fade > 0.001) {
        mul = Math.min(mul, (1 - this.towerSky[fam].fade) * 0.3 + 0.7);
      }
    }
    return mul;
  }

  // ================= 月总死亡戏剧（MoonlordDeathDrama.cs 1:1） =================
  // 消费锚点：ThrowPieces = NPC.cs:83496（398 终死 HitEffect(0,1337)）；
  // AddExplosion = NPC.cs:36982（死亡态 ai0==2，ai1%3==0 且 60<ai1<580）；
  // RequestLight = :36796/:36820（出生态 -1/-2 闪白 ai1/30）与 :37055（死亡态 ≥480 段）。
  // 任务描述"登场爆炸"系推测有误：Misc/MoonExplosion 五件贴图全部挂在**死亡**戏剧。

  private dramaCore: { cx: number; cy: number; ai0: number; ai1: number } | null = null;
  private dramaPieces: DramaPiece[] = [];
  private dramaExplosions: DramaExplosion[] = [];
  /** whitening/requestedLight（:154-156）——MoveTowards 0.02/帧 */
  private dramaWhitening = 0;
  private dramaRequestedLight = 0;
  private dramaLightRequestedThisFrame = false;

  clearMoonlordDrama(): void {
    this.dramaCore = null;
    this.dramaPieces = [];
    this.dramaExplosions = [];
    this.dramaWhitening = 0;
    this.dramaRequestedLight = 0;
  }

  /** 每帧扫描 398（Renderer frameCtx.entities）→ 死亡戏剧触发/爆炸/白光请求 */
  private updateMoonlordDrama(dtFrames: number): void {
    const fc = this.frameCtx;
    const world = fc?.world ?? null;
    let core: { cx: number; cy: number; ai0: number; ai1: number } | null = null;
    if (fc) {
      for (const e of fc.entities) {
        if (e.vanillaId !== 398 || e.dead) continue;
        core = { cx: e.cx, cy: e.cy, ai0: e.ai0 ?? 0, ai1: e.ai1 ?? 0 };
        break;
      }
    }
    const prev = this.dramaCore;
    this.dramaCore = core;
    this.dramaLightRequestedThisFrame = false;

    if (core) {
      // 死亡演出段（ai0==2）：每 3t 一簇爆炎（:36981-36998，落点须界内非实心）
      if (core.ai0 === 2 && core.ai1 % 3 === 0 && core.ai1 > 60 && core.ai1 < 580) {
        const ang = Math.random() * Math.PI * 2;
        const rad = 20 + Math.random() * 400;
        const ex = core.cx + Math.cos(ang) * rad, ey = core.cy + Math.sin(ang) * rad;
        const tx = Math.floor(ex / 16), ty = Math.floor(ey / 16);
        const ok = world ? (world.store.inBounds(tx, ty) && !world.store.isSolid(tx, ty)) : true;
        if (ok) this.addMoonlordExplosion(ex, ey);
      }
      // 白光请求：出生态 -1/-2（ai1<60 → ai1/30）与死亡态尾段（≥480 → (ai1-480)/120）
      if ((core.ai0 === -1 || core.ai0 === -2) && core.ai1 < 60) {
        this.requestDramaLight(core.ai1 / 30, core.cx, core.cy);   // :36796/:36820
      } else if (core.ai0 === 2 && core.ai1 >= 480) {
        this.requestDramaLight((core.ai1 - 480) / 120, core.cx, core.cy);  // :37055
      }
      // 终死（ai1≥600 → life=0 + HitEffect(0,1337) → ThrowPieces）：掷点跨线或实体消失兜底
      const diedNow = prev !== null && prev.ai1 < 600 && core.ai1 >= 600 && core.ai0 === 2;
      const vanished = prev !== null && prev.ai0 === 2 && prev.ai1 >= 590;
      if (diedNow || vanished) {
        this.throwMoonlordPieces(vanished && !diedNow ? prev.cx : core.cx,
          vanished && !diedNow ? prev.cy : core.cy, Math.floor(Math.random() * 100));
      }
    }
    // Update :158-196：碎片/爆炸推进 + 白光 0.02/帧 逼近（无光源请求 → 目标 0）
    for (const p of this.dramaPieces) p.update(world?.w ?? 0, world?.h ?? 0);
    this.dramaPieces = this.dramaPieces.filter((p) => !p.dead);
    for (const ex of this.dramaExplosions) ex.update();
    this.dramaExplosions = this.dramaExplosions.filter((ex) => !ex.dead);
    if (!this.dramaLightRequestedThisFrame) this.dramaRequestedLight = 0;   // :190-193
    const target = this.dramaRequestedLight;
    this.dramaWhitening += Math.max(-0.02, Math.min(0.02, target - this.dramaWhitening)) * dtFrames;
    this.dramaWhitening = Math.max(0, Math.min(1, this.dramaWhitening));
  }

  /** ThrowPieces（:231-242）：四件骨骼碎块自核心飞散（UnitY 旋 NextFloat()×π/2−π/4+π
   *  的 6/10/8/12 速；角速度 ±0.05）。种子 = Main.rand.Next(100)（NPC.cs:83496 调用点） */
  private throwMoonlordPieces(cx: number, cy: number, seed: number): void {
    if (this.dramaPieces.length > 0) return;   // 一次死亡一组
    // 位级同源序列（moonlordThrowSeq）：UnifiedRandom(DramaSeed) 的 NextFloat×8。
    // 速度 = UnitY.RotatedBy(angle) × spd——RotatedBy 内部 (float)Math.Cos/Sin（C# double
    // 三角后收缩 float），此处以 fround(cos(angle))×spd 镜像。
    const defs: Array<[DramaPieceKind, number, number, number, number, number]> = [
      // [件, originX, originY, 距核心偏移x, 偏移y, 速度]
      ['spine', 64, 150, 0, 50, 6],        // :235
      ['shoulder', 40, 120, 50, -120, 10], // :237
      ['torso', 192, 252, 0, 0, 8],        // :239
      ['head', 138, 185, 0, -200, 12],     // :241
    ];
    const seq = moonlordThrowSeq(seed);
    defs.forEach(([kind, ox, oy, dx, dy, spd], i) => {
      const { angle, rotV } = seq[i];
      const dirX = Math.fround(Math.cos(angle));
      const dirY = Math.fround(Math.sin(angle));
      this.dramaPieces.push(new DramaPiece(kind, cx + dx, cy + dy,
        Math.fround(dirX * spd), Math.fround(dirY * spd), ox, oy, rotV));
    });
  }

  /** AddExplosion（:244-247）：7 帧爆炎，帧速 Next(2,4) */
  addMoonlordExplosion(x: number, y: number): void {
    this.dramaExplosions.push(new DramaExplosion(x, y, 2 + Math.floor(Math.random() * 2)));
  }

  /** RequestLight（:249-260）：本帧光源 + 目标取 max（钳 1） */
  private requestDramaLight(light: number, x: number, y: number): void {
    const player = this.frameCtx?.player;
    // :181-188 光源须距 metrics.Center <2000 才生效
    if (player && Math.hypot(player.cx - x, player.cy - y) >= 2000) return;
    this.dramaLightRequestedThisFrame = true;
    const v = Math.max(0, Math.min(1, light));
    if (v > this.dramaRequestedLight) this.dramaRequestedLight = v;
  }

  /** DrawPieces/DrawExplosions（:198-220）：世界位 - screenPosition；原版画在 tile 层
   *  之前（Main.cs:62711-62712，WoF/背景碎块之后）——本仓在 pre-world 变换段调用 */
  private drawMoonlordDrama(ctx: CanvasRenderingContext2D, camX: number, camY: number,
    viewW: number, viewH: number, z: number): void {
    this.updateMoonlordDrama(1);
    if (!this.dramaPieces.length && !this.dramaExplosions.length) return;
    const screenX = camX - viewW / 2, screenY = camY - viewH / 2;
    const sx = (wx: number) => (wx - screenX) * z;
    const sy = (wy: number) => (wy - screenY) * z;
    // 屏中心 ±(视口+1000) 剔除（:200/:212）
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const p of this.dramaPieces) {
      const px = sx(p.x), py = sy(p.y);
      if (px < -1000 || px > viewW + 1000 || py < -1000 || py > viewH + 1000) continue;
      const tex = dramaTex(p.kind);
      if (!tex || !(tex.width > 0) || !tex.width) continue;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(px, py);
      ctx.rotate(p.rot);
      ctx.drawImage(tex, -p.ox, -p.oy);
      ctx.restore();
    }
    for (const ex of this.dramaExplosions) {
      const px = sx(ex.x), py = sy(ex.y);
      if (px < -1000 || px > viewW + 1000 || py < -1000 || py > viewH + 1000) continue;
      const tex = dramaTex('explosion');
      if (!tex || !(tex.width > 0) || !tex.width) continue;
      const fw = tex.width, fh = tex.height / 7;   // Frame(1,7)（:121）
      ctx.save();
      ctx.globalAlpha = 127 / 255;                                // GetLight :142-145 恒 (255,255,255,127)
      ctx.drawImage(tex, 0, Math.min(6, Math.floor(ex.counter / ex.speed)) * fh, fw, fh,
        px - fw / 2, py - fh / 2, fw, fh);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** DrawWhite（:222-229）：全屏白 × whitening。原版画在 ScreenDarkness.DrawFront 之后
   *  （Main.cs:61763，几乎最末）；本仓在世界变换段以恒等变换近似（登记：位置偏早） */
  private drawMoonlordWhitening(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    if (this.dramaWhitening <= 0.001) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(1, this.dramaWhitening);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }

  // ================= 晨昏耀斑（NextHorizonRenderer Sunflare 族 1:1） =================
  // 消费锚点勘误：Sunflare 与日耀塔**无关**——全部挂在晨昏地平线系统
  // （DrawSun :171-184 / DrawLensFlare :368-541 / DrawSurfaceLayer(3) :141-147）。

  /** 本帧太阳屏幕位（sky.draw 写入；镜头光斑轴用） */
  private sunScreen: { x: number; y: number } | null = null;
  private sunflareTex: Partial<Record<SunflareTex, HTMLImageElement>> = {};

  /** GetVisibilities（NextHorizonRenderer.cs:199-239 一比一）：
   *  atmo ×(1-cloudAlpha)² ×(1-蘑菇光影响[无→1])；日出窗 = time∈(0,2700)↑·(3600,10800)↓；
   *  日落窗 = 54000−10800..−3600 ↑ 与 −3600..54000 ↓²；夜/日食清零 */
  private sunVisibilities(dayTimeTicks: number, isDay: boolean, eclipse: boolean, atmo: number,
    cloudAlpha: number): { sunset: number; sunrise: number; celestial: number } {
    const celestial = this.celestialEffectPower(dayTimeTicks, isDay);   // :315-325
    let vis = atmo * (1 - cloudAlpha) * (1 - cloudAlpha);               // :205-209
    let sunrise = vis, sunset = vis;
    if (isDay) {
      // :215-223（Remap 单调钳位插值）
      sunrise *= remap(dayTimeTicks, 0, 2700, 0, 1) * remap(dayTimeTicks, 3600, 10800, 1, 0);
      sunset *= remap(dayTimeTicks, 54000 - 10800, 54000 - 3600, 0, 1)
        * remap(dayTimeTicks, 54000 - 3600, 54000, 1, 0) ** 2;
      if (eclipse) { sunrise = 0; sunset = 0; }                          // :224-228
    } else {
      sunrise = 0; sunset = 0;                                           // :230-234
    }
    void celestial;
    return { sunset, sunrise, celestial };
  }

  /** GetCelestialEffectPower（:315-325）：天体高度驱动的整体强度 */
  private celestialEffectPower(dayTimeTicks: number, isDay: boolean): number {
    if (isDay) {
      return remap(dayTimeTicks, 0, 3600, 0, 1) * remap(dayTimeTicks, 54000 - 1800, 54000, 1, 0);
    }
    return remap(dayTimeTicks, 0, 3600, 0, 1) * remap(dayTimeTicks, 32400 - 1800, 32400, 1, 0);
  }

  private sunflareTexLoad(key: SunflareTex): HTMLImageElement | null {
    let t = this.sunflareTex[key];
    if (!t) {
      t = loadTex(SUNFLARE_TEX_FILE[key]);
      this.sunflareTex[key] = t;
    }
    return t;
  }

  /** 【未接·原版死代码】DrawSun（:171-184）的 flare1/flare2 两张贴图在原版以
   *  Color(255,255,255,0)×vis 绘制（A 恒 0，Main.cs:62379 普通 AlphaBlend 批次）→
   *  1.4.5.6 实测不可见；可见的晨昏耀斑全部走 DrawLensFlare（shader 路径）。 */

  /** DrawSurfaceLayer(3)（:141-147）：colorgradient 晨昏渐变带（日出水平翻转） */
  private drawSunflareGradientBand(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    screenY: number, sunset: number, sunrise: number): void {
    if (sunset <= 0.01 && sunrise <= 0.01) return;
    const tex = this.sunflareTexLoad('colorgradient');
    if (!tex || !(tex.width > 0) || !tex.width) return;
    // GetGradientRect（:66-72）：val=(1-Lerp(40,worldSurface,screenY/16))×400，y=max(0,val)−400
    const surfaceTiles = this.fx.surfaceY / 16;
    const val = (1 - lerpValueClamped(40, surfaceTiles, screenY / 16)) * 400;
    const y = Math.max(0, val) - 400;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = true;
    if (sunrise > 0.01) {
      ctx.globalAlpha = Math.min(1, sunrise * 0.6);                  // ×num2=0.6（:145）
      ctx.save();
      ctx.translate(viewW, 0);
      ctx.scale(-1, 1);                                             // FlipHorizontally
      ctx.drawImage(tex, 0, y, viewW, viewH + 400);
      ctx.restore();
    }
    if (sunset > 0.01) {
      ctx.globalAlpha = Math.min(1, sunset * 0.6);                  // :146
      ctx.drawImage(tex, 0, y, viewW, viewH + 400);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** DrawLensFlare（:368-541）：太阳↔屏心轴上的镜头光斑串。
   *  原版为 Immediate 模式 shader（Main.cs:61760 末段后处理），强度经
   *  SunVisibilityPixel（HorizonHelper.UpdateSunVisibility 产出的 1×1 遮挡 alpha，
   *  miscShaderData.UseImage1 → shader 内乘光斑色）调制；本仓在世界变换段恒等变换
   *  绘制，遮挡调制以 sunVisibility 乘 intensity（登记：层级偏早）。 */
  private drawLensFlare(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    sunset: number, sunrise: number, celestial: number): void {
    const sun = this.sunScreen;
    if (!sun) return;
    // SunVisibilityEnabled 门（HorizonHelper.cs:42 = _targetUpToDate）：首帧采样未就绪
    // 时不画光斑（原版同）——进世界后第二帧起生效
    if (!this.sunVisSampled) return;
    // AdjustIntensity（:393-408）：intensity = temporal³ × celestial（无 sunScorch），
    //  再 × 遮挡可见度（原版在 shader 采样 SunVisibilityPixel alpha）
    const occ = this.sunVisibility;
    const num = (sunrise * celestial) ** 3 * celestial * occ;
    const num2 = (sunset * celestial) ** 3 * celestial * occ;
    if (num <= 0.01 && num2 <= 0.01) return;
    const cx = viewW / 2, cy = viewH / 2;
    const baseRot = Math.atan2(cy - sun.y, cx - sun.x) + sun.y * 0.001;   // :46-49
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    if (num2 > 0.01) this.drawLensFlareSet(ctx, sun.x, sun.y, cx, cy, baseRot, num2, 'sunset');
    if (num > 0.01) this.drawLensFlareSet(ctx, sun.x, sun.y, cx, cy, baseRot, num, 'sunrise');
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** DrawSunsetFlare / DrawSunriseFlare 元素表（:410-541 逐元素 1:1）。
   *  元素定位（LensFlareElement.Draw :28-52）：i ∈ [0,RepeatTimes)——
   *  scale = ScaleStart+ScaleOverIndex·i；alpha = Color×(1+IntensityOverIndex·i)×intensity；
   *  d = (DistanceStart+DistanceAlongIndex·i)%1；pos = Lerp(sun,center,d*2)；rot = 轴角+Rotation */
  private drawLensFlareSet(ctx: CanvasRenderingContext2D, sunX: number, sunY: number,
    cx: number, cy: number, baseRot: number, intensity: number, which: 'sunset' | 'sunrise'): void {
    type Row = [SunflareTex, number, number, number, number, number, [number, number, number], number, number, number];
    // [贴图, Repeat, ScaleStart, ScaleOver, DistStart, DistStep, RGB, 强度乘, IntensityOverIndex, Rotation]
    const sets: Row[] = which === 'sunset' ? [
      ['pointblurry', 3, 0.3, -0.04, 0.33, 0.05, [43, 32, 0], 0.47058824, -0.125, 0],    // :415-424
      ['pointsharp', 3, 0.3, 0.04, 0.03, 0.05, [43, 32, 0], 0.47058824, -0.125, 0],      // :425-434
      ['pointblurry', 1, 0.3, 0, 0.41, 0, [255, 0, 65], 0.11764706, 0, 0],               // :435-441
      ['bokeh', 1, 0.3, 0, 0.475, 0, [255, 255, 255], 8 / 51, 0, 0],                     // :442-448
      ['bokeh', 6, 0.24, -0.04, 0.225, 0.04, [255, 255, 255], 4 / 51, 0, 0],             // :449-457
      ['pointblurry', 1, 1, 0, 0.6, 0, [255, 157, 0], 8 / 51, 0, 0],                     // :458-464
      ['spectra', 1, 0.4, 0, 0.65, 0, [255, 255, 255], 2 / 51, 0, Math.PI],              // :465-472
    ] : [
      ['pointsharp', 3, 0.3, -0.04, 0.33, 0.05, [0, 32, 43], 0.47058824, -0.125, 0],     // :480-490
      ['pointsharp', 3, 0.3, 0.04, 0.03, 0.05, [0, 32, 43], 0.47058824, -0.125, 0],      // :491-500
      ['pointblurry', 1, 0.3, 0, 0.41, 0, [65, 0, 255], 0.11764706, 0, 0],               // :501-507
      ['bokeh', 1, 0.3, 0, 0.525, 0, [255, 255, 255], 8 / 51, 0, 0],                     // :508-515
      ['bokeh', 6, 0.24, -0.04, 0.225, 0.04, [255, 255, 255], 4 / 51, 0, 0],             // :516-524
      ['pointblurry', 1, 1, 0, 0.6, 0, [0, 157, 255], 8 / 51, 0, 0],                     // :525-531
      ['spectra', 1, 0.38, 0, 0.65, 0, [255, 255, 255], 2 / 51, 0, Math.PI],             // :532-539
    ];
    for (const [key, repeat, scaleStart, scaleOver, distStart, distStep, rgb, mul, ioi, rot] of sets) {
      const tex = this.sunflareTexLoad(key);
      if (!tex || !(tex.width > 0) || !tex.width) continue;
      const sprite = tintedFlareSprite(tex, rgb[0], rgb[1], rgb[2]);   // Color 乘子（lighter 下呈色相）
      if (!sprite) continue;
      for (let i = 0; i < repeat; i++) {
        const scale = scaleStart + scaleOver * i;                       // :40
        const a = mul * (1 + ioi * i) * intensity;                      // :41
        if (a <= 0.01) continue;
        let d = distStart + distStep * i;                               // :42-43
        d = ((d % 1) + 1) % 1;
        const px = sunX + (cx - sunX) * (d * 2);                        // :45
        const py = sunY + (cy - sunY) * (d * 2);
        ctx.save();
        ctx.globalAlpha = Math.min(1, a);
        ctx.translate(px, py);
        ctx.rotate(baseRot + rot);                                       // :46-50
        const w = tex.width * scale, h = tex.height * scale;
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
  }

  // =================（雨点落水涟漪已退役 2026-08-14） =================
  // 自创"水面扩散椭圆环"近似（随机列采样,与雨滴落点无关 = 涟漪位置漂移的根因）,
  // 且与 WeatherRenderer 的原版 splash 尘(Rain.cs:120-133)双画。原版无环状涟漪
  // 系统——Ripples.png 是水体扭曲 shader 掩码(WaterShaderData :108),canvas 2D
  // 无扭曲通道不做。雨落水视觉 = splash 尘一处(WeatherRenderer.update)。

  /** 世界变换段绘制（Renderer.render 2d' 区一行调用）：晨昏镜头光斑（恒等变换全屏）。
   *  月总死亡白闪已挪帧尾（见 drawMoonlordWhiteFlash） */
  drawWorldFx(ctx: CanvasRenderingContext2D, camX: number, camY: number,
    z: number, viewW: number, viewH: number): void {
    if (!this.frameCtx) return;
    if (this.sunScreen) {
      // SunVisibilityPixel 采样（HorizonHelper.UpdateSunVisibility Main.cs:61769 帧末语义：
      // 本帧采样值下一帧生效——故先画后采，drawLensFlare 读的是上一帧值）
      this.sampleSunVisibility(camX, camY, z, viewW, viewH);
      const dayTimeTicks = this.lastDayTimeTicks;
      const v = this.sunVisibilities(dayTimeTicks, dayTimeTicks > 0, this.lastEclipse,
        this.atmoValue(camY), this.weatherRef?.cloudAlpha ?? 0);
      this.drawLensFlare(ctx, viewW, viewH, v.sunset, v.sunrise, v.celestial);
    }
  }

  /** 月总死亡白闪帧尾出口（MoonlordDeathDrama.DrawWhite Main.cs:61763：ScreenDarkness
   *  .DrawFront 之后、ScreenObstruction.Draw 之前 = 几乎帧末）。2026-08-13 挪正：此前
   *  挂在 drawWorldFx（Renderer 2d' 世界变换段 = tile 上实体下），白闪被实体/光照合成
   *  压掉。Renderer 7c/7c-bis 之间调用（drawMoonLordShake 后、ScreenObstruction 前） */
  drawMoonlordWhiteFlash(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    this.drawMoonlordWhitening(ctx, viewW, viewH);
  }

  /** atmo（Game.updateWeather 同公式，Main.cs:62622） */
  private atmoValue(camY: number): number {
    return Math.max(0, Math.min(1,
      (camY / 16 - (65 + 10 * (this.fx.worldW / 4200) ** 2)) / Math.max(1, this.fx.surfaceY / 16 / 5)));
  }

  // ================= SunVisibilityPixel 遮挡采样（HorizonHelper.cs:42-80） =================

  /** 上一帧采样值（DrawLensFlare 消费；= 原版 _pixelTarget 1×1 alpha） */
  private sunVisibility = 1;
  /** 采样就绪标记（= 原版 _targetUpToDate / SunVisibilityEnabled；首帧 false → 不画光斑） */
  private sunVisSampled = false;

  /**
   * UpdateSunVisibility（HorizonHelper.cs:46-80）：以太阳屏位为中心、边长
   * 128×RenderZoom 的方域从上一帧渲染目标降采样到 1×1 alpha（blend = dest×(1−srcA)
   * 累乘 ⇒ 值 = 域内前景覆盖率的取反），供 LensFlare shader 调制光斑强度——
   * 太阳被地形/前景内容遮挡时镜头光斑随之衰减。
   * 载体差异：原版 screenTarget 的天空画在独立 skyTarget（采样域开空处 alpha≈0）；
   * 本仓主画布天空不透明、无独立前景 alpha 通道，无法直接读 alpha——以采样域内
   * **实心 tile 覆盖率**代位（语义等价：地形遮阳 → 衰减；NPC/水面/背景层不采，
   * 它们在原版 alpha 通道中占比亦小，且光斑只在晨昏地表可见时段活跃）。
   * 屏幕域 128px → 世界域 128/z px（RenderZoom 以主缩放代位）。
   */
  private sampleSunVisibility(camX: number, camY: number, z: number,
    viewW: number, viewH: number): void {
    const sun = this.sunScreen;
    const world = this.frameCtx?.world;
    if (!sun || !world) { this.sunVisSampled = false; return; }
    const half = 64 / z;
    const wx = camX + (sun.x - viewW / 2) / z;
    const wy = camY + (sun.y - viewH / 2) / z;
    const st = world.store;
    const x0 = Math.floor((wx - half) / 16), x1 = Math.floor((wx + half) / 16);
    const y0 = Math.floor((wy - half) / 16), y1 = Math.floor((wy + half) / 16);
    let solid = 0, total = 0;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        total++;                                    // 界外格按"未遮挡"计（原版采样透明区）
        if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) solid++;
      }
    }
    this.sunVisibility = total > 0 ? Math.max(0, Math.min(1, 1 - solid / total)) : 1;
    this.sunVisSampled = true;
  }

  /** 最近一帧白天 tick / 日食（sky.draw 写入；镜头光斑复用可见性） */
  private lastDayTimeTicks = 0;
  private lastEclipse = false;

  skyColors(t: number): [string, string] {
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      const [t0, a0, b0] = SKY_KEYS[i];
      const [t1, a1, b1] = SKY_KEYS[i + 1];
      if (t >= t0 && t <= t1) {
        const f = (t - t0) / (t1 - t0);
        return [lerpColor(a0, a1, f), lerpColor(b0, b1, f)];
      }
    }
    return [SKY_KEYS[0][1], SKY_KEYS[0][2]];
  }

  draw(ctx: CanvasRenderingContext2D, clock: Clock, viewW: number, viewH: number, camX: number, dtMs = 16.7, camY = 0) {
    // ---- 帧数据消化：稀有云世界旗标（Cloud.cs RollRareCloud 门）----
    {
      const wf = this.frameCtx?.world?.flags;
      if (wf) {
        this.rareCloudFlags = {
          // 击杀链通用键 downed_<vanillaId>（4 克眼 / 13 世吞 / 266 克脑 / 35 骷髅王）+ 具名键兜底
          downedBoss1: !!(wf['downed_4'] || wf['downedEyeOfCthulhu']),
          downedBoss2: !!(wf['downed_13'] || wf['downed_266']),
          downedBoss3: !!(wf['downed_35'] || wf['downedSkeletron']),
          hardMode: !!wf['hardMode'],
          crimson: !!this.frameCtx?.world?.crimson,
          // 饥荒/十周年世界（SeedEasterEggs.parseSeed 文本种子：the constant 系 /
          //  celebrationmk10 及哈希值 5162021/5162011，WorldGenerationOptions.cs:66-90
          //  + WorldSeedOption_DontStarve/Anniversary.cs）——旗标经 world.seedFlags 落地
          dontStarveWorld: !!this.frameCtx?.world?.seedFlags?.theConstant,
          tenthAnniversaryWorld: !!this.frameCtx?.world?.seedFlags?.tenthAnniversary,
        };
      }
    }
    const t = clock.timeOfDay;
    const isDay = t > ClockVal.DAWN && t < ClockVal.DUSK;
    const dayTimeTicks = isDay ? ((t - 0.25) / 0.5) * 54000 : 0;
    // 镜头光斑可见性复用（drawWorldFx）
    this.lastDayTimeTicks = isDay ? dayTimeTicks : 0;
    this.lastEclipse = !!clock.eclipse;
    // ---- 天幕流星推进(绘制在天空底色之后,见 drawSkyMeteor;原版 SkyManager 天空层序) ----
    if (this.meteor) {
      const m = this.meteor;
      m.t++;
      m.x += m.vx; m.y += m.vy;
      if (m.t >= m.life) this.meteor = null;
      void dtMs;
    }
    const [top, bottom] = this.skyColors(t);
    // 天空实体 GetColor 的 bgColor（Main.ColorOfTheSkies）近似源——本帧色缓存
    this.lastSkyTop = top;
    this.lastSkyBottom = bottom;
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);
    // 日食压暗（Main.cs:63282-63305）：eclipseLight = min(1, 白天 time/1242)，
    // bgColor 三通道 ×(1-0.925L)/(1-0.96L)/(1-1.0L)——血红暮色，蓝通道清零
    if (clock.eclipse && t > ClockVal.DAWN && t < ClockVal.DUSK) {
      const dayTime = ((t - 0.25) / 0.5) * 54000;
      const L = Math.min(1, dayTime / 1242);
      if (L > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${Math.round(255 * (1 - 0.925 * L))},${Math.round(255 * (1 - 0.96 * L))},${Math.round(255 * (1 - L))})`;
        ctx.fillRect(0, 0, viewW, viewH);
        ctx.restore();
      }
    }
    // 闪电白（原版 Main.cs:63346：bgColor 向白 lerp lightning——纯闪白不画贴图）
    if (this.weatherRef && this.weatherRef.lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.weatherRef.lightning * 0.85)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // 墓地天空压暗（Main.cs:62990-62996 SetBackColor GraveyardInfluence）：bgColor
    // 三通道 ×(1 − 0.6×intensity)——晴空/夜空整体转灰暗；强度为 Game 平滑后的
    // GraveyardVisualIntensity（weather.graveyardVisual），>0 即生效（remix 分支不适用）
    const gyIntensity = this.weatherRef?.graveyardVisual ?? 0;
    if (gyIntensity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const dv = Math.round(255 * (1 - 0.6 * Math.min(1, gyIntensity)));
      ctx.fillStyle = `rgb(${dv},${dv},${dv})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }

    // ---- 晨昏耀斑渐变带（NextHorizonRenderer.DrawSurfaceLayer(3) :141-147；
    //      DrawHorizon 在 DrawBG 头段 = 星星/日月之前）----
    {
      const v = this.sunVisibilities(dayTimeTicks, isDay, clock.eclipse, this.atmoValue(camY),
        this.weatherRef?.cloudAlpha ?? 0);
      this.drawSunflareGradientBand(ctx, viewW, viewH, camY - viewH / 2, v.sunset, v.sunrise);
    }

    // ---- 月总天空渐暗（MoonLordSky.cs:63-70 + SceneState.cs:109 + SceneMetrics.cs:286-302）：
    //      398 在场即激活（ClosestNPCPosition[398] != Zero），强度 = 1 − SmoothStep(3000,6000,距核)。
    //      距核取上一帧戏剧扫描缓存（drawAmbience 段更新，1 帧滞后无感） ----
    {
      const ml = this.dramaCore;
      const pl = this.frameCtx?.player;
      if (ml && pl) {
        const inten = moonLordSkyIntensity(Math.hypot(pl.cx - ml.cx, pl.cy - ml.cy));
        if (inten > 0.001) {
          ctx.save();
          ctx.fillStyle = `rgba(0,0,0,${inten.toFixed(4)})`;
          ctx.fillRect(0, 0, viewW, viewH);
          ctx.restore();
        }
      }
    }

    // ---- 天幕流星绘制（AmbientSky 天空实体层：画在天空底色之后=原版 SkyManager 层序；
    //      曾画在 fillRect 之前被底色整个盖掉不可见）----
    if (this.meteor && this.meteorTex && this.meteorTex.width) {
      const m = this.meteor;
      // SkyEntity.CommonDraw GetDrawPositionByDepth :71-74：水平视差 1/Depth、垂直 0.9/Depth
      // （camX/camY = 相机中心；depthScale=3 → 缩放 3/Depth）
      const px = (m.x - camX) / m.depth + camX - (camX - viewW / 2);
      const py = (m.y - camY) * 0.9 / m.depth + camY - (camY - viewH / 2);
      const sc = 3 / m.depth;
      // FadingSkyEntity 淡入淡出（前/后 5% = 60 tick）+ BrightnessLerper=0.5
      // （GetColor :165-168 = Lerp(天空色,白,0.5)——深夜天空近黑 ≈ 半亮，此处以 alpha×0.5 近似）
      const k = m.t / m.life;
      const alpha = (k < 0.05 ? k / 0.05 : k > 0.95 ? Math.max(0, (1 - k) / 0.05) : 1) * 0.5;
      const frame = Math.floor(m.t / 5) % 4;   // FramingSpeed 5（:1339）
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(px, py);
      ctx.rotate(m.rot);
      if (m.flip) ctx.scale(-1, 1);             // :1321 FlipHorizontally 50%
      ctx.imageSmoothingEnabled = false;
      const dw = SkyRenderer.METEOR_FW * sc, dh = SkyRenderer.METEOR_FH * sc;
      ctx.drawImage(this.meteorTex, 0, frame * SkyRenderer.METEOR_FH,
        SkyRenderer.METEOR_FW, SkyRenderer.METEOR_FH, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    }

    const isNight = t < 0.27 || t > 0.78;
    // 星星
    if (isNight) {
      const fade = Math.min(1, Math.max(0, (t < 0.5 ? (0.27 - t) / 0.05 : (t - 0.78) / 0.05)));
      // 墓地星光衰减（Main.cs:62469-62478 DrawStarsInBackground）：亮度 ×(1 − 1.4×intensity)，
      // ≤0 直接跳过星群（intensity ≥ ~0.71 起星空完全被雾吞掉；太阳/月亮照画）
      const starDim = Math.max(0, 1 - gyIntensity * 1.4);
      ctx.globalAlpha = 0.9 * fade * starDim;
      ctx.fillStyle = '#E8ECFF';
      for (const s of this.stars) {
        const sx = ((s.x * viewW * 2 - camX * 0.1) % (viewW * 2) + viewW * 2) % (viewW * 2);
        if (sx > viewW) continue;
        ctx.fillRect(sx, s.y * viewH, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }

    // ---- 月塔天空装饰层（Nebula/Solar/Stardust/Vortex Sky：远景段黑幕盖星，
    //      日月/云画其上；云量 ×GetCloudAlpha()=0.7 起）----
    this.drawTowerSky(ctx, viewW, viewH, camX, camY, dtMs);

    // ---- 原版太阳/月亮(Main.cs:62279 DrawSunAndMoon 一比一)----
    // 昼夜时间(我们 0.25/0.75 边界 → 原版 day 0-54000 / night 0-32400)
    const nightTime = !isDay ? ((((t - 0.75) + 1) % 1) / 0.5) * 32400 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (isDay) {
      const tex = this.sunTex;
      if ((tex.width > 0) && tex.width > 0) {
        // 原版:x = time/54000*(屏宽+图宽*2)-图宽(横穿);y = bgTopY + |t*2-1|²*250+180(正午最高);
        // scale = (1.2-|t*2-1|²*0.4)*1.1;rotation = t*2-7.3(t=time/54000)
        const ft = dayTimeTicks / 54000;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const x = ft * (viewW + tex.width * 2) - tex.width;
        const y = dip * 250 + 180;
        const scale = (1.2 - dip * 0.4) * 1.1;
        this.sunScreen = { x, y };    // 镜头光斑轴锚（NextHorizonRenderer.GetCelestialBodyPosition）
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ft * 2 - 7.3);
        ctx.drawImage(tex, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
        ctx.restore();
      }
    } else {
      this.sunScreen = null;
      const tex = this.fx.moonEventKind === 2 ? this.ensureEventMoonTex(2)
        : this.fx.moonEventKind === 1 ? this.ensureEventMoonTex(1)
          : this.moonTexs[Math.max(0, Math.min(8, this.moonType))];
      if (tex && (tex.width > 0) && tex.width > 0) {
        const mw = tex.width; // 相位帧宽(50)
        const ft = nightTime / 32400;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const x = ft * (viewW + mw * 2) - mw;
        const y = dip * 250 + 180;
        const scale = 1.2 - dip * 0.4;
        const phase = Math.max(0, Math.min(7, clock.moonPhase)); // MoonPhase.cs:3-13(0=满…4=空;旧 dayCount%8 致首夜亏凸月+导入脱钩)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ft * 2 - 7.3);
        // 原版:竖条第 moonPhase 帧(0,MW*moonPhase,MW,MW),原点为中心
        ctx.drawImage(tex, 0, mw * phase, mw, mw,
          -mw / 2 * scale, -mw / 2 * scale, mw * scale, mw * scale);
        ctx.restore();
      }
    }
    ctx.restore();

    // 云：原版素材与规则（Cloud.cs / NextHorizonRenderer.DrawCloud）；
    // 塔天空激活时云量乘 GetCloudAlpha() = (1-fade)*0.3+0.7（各 Sky 同式 :116-119）
    this.towerCloudMul = this.towerCloudAlphaMul();
    this.drawVanillaClouds(ctx, viewW, viewH, isNight, dtMs, camX, camY);

    // 派对气球（PartySky：BirthdayParty.PartyIsUp 时 SkyManager 激活）
    this.drawPartyBalloons(ctx, viewW, viewH, camX, dtMs);
    // 灯笼夜夜空（LanternSky：灯笼浮升层，需相机 Y 判地表门）
    this.drawLanterns(ctx, viewW, viewH, camX, camY, dtMs);

  }

}
