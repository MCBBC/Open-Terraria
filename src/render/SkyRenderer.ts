// 天空渲染：昼夜渐变、太阳/月亮、星星、云
// 注意:Clock 必须值导入——DAWN/DUSK 是运行时常量,import type 会被擦除
// (:528/:561 运行时取值 → "Clock is not defined" 每帧崩渲染循环)
import { Clock } from '../world/World';
import { Clock as ClockVal } from '../world/World';
import { shade, mix } from '../assets/Palette';
import { LanternNight } from '../world/LanternNight';

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
  pixieposse:    { rows: 25, framingSpeed: 5, fadeIn: 0.15, fadeOut: 0.85, brightness: 0.6, life: [60, 121], depthMin: 2, depthSpan: 3, yOff: 4000, ySub: 4000, speedA: 0.12, speedB: 0.08, depthScaleAdj: -0.1 }, // PixiePosse :389-442
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
    const tw = (this.cloudTex(c.type)?.naturalWidth ?? 200) * c.scale;
    if (c.x > viewW + 400 || c.x + tw < -400) c.alpha = 1;
    // AABB 重叠拒绝（:169-180）
    const tex = this.cloudTex(c.type);
    const w = (tex?.naturalWidth ?? 200) * c.scale, h = (tex?.naturalHeight ?? 80) * c.scale;
    for (const o of this.vclouds) {
      const ot = this.cloudTex(o.type);
      const ow = (ot?.naturalWidth ?? 200) * o.scale, oh = (ot?.naturalHeight ?? 80) * o.scale;
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
  private updateClouds(dtMs: number, viewW: number) {
    const frames = dtMs / (1000 / 60);
    this.updateWind(frames);
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
      const w = (tex?.naturalWidth ?? 200) * c.scale;
      return c.alpha > 0 && c.x + w > -off && c.x < viewW + off;
    });
  }

  /** 维持云量（原版每帧尝试 SpawnCloud；初始铺满，之后顺风补充）。
   *  天气联动：attachWeather 后目标云数由 numClouds 驱动（0-200 → 2-14 朵）。
   *  下雨加密在 Weather.updateCloudCounts（Main.cs:58381-58392：cloudAlpha>0 时
   *  numClouds 强制爬升到 200×cloudAlpha）——此处只读 numClouds 即自动随雨加密 */
  private targetCloudCount(viewW: number): number {
    const base = Math.max(8, Math.round(viewW / 90));
    if (!this.weatherRef) return base;
    const density = Math.max(0, Math.min(1, this.weatherRef.numClouds / 200));
    return Math.max(1, Math.round(base * (0.15 + 0.95 * density)));
  }
  private maintainClouds(viewW: number, viewH: number) {
    const target = this.targetCloudCount(viewW);
    let guard = 0;
    while (this.vclouds.length < target && guard++ < 30) {
      const c = this.spawnCloud(viewW, viewH, this.vclouds.length < target * 0.6);
      if (c) this.vclouds.push(c);
    }
    // 超出目标：标记回收（淡出后移除）
    if (this.vclouds.length > target + 2) {
      const excess = this.vclouds.length - target;
      let killed = 0;
      for (const c of this.vclouds) {
        if (killed >= excess) break;
        if (!c.kill) { c.kill = true; killed++; }
      }
    }
  }

  /** 天气联动（Game.afterWorldLoad 注入）：风场以 weather 为权威（弃用内部迷你模型），
   *  云染色在下雨时向灰过渡（原版 cloudAlpha 下云变暗），闪电读 weather.lightning */
  weatherRef: import('../world/weather/Weather').WeatherState | null = null;
  attachWeather(w: import('../world/weather/Weather').WeatherState) {
    this.weatherRef = w;
  }

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
    if (drawing === 0 || !tex || !tex.complete || tex.naturalWidth === 0) return;
    const fw = tex.naturalWidth / 3, fh = tex.naturalHeight;
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
      if (!tex || !tex.complete || tex.naturalWidth === 0) continue;
      // 视差（:320-322：(pos - 屏中心) × (1/depth, 0.9/depth) + 屏中心）+ X 4000 包裹（:325-330）
      const par = 1 / b.depth;
      const sx = (((b.x - camX) * par + camX + 500) % 4000 + 4000) % 4000 - 500;
      const sy = (b.y - viewH / 2) * (0.9 * par) + viewH / 2;
      const fw = tex.naturalWidth / 3, fh = tex.naturalHeight / 3;
      const scale = par * 2 * 0.9;  // :337 vector2.X * 2 × 天色亮度 0.9 近似
      ctx.globalAlpha = 0.8;
      ctx.drawImage(tex, fw * b.variant, 0, fw, fh, sx, sy, fw * scale, fh * scale);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** 原版三层绘制（DrawClouds_Distant/Closer/Closest + NextHorizonRenderer.DrawCloud）：
   *  按视口宽缩放（cloud.position.Y*(H/600) 语义近似为 y 带），远景(scale<1)压暗 R/G 通道。 */
  private drawVanillaClouds(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, isNight: boolean, dtMs: number) {
    this.updateClouds(dtMs, viewW);
    this.maintainClouds(viewW, viewH);
    // 近→远排序绘制（近的在上）
    const sorted = [...this.vclouds].sort((a, b) => b.scale - a.scale);
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 原版云为软边贴图，平滑缩放
    for (const c of sorted) {
      const tex = this.cloudTex(c.type);
      if (!tex || !tex.complete || tex.naturalWidth === 0) continue;
      const w = tex.naturalWidth * c.scale, h = tex.naturalHeight * c.scale;
      const dim = c.scale < 1 ? c.scale * 0.8 : 1; // 原版远景压暗（OriginalColorsForCloud pass1）
      const nightDim = isNight ? 0.25 : 1;
      let r = Math.round(255 * dim * nightDim);
      let g = Math.round(255 * (c.scale < 1 ? ((c.scale + 1) / 2) * 0.9 : 1) * nightDim);
      let b = Math.round(255 * nightDim);
      // 天气联动：云染灰基准 = ProcessCloudAlpha（Main.cs:59154：max(cloudAlpha, 墓园强度×0.92)）×atmo
      const wr = this.weatherRef;
      if (wr) {
        const basis = Math.max(wr.cloudAlpha, (wr.graveyardVisual ?? 0) * 0.92);
        if (basis > 0) {
          const rainK = basis * 0.55;
          r = Math.round(r * (1 - rainK) + 158 * rainK);
          g = Math.round(g * (1 - rainK) + 162 * rainK);
          b = Math.round(b * (1 - rainK) + 168 * rainK);
        }
      }
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.translate(c.x + w / 2, c.y + h / 2);
      ctx.rotate(c.rot);
      if (c.flip) ctx.scale(-1, 1);
      // tint：先画原图再叠色保留形状（云端白色为主，直接 source-atop 着色近似原版 cloudColor）
      const tinted = this.cloudTint(tex, r, g, b);
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
    c.width = tex.naturalWidth; c.height = tex.naturalHeight;
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
  /** 绘制帧缓存（spawn 用相机/视口） */
  private ambViewW = 1920;
  private ambViewH = 1080;
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
    // VirtualCamera（VirtualCamera.cs:9-13）= 玩家中心 ± Size/2；原版 Size=Main.maxScreen
    // 4096（Main.cs:3754）——本仓以实际视口近似（登记：远端生成距离略近）
    const px = this.amb.playerX, halfW = this.ambViewW / 2, halfH = this.ambViewH / 2;
    const edgeX = dir > 0 ? px - halfW - 100 : px + halfW + 100;   // :452-459
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
        // BeginZigZag :1260-1276：方向掷（1 = 左侧入屏右飞）；y=相机顶、x 对侧屏外
        const d: 1 | -1 = Math.floor(r() * 2) === 1 ? 1 : -1;
        e = mk(d === 1 ? camX - halfW - 100 : camX + halfW + 100, camY - halfH, depth, life, t.key, t.rows, t.variant);
        e.state = 1; e.dir = d; e.waviness = 1 + r();               // :1265
      } else {
        // BeginChasingPlayer :1278-1283：相机矩形内均匀随机点
        e = mk(camX - halfW + r() * halfW * 2, camY - halfH + r() * halfH * 2, depth, life, t.key, t.rows, t.variant);
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
   * 选族走 pickAmbientFamily；Main.rand.Next(5)<3（60%）放宽次级条件。
   */
  drawAmbience(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    camX: number, camY: number, dtMs = 16.7): void {
    if (this.fx.surfaceY <= 0) return;   // 未进世界（fx 未注入）
    this.ambViewW = viewW;
    const ticks = Math.max(1, Math.round(dtMs / (1000 / 60)));
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    for (let f = 0; f < ticks; f++) {
      this.ambFrame++;
      if (this.ambNextAttempt > 0) {
        this.ambNextAttempt -= 1;                                   // :100-104
      } else {
        this.ambNextAttempt = 600 + Math.floor(Math.random() * 6600);  // :133 Next(600,7200)
        const a = this.amb;
        const fam = pickAmbientFamily({
          dayTime: a.dayTime, raining: a.raining, eclipse: a.eclipse, bloodMoon: a.bloodMoon,
          pumpkinMoon: a.moonEventKind === 2, snowMoon: a.moonEventKind === 1,
          zoneHallow: a.zoneHallow,
          playerAtSkyHeight: a.playerY <= this.fx.surfaceY + 1600,   // :190-193
          roll5: Math.floor(Math.random() * 5),
          pick: Math.random(),
        });
        if (fam) this.spawnAmbientFamily(fam, camX, camY);
      }
      for (const e of this.ambEntities) {
        this.stepAmbientEntity(e, this.ambFrame, wind);
        this.ambientEnvGate(e, this.ambFrame);
      }
      this.ambEntities = this.ambEntities.filter((e) => !e.dead);
    }
    if (!this.ambEntities.length) return;
    if (!this.birdsTex) this.birdsTex = loadTex('Ambience_BirdsVShape.png');
    if (!this.gastropodTex) this.gastropodTex = loadTex('Ambience_Gastropod.png');
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
      const tex = e.kind === 'birds' ? this.birdsTex : this.gastropodTex;
      if (!tex || !tex.complete || tex.naturalWidth === 0) continue;
      // GetDrawPositionByDepth :85-88：(Position-相机中心)×(1/depth, 0.9/depth)+相机中心
      const wx = (e.x - camX) / e.depth + camX;
      const wy = (e.y - camY) * 0.9 / e.depth + camY;
      const sx = wx - camX + viewW / 2;
      const sy = wy - camY + viewH / 2;
      if (sx < -400 || sx > viewW + 400 || sy < -400 || sy > viewH + 400) continue;
      const fw = tex.naturalWidth, fh = tex.naturalHeight / e.rows;
      const scale = 2.9 / e.depth;   // CommonDraw :79 scale = depthScale/Depth，各族 Draw 传 3-0.1
      // GetColor：birds Lerp(bg,白,0.2)（:169-171 + BrightnessLerper 0.2）；
      // gastropod Lerp(bg,(102,0,63),0.75)（:658 + Colors.cs:39）
      let cr: number, cg: number, cb: number;
      if (e.kind === 'birds') {
        cr = sr + (255 - sr) * 0.2; cg = sg + (255 - sg) * 0.2; cb = sb + (255 - sb) * 0.2;
      } else {
        cr = sr + (102 - sr) * 0.75; cg = sg - sg * 0.75; cb = sb + (63 - sb) * 0.75;
      }
      const alpha = Math.min(1, e.opacity * atmo);
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sx, sy);
      ctx.rotate(e.rotation);
      if (e.dir < 0) ctx.scale(-1, 1);   // SpriteEffects.FlipHorizontally
      ctx.drawImage(tex, 0, e.frame * fh, fw, fh, -fw * scale / 2, -fh * scale / 2, fw * scale, fh * scale);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

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
    // ---- 天幕流星推进(绘制在天空底色之后,见 drawSkyMeteor;原版 SkyManager 天空层序) ----
    if (this.meteor) {
      const m = this.meteor;
      m.t++;
      m.x += m.vx; m.y += m.vy;
      if (m.t >= m.life) this.meteor = null;
      void dtMs;
    }
    const t = clock.timeOfDay;
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

    // ---- 原版太阳/月亮(Main.cs:62279 DrawSunAndMoon 一比一)----
    // 昼夜时间(我们 0.25/0.75 边界 → 原版 day 0-54000 / night 0-32400)
    const isDay = t > ClockVal.DAWN && t < ClockVal.DUSK;
    const dayTime = isDay ? ((t - 0.25) / 0.5) * 54000 : 0;
    const nightTime = !isDay ? ((((t - 0.75) + 1) % 1) / 0.5) * 32400 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (isDay) {
      const tex = this.sunTex;
      if (tex.complete && tex.naturalWidth > 0) {
        // 原版:x = time/54000*(屏宽+图宽*2)-图宽(横穿);y = bgTopY + |t*2-1|²*250+180(正午最高);
        // scale = (1.2-|t*2-1|²*0.4)*1.1;rotation = t*2-7.3(t=time/54000)
        const ft = dayTime / 54000;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const x = ft * (viewW + tex.width * 2) - tex.width;
        const y = dip * 250 + 180;
        const scale = (1.2 - dip * 0.4) * 1.1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ft * 2 - 7.3);
        ctx.drawImage(tex, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
        ctx.restore();
      }
    } else {
      const tex = this.fx.moonEventKind === 2 ? this.ensureEventMoonTex(2)
        : this.fx.moonEventKind === 1 ? this.ensureEventMoonTex(1)
          : this.moonTexs[Math.max(0, Math.min(8, this.moonType))];
      if (tex && tex.complete && tex.naturalWidth > 0) {
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

    // 云：原版素材与规则（Cloud.cs / NextHorizonRenderer.DrawCloud）
    this.drawVanillaClouds(ctx, viewW, viewH, isNight, dtMs);

    // 派对气球（PartySky：BirthdayParty.PartyIsUp 时 SkyManager 激活）
    this.drawPartyBalloons(ctx, viewW, viewH, camX, dtMs);
    // 灯笼夜夜空（LanternSky：灯笼浮升层，需相机 Y 判地表门）
    this.drawLanterns(ctx, viewW, viewH, camX, camY, dtMs);

  }

}
