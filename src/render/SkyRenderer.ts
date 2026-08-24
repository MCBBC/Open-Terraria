// 天空渲染：昼夜渐变、太阳/月亮、星星、云
// 注意:Clock 必须值导入——DAWN/DUSK 是运行时常量,import type 会被擦除
// (:528/:561 运行时取值 → "Clock is not defined" 每帧崩渲染循环)
import { upgradeToBitmap, loadBitmapOnly } from '../assets/SpriteAtlas';
import { Clock } from '../world/World';
import { Clock as ClockVal } from '../world/World';

/** 天空实体染色缓存（GetColor RGB × 贴图 multiply 预染；键含 1/16 量化色档） */
const AMB_TINT_CACHE = new Map<string, HTMLCanvasElement>();
/** GPU contextlost 后天空实体染色缓存内容归零且不会自动重画——失效清空
 *  (Renderer.onLost 统一扫) */
export function clearAmbientTintCache(): void {
  for (const c of AMB_TINT_CACHE.values()) { c.width = 0; c.height = 0; }
  AMB_TINT_CACHE.clear();
  for (const c of EVENT_TINT_CACHE.values()) { c.width = 0; c.height = 0; }
  for (const c of eventTintFree) { c.width = 0; c.height = 0; }
  EVENT_TINT_CACHE.clear();
  eventTintFree.length = 0;
}
/** 事件天幕（史莱姆剪影/UFO）乘色缓存:键 = 纹理 id + 1/16 量化 rgb。工作集 =
 *  4 史莱姆贴图 × 5 深度档 × 慢变 cots 桶(≈20-40)+ UFO 2 张——真 LRU 命中重插,
 *  cap 64 + 复用池 8(cloudTint 同款防画布出生风暴) */
const EVENT_TINT_CACHE = new Map<string, HTMLCanvasElement>();
const eventTintFree: HTMLCanvasElement[] = [];
function eventTintedSprite(
  tex: ImageBitmap | HTMLImageElement, r: number, g: number, b: number, family: string,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${family}:${texId(tex as object)}:${r >> 4},${g >> 4},${b >> 4}`;
  const hit = EVENT_TINT_CACHE.get(key);
  if (hit) {
    EVENT_TINT_CACHE.delete(key);
    EVENT_TINT_CACHE.set(key, hit);       // LRU 重插尾
    return hit;
  }
  let c = eventTintFree.pop();
  if (!c) c = document.createElement('canvas');
  if (c.width !== tex.width || c.height !== tex.height) { c.width = tex.width; c.height = tex.height; }
  const cx = c.getContext('2d')!;
  cx.globalCompositeOperation = 'copy';
  cx.drawImage(tex as CanvasImageSource, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = `rgb(${r},${g},${b})`;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(tex as CanvasImageSource, 0, 0);
  EVENT_TINT_CACHE.set(key, c);
  if (EVENT_TINT_CACHE.size > 64) {
    const first = EVENT_TINT_CACHE.keys().next().value;
    if (first !== undefined) {
      const evicted = EVENT_TINT_CACHE.get(first);
      EVENT_TINT_CACHE.delete(first);
      if (evicted && eventTintFree.length < 8) eventTintFree.push(evicted);
    }
  }
  return c;
}
import { shade, mix } from '../assets/Palette';
import { LanternNight } from '../world/LanternNight';
import { UnifiedRandom } from '../core/rng';
import type { GLSpriteLayer } from './GLSpriteLayer';
import { texId } from './texId';
import { horizonPhaseOf, sunColorOf, moonDrawColor } from '../lighting/Horizon';
import { applyBiomeToSun, applyBiomeToMoon } from '../lighting/SkyColor';
import { AuroraSky } from './AuroraSky';
import { SlimeSky, slimeSilhouetteTint, slimeProject } from './SlimeSky';
import { MartianSky, ufoTintColor, ufoProject } from './MartianSky';

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

/** 原版星结构(Star.cs 字段 1:1;position 为 1920×1200 天空空间) */
interface SkyStar {
  x: number; y: number;
  rot: number; scale: number; type: number;
  twinkle: number; twSpeed: number; rotSpeed: number;
  falling: boolean; hidden: boolean;
  fvx: number; fvy: number; fallTime: number;
  fadeIn: number;
}

/** 原版日月贴图(Main.cs:62279 DrawSunAndMoon):Sun.png 整图 114×114;
 *  Moon_N.png 50×400 竖条 = 8 个相位帧(moonType 0-8 选表,moonPhase 选帧) */
function loadTex(name: string): HTMLImageElement {
  const im = new Image();
  im.onload = () => upgradeToBitmap(im, (b) => { UPG.get(im)?.forEach((cb) => cb(b)); UPG.delete(im); });
  im.src = `sprites/vanilla/${name}`;
  return im;
}
/** loadTex 返回的 Image → bitmap 就绪回调登记(持有方替换自身引用) */
const UPG = new WeakMap<HTMLImageElement, Array<(b: ImageBitmap) => void>>();
function onBitmap(im: HTMLImageElement, cb: (b: ImageBitmap) => void): HTMLImageElement {
  const q = UPG.get(im) ?? []; q.push(cb); UPG.set(im, q); return im;
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

/** CloudID.Sets.RareClouds_Normal（CloudID.cs:11-15，1457 新表）——普通世界稀有云池
 *  （22-40 全部 + 41 Rare_Pixie）。 */
export const RARE_CLOUDS_NORMAL: readonly number[] = [
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
];

/** CloudID.Sets.RareClouds_Celebration（CloudID.cs:17-21，1457 新表）——十周年世界池
 *  （比 Normal 少 37-40 饥荒四角色）。 */
export const RARE_CLOUDS_CELEBRATION: readonly number[] = [
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 41,
];

/** RollRareCloud（1457 Cloud.cs:184-232 一比一，纯函数供测试）：掷点改走 CloudID.Sets
 *  稀有云池表（普通=22-41、十周年=22-36+41；1456 为 Next(22,41)/Next(22,37) 硬编码），
 *  旗标门未过的类型重掷。41 Rare_Pixie 为 1457 新类型，门=hardMode（:208-210）。
 *  稀有云贴图语义见 CloudID.cs:49-85（鸟/兔/世吞/克眼×2/金鱼/Redigit/心/南瓜王/
 *  骷髅/星/剑/树/飞龙/克脑/饥荒四角色/精灵）。 */
export function rollRareCloud(f: RareCloudFlags, rnd: () => number): number {
  let num = -1;
  let ok = false;
  let guard = 0;
  const pool = f.tenthAnniversaryWorld ? RARE_CLOUDS_CELEBRATION : RARE_CLOUDS_NORMAL;
  while (!ok && guard++ < 512) {
    num = pool[Math.floor(rnd() * pool.length)];                         // :189 rand.Next(pool.Count)
    switch (num) {
      case 31: ok = f.downedBoss3; break;                                  // :195-197
      case 36: ok = f.downedBoss2 && f.crimson; break;                     // :198-200
      case 25: case 26: ok = f.downedBoss1; break;                         // :201-204
      case 30: case 35: case 41: ok = f.hardMode; break;                   // :205-210（41 为 1457 新增）
      case 28: ok = Math.floor(rnd() * 10) === 0; break;                   // :211-216 1/10
      case 37: case 38: case 39: case 40:
        ok = f.dontStarveWorld || Math.floor(rnd() * 10) === 0; break;     // :217-225
      default: ok = true; break;
    }
  }
  return num;
}

// ================= AmbientSky 天空实体（AmbientSky.cs FadingSkyEntity 全族 17/19） =================
// 选族纯函数/类型已抽出共享模块（MP 氛围联机批：server/src/room.ts 的 AmbienceServer
// 复用同表——room 无法经本文件导入 SpriteAtlas 资产链）；此处 re-export 兼容既有消费方
export {
  type AmbientFamily, type AmbientSpawnInput, pickAmbientFamily,
  AMBIENT_FAMILY_SKY_TYPE, ambientFamilyOfSkyType,
} from './ambientFamilies';
import { type AmbientFamily, type AmbientSpawnInput, pickAmbientFamily, ambientFamilyOfSkyType } from './ambientFamilies';

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
  private texs = new Map<string, ImageBitmap | HTMLImageElement>();
  // NebulaSky._pillars（Activate :121-133：40 根光柱，X 均布世界宽±20000、Y -2000..-1800、Depth 7-15）
  private pillars: Array<{ x: number; y: number; depth: number }> = [];
  // SolarSky._meteors（Activate :124-147：150 颗，2/3 近层 Depth 1.8-4.8、1/3 远层 4.8-9.8）
  private meteors: Array<{ x: number; y: number; depth: number; frame: number; scale: number; startX: number }> = [];
  // StardustSky._stars（Activate :121-146：200×10 颗，Depth 1.5-9.5）
  private stars: Array<{ x: number; y: number; depth: number; tex: number; off: number; amp: number; freq: number }> = [];
  // VortexSky._bolts（Activate :131-140：500 槽；Update :59-83 每 1-4t 一道，寿命 30）
  private bolts: Array<{ x: number; y: number; depth: number; life: number; alive: boolean }> = [];
  private boltTimer = 0;

  private tex(fam: TowerFamily, key: string): ImageBitmap | HTMLImageElement | null {
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

const dramaTexCache = new Map<DramaPieceKind, ImageBitmap | HTMLImageElement>();
function dramaTex(kind: DramaPieceKind): ImageBitmap | HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let t = dramaTexCache.get(kind);
  if (!t) {
    const im = new Image();
    im.onload = () => upgradeToBitmap(im, (b) => dramaTexCache.set(kind, b));  // bitmap-only(trace⑨ 窗口期)
    im.src = `sprites/vanilla/${DRAMA_TEX_FILE[kind]}`;
    return null;
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

type SunflareTex = 'flare1' | 'flare2' | 'bokeh' | 'spectra' | 'pointblurry' | 'pointsharp' | 'colorgradient' | 'colorgradientdither';

const SUNFLARE_TEX_FILE: Record<SunflareTex, string> = {
  flare1: 'Misc_Sunflare_flare1.png',
  flare2: 'Misc_Sunflare_flare2.png',
  bokeh: 'Misc_Sunflare_Lens_Flare1.png',
  spectra: 'Misc_Sunflare_Lens_Flare2.png',
  pointblurry: 'Misc_Sunflare_Lens_PointBlurry.png',
  pointsharp: 'Misc_Sunflare_Lens_PointSharp.png',
  colorgradient: 'Misc_Sunflare_colorgradient.png',
  colorgradientdither: 'Misc_Sunflare_colorgradientdither.png',
};

/** 镜头元素乘色缓存（lighter 叠加前先 multiply 着色——LensFlareElement.Color :422 等） */
const flareTintCache = new Map<string, HTMLCanvasElement>();
function tintedFlareSprite(tex: ImageBitmap | HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${texId(tex)}|${r},${g},${b}`;
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
  // ★α 从亮度推导（2026-08-21 方片终案）：Sunflare 贴图 α 全 255（像素实测）——
  // 原版是加性后处理 shader（final=texel.rgb×color×occlusion，【不采样 α】，
  // 黑背景加性=不可见）；canvas drawImage+lighter 下黑背景不透明=巨大"方片"
  // （用户三份报告）。加性语义的 canvas 等价：α=max(rgb)（黑=透明，亮=不透明），
  // lighter 只加 RGB 与原版逐位等价。逐像素一次烘焙进缓存，运行时零开销。
  const img = cx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = d[i] > d[i + 1] ? (d[i] > d[i + 2] ? d[i] : d[i + 2]) : (d[i + 1] > d[i + 2] ? d[i + 1] : d[i + 2]);
    d[i + 3] = m;
  }
  cx.putImageData(img, 0, 0);
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
    /** 入侵类型（World.invasionType 结构透传；4 = 火星——MartianSky 激活门
     *  Main.cs:58757-58763 invasionType==4 轮询） */
    invasionType?: number;
    flags: Record<string, boolean>;
    /** Main.dayRate(星空 fadeIn/坠星推进用,缺省 1) */
    dayRate?: () => number;
    /** 彩蛋种子旗标（SeedEasterEggs.parseSeed；稀有云门 theConstant/tenthAnniversary,
     *  CloudsEnd 月色/背景云累积器门 drunkWorld） */
    seedFlags?: { theConstant?: boolean; tenthAnniversary?: boolean; drunkWorld?: boolean };
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
    /** SceneMetrics 派生位（结构透传）：ZoneRain = raining && SurfaceAtmospherics
     *  （SceneMetrics.cs:700）/ ZoneSnow（:682）——暴风雪色罩双门
     *  （SceneState.cs:102 flag = ZoneRain && ZoneSnow）与 AuroraSky 同源 */
    zoneRain?: boolean; zoneSnow?: boolean; zoneSandstorm?: boolean;
    /** 群系光照影响(Game 每 tick 平滑写入;日月绘制色 SetBackColor 群系块消费) */
    biomeLightInfluence?: {
      corrupt: number; crimson: number; jungle: number; mushroom: number; graveyard: number;
    };
  } | null;
  player: {
    cx: number; cy: number; vx?: number;
    /** 阳光炽灼蓄能（Player.cs:2228；0-300）——drawLensFlare AdjustIntensity 的
     *  sunScorchCounter 分支（NextHorizonRenderer.cs:398-406）消费 */
    sunScorchCounter?: number;
    /** player.head 语义头槽号（Player.cs:25336/:35315-35322 时装优先）——太阳分支
     *  head==12（物品 237 太阳镜）→ Sun2 骷髅头太阳（Main.cs:62365） */
    headArmorSlot?: number;
    /** AdvancedShadows 位置历史环（Player.cs:4123-4141；[len−1]=最新）——耀斑
     *  元素布点公式的玩家残影项（LensFlareElement.cs:34-37）消费 */
    advancedShadows?: ReadonlyArray<{ x: number; y: number }>;
  } | null;
  clock: { dayCount: number; timeOfDay: number; isDay: boolean } | null;
  camX: number; camY: number; z: number; viewW: number; viewH: number;
  /** Main.bgAlphaFrontLayer[4]（海洋群系前景层渐变，BiomeBackground.frontLayer()[4]
   *  注入）——Cloud.Update :401 海滩杀云门（==1 且 y>200 → 低云 5× 快速淡出） */
  oceanFrontAlpha?: number;
}

/** AdjustIntensity（NextHorizonRenderer.cs:393-408 一比一，纯函数供测试）：
 *  常态 intensity = (temporal×celestial)³；sunScorchCounter>0（吸血鬼种子阳光
 *  炽灼,Player.cs:2228）时**整体替换**为 lerp(0,300,counter) 的 1−(1−lerp)² 曲线
 *  （counter=300 → 1；150 → 0.75；1 → ≈0.0067），再 ×celestial ×5（正午耀斑
 *  放大 5 倍的"阳光灼眼"档）。counter 透传链：Player.updateSunScorchValues →
 *  Renderer.render frameCtx.player.sunScorchCounter → drawLensFlare。 */
export function adjustFlareIntensity(temporalIntensity: number, celestialVisibility: number,
  sunScorchCounter: number): number {
  let num = temporalIntensity;                          // :395
  num *= celestialVisibility;                           // :396
  num *= num * num;                                     // :397 → (t·c)³
  if (sunScorchCounter > 0) {                           // :399
    let lerpValue = lerpValueClamped(0, 300, sunScorchCounter);   // :401 GetLerpValue(clamped)
    lerpValue = 1 - lerpValue;                          // :402
    num = 1 - lerpValue * lerpValue;                    // :403
    num *= celestialVisibility;                         // :404
    num *= 5;                                           // :405
  }
  return num;
}

/** Main.cs:62415-62416：sunModY/moonModY = (short)(modY × 0.999)——double→short
 *  截断向零（C# 显式转换语义）+ int16 回卷；纯函数供测试。 */
export function decayCelestialModY(modY: number): number {
  const t = Math.trunc(modY * 0.999);
  return (t << 16) >> 16;       // 截断值取低 16 位按符号扩展（unchecked short 强转）
}

/** LensFlareElement.Draw :34-37 玩家残影项（纯函数供测试）：最近 0 帧 vs
 *  min(4, count−1) 帧前位置差 v（世界坐标），在"太阳→屏心"屏向单位轴上的投影 ×|v|。
 *  count≤1 → v=(0,0) → 恒 0（SafeNormalize(UnitX)·|v|=0）；本仓残影环
 *  Player.advancedShadows 尾插 ≤31 项（[len−1]=最新，对应原版 _advancedShadows
 *  环的 GetAdvancedShadow(0)，Player.cs:4123-4131），60/31 环深差不影响
 *  min(4,·) 取样。该系统 = 移动残影（Starboard 彩虹拖尾/鱼龙坐骑尾迹等
 *  PlayerDrawLayers :2711+ 消费），非 shadowDodge 躲闪。 */
export function flareShadowTerm(shadows: ReadonlyArray<{ x: number; y: number }> | undefined,
  sunX: number, sunY: number, cx: number, cy: number): number {
  const arr = shadows;
  const n = arr?.length ?? 0;
  if (!arr || n <= 1) return 0;
  const newest = arr[n - 1];
  const older = arr[n - 1 - Math.min(4, n - 1)];        // :36 GetAdvancedShadow(Math.Min(4, count−1))
  let vx = newest.x - older.x, vy = newest.y - older.y;
  const vLen = Math.hypot(vx, vy);
  if (vLen === 0) { vx = 1; vy = 0; }                   // :37 v.SafeNormalize(Vector2.UnitX)
  else { vx /= vLen; vy /= vLen; }
  let dx = sunX - cx, dy = sunY - cy;
  const dLen = Math.hypot(dx, dy);
  if (dLen === 0) { dx = 0; dy = -1; }                  // (sun−center).SafeNormalize(−UnitY)
  else { dx /= dLen; dy /= dLen; }
  return (vx * dx + vy * dy) * vLen;                    // :37 Dot(...) × v.Length()
}

// ================= HorizonClouds（PixelShader.cso obj62 逐指令;SM2 解释器核验） =================
// 1.4.5.6 云晨昏染色的【唯一活路径】= CloudsEnd(NextHorizonRenderer.cs:328-361)把三通道
// 全部云 DrawData 经 MiscShaderData["HorizonClouds"](DyeInitializer.cs:440)逐像素着色。
// C# 侧 BetterColorsForClouds(:270-312 的"按高度沿 SunGradients 渐变")是【私有死代码】
// (全工程零调用)——"云按高度沿梯度染色"在 1.4.5.6 不存在,真值以字节码为准。
//
// 公式（指令号 = fxPixel.txt obj62 反汇编序;SM2 解释器执行同探针逐值核对,锚见
// tests/fx-pixelshader-parity.test.ts）:
//   采样: up(0,−0.035) dn(0,+0.14) lf(−0.035,0) rt(+0.035,0) 中(t0)      #10-18
//   coverage  = 1 − 0.2·Σα₅                                             #19-23
//   thickness = 1 − 4·sat(C.r − 0.62)                                    #24-26(★#25 _sat)
//   A = max(thickness, coverage)                                         #27
//   n1 = normalize(frag−云中心) n2 = normalize(天体−frag) d=|天体−frag|  #28-36
//   B = max(dot(n1,n2), 1−(d/60)²)                                       #37-40
//   R = |t0·2−1|                                                          #41-44
//   distTerm = d≤50 ? d/50−1 : 0   ← #51 的第三源 = c3.x=0(非 c3.z=1!)    #48+51
//   inner = sat(B·R−0.05)·A + 0.6·A + B·R − 0.3 + distTerm               #45-53
//           (★#45 _sat 钳 BR−0.05;#52 乘 A 非 B)
//   D = max(0.3, 1.3 − d/1800)                                            #49-50
//   shade = sat(inner·intensity)·D³                                       #54-57(★#57 _sat)
//   r2 = tex·vColor; r1 = lerp(vColor, (uColor,1), 0.5)·tex.a             #58-62
//   out = r2 + shade·(r1·vColor.a − r2)                                   #63-65
//   (★三处 sat = 2026-08-24 r15 _sat 判据修复后字节码实证;此前镜像按无钳旧
//    解释器校准,密核 texR>0.87/BR>1.05/inner·intensity>1 三域偏差)

/** HorizonHelper.cs:28-36 MoonColors（moonType 0-8;夜 uColor = 表×GetMoonStrength） */
export const MOON_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [230, 235, 255], [250, 235, 160], [230, 255, 230], [160, 240, 255], [180, 255, 255],
  [230, 255, 230], [255, 180, 255], [255, 200, 180], [225, 180, 255],
];

/** HorizonClouds 逐像素 shade（纯函数;GLSL CLOUD_FRAG_SRC 的 JS 镜像,测试金标源）。
 *  texSumA = 五采样 α 和(0-5);texR = 中心采样 R 通道(0-1);
 *  fragX/Y = 画布像素位;drawX/Y = 云中心;celX/Y = 天体位;intensity = CloudsEnd num。 */
export function horizonCloudShade(
  texSumA: number, texR: number,
  fragX: number, fragY: number, drawX: number, drawY: number,
  celX: number, celY: number, uvX: number, uvY: number, intensity: number,
): number {
  const sat01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const coverage = 1 - 0.2 * texSumA;
  const thickness = 1 - 4 * sat01(texR - 0.62);              // #25 mul r0.y_sat
  const A = Math.max(thickness, coverage);
  let d1x = fragX - drawX, d1y = fragY - drawY;
  const l1 = Math.hypot(d1x, d1y);
  if (l1 > 0) { d1x /= l1; d1y /= l1; } else { d1x = 0; d1y = 0; }
  const d2x = celX - fragX, d2y = celY - fragY;
  const dist = Math.hypot(d2x, d2y);
  const n2x = dist > 0 ? d2x / dist : 0, n2y = dist > 0 ? d2y / dist : 0;
  const B = Math.max(d1x * n2x + d1y * n2y, 1 - (dist / 60) ** 2);
  const R = Math.hypot(uvX * 2 - 1, uvY * 2 - 1);
  const distTerm = dist <= 50 ? dist / 50 - 1 : 0;
  const inner = sat01(B * R - 0.05) * A + 0.6 * A + B * R - 0.3 + distTerm;  // #45 mad r0.x_sat
  const D = Math.max(0.3, 1.3 - dist / 1800);
  return sat01(inner * intensity) * D * D * D;               // #57 mul r0.x_sat
}

/** 2D 兜底单探针近似（GL 主路径逐像素精确;此处 Canvas2D 无逐像素通道）:
 *  探针 = 云中心沿天体向 0.3·max(w,h)(几何上 shade 峰值区=云朝阳侧边缘),
 *  uv=(0.65,0.65) → R≈0.42;A 取 0.4(texSumA=3 → coverage 0.4,texR=1 → 密核
 *  thickness 负;密核 0/疏缘 1 的面积折中)。B/D/dist/强度精确。
 *  【取舍登记】B·R 与 A 的逐纹素耦合不可分解——GL 主路径逐像素精确,兜底只
 *  保证整朵染色量级/方向;shade 含正负,负值使整朵轻微偏离天体色(原语义)。 */
export function horizonCloudShadeApprox(
  cel: { posX: number; posY: number; intensity: number },
  cx: number, cy: number, w: number, h: number, probeDist: number,
): number {
  void w; void h;
  let n1x = cel.posX - cx, n1y = cel.posY - cy;
  const nl = Math.hypot(n1x, n1y);
  if (nl > 0) { n1x /= nl; n1y /= nl; } else { n1x = 1; n1y = 0; }
  const fragX = cx + n1x * probeDist, fragY = cy + n1y * probeDist;
  return horizonCloudShade(
    3, 1,                              // texSumA=3 → coverage 0.4(A 折中);texR=1
    fragX, fragY, cx, cy, cel.posX, cel.posY,
    0.65, 0.65,                        // uv → R = |0.3,0.3| ≈ 0.424
    cel.intensity,
  );
}

/** Main.atmo（海拔大气系数，SkyRenderer.atmoValue 的纯函数化——BiomeBackground
 *  cloudBG 大云图层（Main.cs:58787-58871 num5=ProcessCloudAlpha()×atmo）共用） */
export function atmoOf(camY: number, worldW: number, surfaceY: number): number {
  return Math.max(0, Math.min(1,
    (camY / 16 - (65 + 10 * (worldW / 4200) ** 2)) / Math.max(1, surfaceY / 16 / 5)));
}

// ================= 沙尘暴/暴风雪全屏色罩（SandstormSky.cs / BlizzardSky.cs 1:1） =================
// 原版是 SkyManager 自定义天空层（ScreenEffectInitializer.cs:71-72 注册）：Draw
// (SandstormSky.cs:49-60 / BlizzardSky.cs:48-60) 以 MagicPixel 全屏 alpha 混合一张
// 色罩,强度驱动与 SceneState.cs:177-181 的滤镜链同源（Severity / cloudAlpha）。
// 本仓载体 = GLScreenFilters 的 SkyWeatherTint pass（滤镜链头——天空层在 FilterManager
// EndCapture 之下）+ 2D fillRect 兜底（source-over = XNA AlphaBlend 同式）。

/** Blizzard 激活门（SceneState.cs:102/120 一比一,纯函数供测试）：
 *  flag = metrics.ZoneRain && metrics.ZoneSnow;ManageSpecialBiomeVisuals("Blizzard",
 *  Main.UseStormEffects && flag)——UseStormEffects（Main.cs:407 默认 true,设置项
 *  「风暴效果」）本仓未接设置面,恒 true。 */
export function blizzardSkyGate(zoneRain: boolean, zoneSnow: boolean): boolean {
  return zoneRain && zoneSnow;
}

/** Sandstorm 激活门（Sandstorm.ShowSandstormVisuals Sandstorm.cs:132-139 的本仓
 *  等价门,与 Game.weatherHooks.sandstormVisuals 同源）：
 *  Happening && 沙漠带 && bgDelay<50（背景样式切换缓冲 <50 帧 → 玩家在地表带内
 *  近似 = 玩家 tileY < groundLevel+30）。 */
export function sandstormSkyGate(
  happening: boolean, zoneDesert: boolean, playerTileY: number, groundLevel: number,
): boolean {
  return happening && zoneDesert && playerTileY < groundLevel + 30;
}

/** SandstormSky.Draw :53-55 色罩参数（纯函数,0-1 浮点供测试与 GL/2D 双路径）：
 *  num = min(1, Severity×1.5);color = Vector4(0.85,0.66,0.33,1)×0.8×cots ×opacity×num
 *  ——★XNA 此处四通道【全乘】opacity×num（rgb 与 α 同时缩放）,AlphaBlend 再以
 *  src.rgb×src.a 合成 → 有效叠加量 ∝ (opacity×num)²,逐字照抄。 */
export function sandstormSkyTint(
  severity: number, opacity: number, cots: readonly [number, number, number],
): { color: [number, number, number]; alpha: number } {
  const k = Math.min(1, severity * 1.5) * opacity;
  const cr = cots[0] / 255, cg = cots[1] / 255, cb = cots[2] / 255;
  return { color: [0.85 * 0.8 * cr * k, 0.66 * 0.8 * cg * k, 0.33 * 0.8 * cb * k], alpha: 1 * 0.8 * k };
}

/** BlizzardSky.Draw :52-54 色罩参数（纯函数）：num = min(1, cloudAlpha×2);
 *  color = Vector4(1)×cots ×opacity×0.7×num（同样四通道全乘）。 */
export function blizzardSkyTint(
  cloudAlpha: number, opacity: number, cots: readonly [number, number, number],
): { color: [number, number, number]; alpha: number } {
  const k = Math.min(1, cloudAlpha * 2) * opacity;
  const cr = cots[0] / 255, cg = cots[1] / 255, cb = cots[2] / 255;
  return { color: [cr * 0.7 * k, cg * 0.7 * k, cb * 0.7 * k], alpha: 1 * 0.7 * k };
}

export class SkyRenderer {
  // ---- 原版星空(Star.cs + Main.DrawStarsInBackground :62467-62606,2026-08-20
  //      全量 1:1 替换方块近似)----
  private stars: SkyStar[] = [];
  private numStars = 0;
  private starTexs: Array<ImageBitmap | HTMLImageElement | null> = new Array(4).fill(null);
  /** Star.SpawnStars(:86-135):数量 200-400(FastRandom 随机种子=每次进图重掷),
   *  位置 X Next(1921)/Y Next(1201)、type Next(0,4)、1/40 概率 scale×2+速度减半 */
  private spawnStar(s: number): void {
    const R = () => Math.random();
    const next = (min: number, max?: number) => max === undefined
      ? Math.floor(R() * min) : min + Math.floor(R() * (max - min));
    const star: SkyStar = {
      x: next(1921), y: next(1201),
      rot: next(628) * 0.01,
      scale: next(70, 130) * 0.006,
      type: next(0, 4),
      twinkle: next(60, 101) * 0.01,
      twSpeed: next(30, 110) * 0.0001,
      rotSpeed: next(5, 50) * 0.0001,
      falling: false, hidden: false, fvx: 0, fvy: 0, fallTime: 0, fadeIn: 0,
    };
    if (next(2) === 0) star.twSpeed *= -1;
    if (next(2) === 0) star.rotSpeed *= -1;
    if (next(40) === 0) { star.scale *= 2; star.twSpeed /= 2; star.rotSpeed /= 2; }
    if (s >= 0) this.stars[s] = star; else this.stars.push(star);
  }
  /** SpawnStars(-1) 全量生成(单星重生走 spawnStar(i) 的 10 次探位版:
   *  取与既有星最小间距最大化的 X——SpawnStars :110-130) */
  private spawnStars(): void {
    this.stars = [];
    this.numStars = 200 + Math.floor(Math.random() * 200);   // Next(200,400)
    for (let i = 0; i < this.numStars; i++) this.spawnStar(-1);
  }
  /** Star.Update(:70-113):fadeIn 夜间渐显(6.1728395e-5·dayRate·10/tick)、
   *  twinkle 0.6-1.0 往返、rotation 环绕;falling 支三倍速+0.5/tick 自旋 */
  private updateStar(s: SkyStar, dayRate: number): void {
    if (s.falling && !s.hidden) {
      s.fallTime += dayRate;
      const k = (dayRate + 99) / 100;
      s.x += s.fvx * k; s.y += s.fvy * k;
      if (s.y > 1500) s.hidden = true;
      s.twinkle += s.twSpeed * 3;
      if (s.twinkle > 1) { s.twinkle = 1; s.twSpeed *= -1; }
      else if (s.twinkle < 0.6) { s.twinkle = 0.6; s.twSpeed *= -1; }
      s.rot += 0.5;
      if (s.rot > 6.28) s.rot -= 6.28;
      return;
    }
    if (s.fadeIn > 0) {
      s.fadeIn = Math.max(0, s.fadeIn - 6.1728395e-5 * dayRate * 10);
    }
    s.twinkle += s.twSpeed;
    if (s.twinkle > 1) { s.twinkle = 1; s.twSpeed *= -1; }
    else if (s.twinkle < 0.6) { s.twinkle = 0.6; s.twSpeed *= -1; }
    s.rot += s.rotSpeed;
    if (s.rot > 6.28) s.rot -= 6.28;
    if (s.rot < 0) s.rot += 6.28;
  }
  /** Star.UpdateStars(:137-163):昼 time≥27000 重生 hidden 星;逐星 Update */
  private updateStars(dayRate: number, isDay: boolean, dayTicks: number): void {
    if (!this.stars.length) this.spawnStars();
    if (isDay && dayTicks >= 27000) {
      for (let i = 0; i < this.numStars; i++) {
        if (this.stars[i].hidden) { this.spawnStar(i); this.stars[i].fadeIn = 1; }
      }
    }
    for (let i = 0; i < this.numStars; i++) this.updateStar(this.stars[i], dayRate);
  }
  /** Star.StarFall(:57-81):离 x 最近且未 falling/hidden 的星标 falling
   *  (AI_148 StarSpawner 出生时触发,Projectile.cs:50204——玩家在地表上方才调) */
  starFallAt(worldX: number, worldWidth: number): void {
    if (!this.stars.length) return;
    const num3 = worldX / worldWidth * 1920;
    let best = -1, bestD = -1;
    for (let i = 0; i < this.numStars; i++) {
      const s = this.stars[i];
      if (s.hidden || s.falling) continue;
      const d = Math.abs(s.x - num3);
      if (bestD === -1 || d < bestD) { best = i; bestD = d; }
    }
    if (best >= 0) {
      const s = this.stars[best];
      s.fallTime = 0;
      s.falling = true;
      s.fvy = (700 + Math.floor(Math.random() * 301)) * 0.01;
      s.fvx = (Math.floor(Math.random() * 801) - 400) * 0.01;
    }
  }
  private starTex(i: number): ImageBitmap | HTMLImageElement | null {
    let t = this.starTexs[i];
    if (t === null) {
      t = loadTex(`Star_${i}.png`);
      this.starTexs[i] = t;
    }
    return t.width > 0 ? t : null;
  }
  /** Main.DrawStar(:62481-62604)逐式:亮度=(255−bg.R−100)·twinkle·(1−fadeIn)
   *  三通道均值×1.4 钳 255;位置 (pos/1920,·/1200)×屏+(0,bgTopY),X/Y 环绕;
   *  坠星带 8 段尾迹(fallTime 钳 30,逐段 ×0.4 位移衰减)。shimmer 分支
   *  (:62521-62542)依赖 shimmerAlpha>0——本仓无微光天空态,恒 0=原版跳过=1:1 */
  private drawStar(
    ctx: CanvasRenderingContext2D, i: number, starOpacity: number,
    viewW: number, viewH: number, bgTopY: number,
  ): void {
    const s = this.stars[i];
    if (!s || s.hidden) return;
    const cots = this.cots;
    const bgR = cots ? cots[0] : 255, bgG = cots ? cots[1] : 255, bgB = cots ? cots[2] : 255;
    const num2 = 1 - s.fadeIn;
    const r0 = (255 - bgR - 100) * s.twinkle * num2;
    const g0 = (255 - bgG - 100) * s.twinkle * num2;
    const b0 = (255 - bgB - 100) * s.twinkle * num2;
    let lum = Math.floor((r0 + g0 + b0) / 3);
    if (lum <= 0) return;
    lum = Math.min(255, Math.floor(lum * 1.4));
    const alpha = Math.max(0, Math.min(1, (lum / 255) * starOpacity));
    // 位置映射(:62544-62549)
    let px = s.x / 1920 * viewW;
    let py = s.y / 1200 * viewH + bgTopY;
    if (!s.falling) {
      if (px < 0) px += viewW;
      if (px > viewW) px -= viewW;
      if (py < 0) py += viewH;
      if (py > viewH) py -= viewH;
    }
    const tex = this.starTex(s.type);
    if (!tex) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.rot);
    ctx.imageSmoothingEnabled = true;   // 星为软边贴图
    const size = tex.width * s.scale;
    if (s.falling) {
      // 尾迹(:62574-62595):fallTime 钳 30,逐段 fallSpeed·j·0.4 位移+scale/alpha
      // 衰减+rotation。★位移乘视口变换(×viewW/1920,×viewH/1200)——原版 1920×1200
      // 全屏 1:1 混用天/屏空间,窗口缩放下不乘则尾迹比头部运动拉长 1.5 倍显脱节
      const ft = Math.min(s.fallTime, 30);
      const sx = viewW / 1920, sy = viewH / 1200;
      for (let j = 1; j < ft; j++) {
        const tx = px - s.fvx * j * 0.4 * sx, ty = py - s.fvy * j * 0.4 * sy;
        const sc = s.scale * (1 - j / 30);
        const a = alpha * (1 - j / 30);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(tx, ty);
        ctx.rotate(s.rot);
        ctx.drawImage(tex, -tex.width * sc / 2, -tex.height * sc / 2, tex.width * sc, tex.height * sc);
        ctx.restore();
      }
    }
    ctx.globalAlpha = alpha;
    // 主星尺寸 ×twinkle(:62600 theStar.scale * theStar.twinkle——脉动语义)
    const tw = size * s.twinkle;
    ctx.drawImage(tex, -tw / 2, -tw / 2, tw, tex.height * s.scale * s.twinkle);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  private cloudTexs: Array<ImageBitmap | HTMLImageElement | null> = new Array(41).fill(null);
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
    this.spawnStars();
    // 云贴图五族(Cloud_0-21)首用懒加载:绘制/选型路径经 cloudTex(i) 触发,未就绪
    // 跳帧自愈(云淡入本身 >1s,无可见差异)。此前构造器全量装载 22 张——雨云/
    // 风暴云(18-21)无雨天气永不出现,白载;且 SkyRenderer 在菜单+进图各构造一次,
    // 急载翻倍
    this.sunTex = onBitmap(loadTex('Sun.png'), (b) => { this.sunTex = b; });
    for (let i = 0; i <= 8; i++) this.moonTexs[i] = onBitmap(loadTex(`Moon_${i}.png`), (b) => { this.moonTexs[i] = b; });
    // 事件月亮(Main.cs:62400-62408):南瓜月 kind=2 / 霜月 kind=1,50×400 相位竖条
    // ——只在对应月亮事件进行时才画,改首用懒加载(月亮绘制分支内 ensure)
    // 风场初值(Main.cs:10800):current = ±0.8 随机,计数 7200-28800 帧
    this.wind = (Math.floor(Math.random() * 1601) - 800) * 0.001;
    this.windCounter = 7200 + Math.floor(Math.random() * 21601);
  }

  /** 云贴图首用懒加载(in-flight 去重:占位即标记;未就绪时调用方以 complete 守卫跳帧) */
  private cloudTex(i: number): ImageBitmap | HTMLImageElement | null {
    const t = this.cloudTexs[i];
    if (!t) loadBitmapOnly(`vanilla/Cloud_${i}.png`, () => !!this.cloudTexs[i], (x) => { this.cloudTexs[i] = x; });
    return t;
  }

  sunTex: ImageBitmap | HTMLImageElement;
  /** 日食太阳(Main.cs:62345-62348 eclipse → TextureAssets.Sun3) */
  private sun3Tex: ImageBitmap | HTMLImageElement | null = null;
  private sun3TexImg(): ImageBitmap | HTMLImageElement | null {
    if (!this.sun3Tex) this.sun3Tex = onBitmap(loadTex('Sun3.png'), (b) => { this.sun3Tex = b; });
    return this.sun3Tex.width > 0 ? this.sun3Tex : null;
  }
  /** 太阳本体横向光晕(DrawSun :171-185;★A=0 系反编译伪影,贴图满内容) */
  private flareT1: HTMLImageElement | null = null;
  private flareT2: HTMLImageElement | null = null;
  private flareTexImg(kind: 1 | 2): HTMLImageElement | null {
    if (kind === 1) {
      if (!this.flareT1) this.flareT1 = loadTex('Misc_Sunflare_flare1.png');
      return this.flareT1.width > 0 ? this.flareT1 : null;
    }
    if (!this.flareT2) this.flareT2 = loadTex('Misc_Sunflare_flare2.png');
    return this.flareT2.width > 0 ? this.flareT2 : null;
  }
  /** 骷髅头太阳 Sun2(Main.cs:62365-62369:!gameMenu && player.head==12 →
   *  TextureAssets.Sun2;头槽 12=物品 237 太阳镜,经 frameCtx.player.headArmorSlot
   *  注入——菜单态 frameCtx=null 即 !gameMenu 门同式) */
  private sun2Tex: ImageBitmap | HTMLImageElement | null = null;
  private sun2TexImg(): ImageBitmap | HTMLImageElement | null {
    if (!this.sun2Tex) this.sun2Tex = onBitmap(loadTex('Sun2.png'), (b) => { this.sun2Tex = b; });
    return this.sun2Tex.width > 0 ? this.sun2Tex : null;
  }
  /** Extra[280] 墨镜叠层(Main.cs:62380-62385:Sun2 档于太阳上再画一张,
   *  color3 = (color.R,color.G,color.B,100)——非日食 color 恒白) */
  private extra280Tex: ImageBitmap | HTMLImageElement | null = null;
  private extra280TexImg(): ImageBitmap | HTMLImageElement | null {
    if (!this.extra280Tex) this.extra280Tex = onBitmap(loadTex('Extra_280.png'), (b) => { this.extra280Tex = b; });
    return this.extra280Tex.width > 0 ? this.extra280Tex : null;
  }
  // ---- 2026-08-20 原版地平线系统(NextHorizonRenderer)----
  /** 本帧晨昏可见性(draw() 开头算好,日/月/渐变/光斑消费) */
  private horizonVisCache: { sunrise: number; sunset: number; celestial: number } | null = null;
  /** BackgroundDrawers 带表注入(Renderer 每帧注入 biomeBg.surfaceGradientBands;
   *  SunGradients.BackgroundDrawers 13 项的取数闭包) */
  biomeBgBands: (() => Array<{ rgb: readonly [number, number, number]; alpha: number }>) | null = null;
  /** 上一帧晨昏可见性(渲染器读去写 setFrameHorizon——帧序上 render 先画天空
   *  后写状态,光照引擎下一帧消费) */
  get horizonVis(): { sunrise: number; sunset: number; celestial: number } | null {
    return this.horizonVisCache;
  }
  /** 本帧晨昏调色板相位(Main.HorizonPhase) */
  horizonPhase = 0;
  /** 通用染色缓存(multiply+destination-in 三步,键=用途+纹理id+8 量化色) */
  private tintCache2 = new Map<string, HTMLCanvasElement>();
  private tintTex(tex: ImageBitmap | HTMLImageElement, r: number, g: number, b: number, use: string): HTMLCanvasElement | HTMLImageElement {
    // /16 量化+64 上限:日/月小贴图,晨昏漂移期组合数有界,防 clear-all 雪崩
    // (biomeBg tintCache 教训)
    const key = `${use}:${texId(tex as object)}:${(r / 16) | 0},${(g / 16) | 0},${(b / 16) | 0}`;
    let c = this.tintCache2.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = tex.width; c.height = tex.height;
    const tc = c.getContext('2d')!;
    tc.drawImage(tex as CanvasImageSource, 0, 0);
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    tc.fillRect(0, 0, c.width, c.height);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(tex as CanvasImageSource, 0, 0);
    if (this.tintCache2.size > 64) this.tintCache2.clear();
    this.tintCache2.set(key, c);
    return c;
  }
  /** 晨昏渐变贴图(Sunrise/Sunset 四调色板) */
  private gradTexs = new Map<string, HTMLImageElement>();
  private horizonGradTex(kind: 'Sunrise' | 'Sunset', idx: number): HTMLImageElement | null {
    const key = `${kind}${idx}`;
    let t = this.gradTexs.get(key);
    if (t === undefined) {
      t = loadTex(`Misc_${kind}_${kind}_${['Blue', 'Violet', 'Yellow', 'Aluminum', 'Dark', 'Pink', 'Red'][idx]}.png`);
      this.gradTexs.set(key, t);
    }
    return t.width > 0 ? t : null;
  }
  /** 地平线渐变绘制(DrawHorizon :81-105):晨昏窗内把渐变贴图盖到天空上;
   *  gradientRect(:68-75)随相机入地收缩到屏外。 */
  private drawHorizonGradients(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camY: number,
    vis: { sunrise: number; sunset: number }, phase: number,
  ): void {
    if (this.fx.surfaceY <= 0) return;
    const num = 400;
    // Main.screenPosition.Y/16(屏顶世界 Y÷16——须除 zoom 得真实屏顶;旧漏 /zoom)
    const camTopTiles = (camY - viewH / 2 / (this.frameCtx?.z ?? 1)) / 16;
    // GetLerpValue(40, worldSurface, camTopTiles):0(地表)→1(高空)
    const lerpV = Math.max(0, Math.min(1, (camTopTiles - 40) / Math.max(1, this.fx.surfaceY / 16 - 40)));
    const val = (1 - lerpV) * num;
    const gy = Math.max(0, val) - num;
    // BackgroundDrawers(SunGradients.cs:175-189):群系背景树顶渐隐带,画在
    // 晨昏渐变【之前】(DrawHorizon :99-102 序)。带色×ColorOfSurfaceBackgrounds
    // (=cots)×weight;gradientRect(BackgroundGradientDrawer.GetGradientRect :70-74:
    // y = max(0,(worldSurface·16−screenPos.Y−2400)·0.1)−400)
    const bands = this.biomeBgBands?.() ?? [];
    if (bands.length && this.cots) {
      const dither = this.sunflareTexLoad('colorgradientdither');
      if (dither && dither.width > 0) {
        const screenTopD = camY - viewH / 2 / (this.frameCtx?.z ?? 1);
        const gy2 = Math.max(0, (this.fx.surfaceY * 16 - screenTopD - 2400) * 0.10000000149011612) - num;
        for (const b of bands) {
          if (b.alpha <= 0) continue;
          const im = this.tintTex(dither,
            b.rgb[0] * this.cots[0] / 255, b.rgb[1] * this.cots[1] / 255, b.rgb[2] * this.cots[2] / 255,
            `band${b.rgb[0]}_${b.rgb[1]}`);
          ctx.save();
          ctx.globalAlpha = Math.min(1, b.alpha);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(im, 0, 0, dither.width, dither.height, 0, gy2, viewW, viewH + num);
          ctx.restore();
        }
      }
    }
    const su = vis.sunrise, sd = vis.sunset;
    // ★XNA 语义(Color.White×vis 全通道乘):贡献 = tex.rgb·vis²+dst·(1−vis)
    //   ——rgb 与 α【都】乘 vis;仅 globalAlpha=vis 是 vis¹(渐隐边缘偏亮)。
    //   ctx.filter brightness 乘 rgb + globalAlpha 乘 α = 精确等价;不支持
    //   filter 的环境回落 vis¹ 近似(渐隐边缘略亮,渐变期短无感)
    const drawGrad = (im: HTMLImageElement, v: number) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, v);
      try { ctx.filter = `brightness(${Math.max(0, Math.min(1, v)).toFixed(3)})`; } catch { /* 老引擎无 filter */ }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, 0, 0, im.width, im.height, 0, gy, viewW, viewH + num);
      ctx.filter = 'none';
      ctx.restore();
    };
    if (su > 0.003) {
      const im = this.horizonGradTex('Sunrise', phase % 4);
      if (im) drawGrad(im, su);
    }
    if (sd > 0.003) {
      const im = this.horizonGradTex('Sunset', phase % 4);
      if (im) drawGrad(im, sd);
    }
  }
  /** 天空底色贴图首用懒加载(构造器不预载:菜单/进图各一份 SkyRenderer,且
   *  测试环境无网络贴图) */
  private skyTexImg(): ImageBitmap | HTMLImageElement | null {
    if (!this.skyBgTex) {
      this.skyBgTex = onBitmap(loadTex('Background_0.png'), (b) => { this.skyBgTex = b; this.skyBgTinted = null; });
    }
    return this.skyBgTex.width > 0 ? this.skyBgTex : null;
  }
  /** 贴图×cots 染色缓存(tint 8/255 量化——晨昏连续漂移期间缓存打爆教训同
   *  BiomeBackground.tintCache;贴图仅 48×1400,重烘成本可忽略) */
  private tintSkyTex(tex: ImageBitmap | HTMLImageElement): HTMLCanvasElement {
    const c = this.cots!;
    // ★键 = 逐单位截断(曾 1/8 量化=32 档)——晨昏 cots 扫过数百单位时天空底色
    //  按 8 单位台阶跳变 = 用户实报"光照顿挫/肉眼可见亮度跌落"(2026-08-24)。
    //  bake 本体(贴图尺寸 multiply+destination-in,画布复用)≈1ms,逐帧可承受
    const key = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
    if (this.skyBgTinted?.key === key) return this.skyBgTinted.canvas;
    const cv = document.createElement('canvas');
    cv.width = tex.width; cv.height = tex.height;
    const tc = cv.getContext('2d')!;
    tc.drawImage(tex as CanvasImageSource, 0, 0);
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    tc.fillRect(0, 0, cv.width, cv.height);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(tex as CanvasImageSource, 0, 0);
    this.skyBgTinted = { key, canvas: cv };
    return cv;
  }
  moonTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null, null, null, null, null, null, null, null];
  /** 事件月亮（kind 1=霜月 Snow / 2=南瓜月 Pumpkin,Main.cs:62400-62408）——
   *  事件进行时才需要,首用懒加载(绘制分支 ensureEventMoonTex) */
  private eventMoonTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null]; // [1]=Snow [2]=Pumpkin
  /** 事件月亮贴图(首用懒加载,未就绪调用方跳帧) */
  private ensureEventMoonTex(kind: 1 | 2): ImageBitmap | HTMLImageElement | null {
    const t = this.eventMoonTexs[kind];
    if (!t) loadBitmapOnly(`vanilla/Moon_${kind === 2 ? 'Pumpkin' : 'Snow'}.png`,
      () => !!this.eventMoonTexs[kind], (x) => { this.eventMoonTexs[kind] = x; });
    return this.eventMoonTexs[kind];
  }
  /** 世界月亮样式(原版 header moonType 0-8;默认 0 标准月) */
  moonType = 0;
  // ---- 天幕流星(AmbientSky.MeteorSkyEntity :1316-1341;spawnMeteor 期间夜 15000-16200
  //      窗口恰一颗划过,Main.HandleMeteorFall :64952-64967)----
  private meteorTex: ImageBitmap | HTMLImageElement | null = null;
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
      this.meteorTex = onBitmap(loadTex('Background_Meteor.png'), (b) => { this.meteorTex = b; });
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
    // X：顺风侧留屏外缓冲（:96-107）。num2 = wind − player.vx*0.1（:96-100，
    //  !gameMenu 才修正——frameCtx.player 在场 = 游戏内，菜单态缺省不修正）
    const num2 = this.wind - (this.frameCtx?.player?.vx ?? 0) * 0.1;
    const num3 = num2 > 0 ? -200 : 0;
    const num4 = num2 < 0 ? 200 : 0;
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
    // 海洋群系前景层满档（Cloud.cs:401 bgAlphaFrontLayer[4]==1）
    const oceanFull = (this.frameCtx?.oceanFrontAlpha ?? 0) >= 1;
    for (const c of this.vclouds) {
      // 恰界 scale 微移（Cloud.cs:373-378：1.0→0.9999 / 1.15→1.1499）——防跨
      // pass 边界（1.0 应属远空 pass1、1.15 应属近距 pass2；每帧判、自限一次）
      if (c.scale === 1) c.scale -= 0.0001;
      if (c.scale === 1.15) c.scale -= 0.0001;
      c.x += this.wind * 9 * this.cloudParallax(c.scale) * frames;
      // 海滩低云快速淡出（:399-402：kill + 0.005/帧，与下方通用 0.001 叠加 = 0.006）
      if (oceanFull && c.y > 200) {
        c.kill = true;
        c.alpha -= 0.005 * frames;
      }
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
   *  超 → 每帧随机 kill 一朵。首次进场按 resetClouds(:39-59)：恰 numClouds 次
   *  addCloud 尝试——AABB 重叠拒绝即少一朵（★曾用 while 重试凑满 guard400：
   *  离线模拟 1920×1080/目标100 档 77 朵 vs 原版 46 朵，云量约 1.7 倍——
   *  "云太多"实报根因）。下雨加密由 Weather.updateCloudCounts（numClouds 强制
   *  爬升 200×cloudAlpha）自动传导 */
  private targetCloudCount(): number {
    return this.weatherRef ? Math.max(0, Math.round(this.weatherRef.numClouds)) : 200;
  }
  private cloudsInitialized = false;
  private maintainClouds(viewW: number, viewH: number) {
    const target = this.targetCloudCount();
    if (!this.cloudsInitialized) {
      this.cloudsInitialized = true;                       // resetClouds 铺满段
      for (let j = 0; j < target; j++) {                   // :47-50 恰 numClouds 次
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

  /** 极光天空（AuroraSky.cs 1:1；激活门由 Game.updateWeather 接线） */
  readonly aurora = new AuroraSky();

  // ---- 事件天幕（SlimeSky/MartianSky：史莱姆雨剪影族 + 火星 UFO）----
  /** SlimeSky（SlimeSky.cs 1:1；激活门 = weatherRef.slimeRain 边沿,StartSlimeRain/
   *  StopSlimeRain 的 Activate/Deactivate 语义,Main.cs:64221/:64261） */
  readonly slimeSky = new SlimeSky();
  /** MartianSky（MartianSky.cs 1:1；激活门 = invasionType==4 轮询,Main.cs:58757-58763） */
  readonly martianSky = new MartianSky();
  /** 上帧 slimeRain 门（StartSlimeRain 事件语义的沿检测） */
  private slimeWasOn = false;
  /** Images/Misc/Sky_Slime_1-4（四帧竖排;0/1 常规 2/3 稀有档） */
  private slimeTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null, null, null];
  /** [0]=Extra_5 近档 28×42 三帧 / [1]=Extra_6 远档 70×90 三帧 */
  private martianTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null];
  /** [0]=Glow_90 / [1]=Glow_91（与主贴图同尺寸,同源矩形辉光叠画） */
  private martianGlowTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null];

  // ---- 沙尘暴/暴风雪色罩状态（SandstormSky/BlizzardSky 的 _opacity 渐变对） ----
  /** ManageSpecialBiomeVisuals 边沿 + Update ±ElapsedGameTime 秒渐变（两罩同构
   *  SandstormSky.cs:24-47：leaving 减到 0 → isActive=false） */
  private sandTintState = { active: false, leaving: false, opacity: 0 };
  private blizzTintState = { active: false, leaving: false, opacity: 0 };

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
  private partyTexs: Array<ImageBitmap | HTMLImageElement | null> = [null, null, null];

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
  private lanternTex: ImageBitmap | HTMLImageElement | null = null;
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
  /** band: far=深度>5（远山之后,原版 DrawToDepth(5) 前带）/ near=深度≤5（全部山层
   *  之前,:59310 后带——LanternSky 深度 1.6..6.0 按带插入山层,曾全画山后） */
  private drawLanterns(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number, dtMs: number, band: 'far' | 'near' = 'far'): void {
    const up = LanternNight.lanternsUp;
    // _opacity ±0.01/帧（:119）
    this.lanternOpacity = Math.max(0, Math.min(1, this.lanternOpacity + (up ? 0.01 : -0.01) * (dtMs / (1000 / 60))));
    if (this.lanternOpacity <= 0.001) {
      if (!up) { this.lanterns.length = 0; this.lanternsLeaving = false; }
      return;
    }
    // 相机在地表以下不画（Draw :165：screenPosition.Y > worldSurface×16 直接返回）
    if (camY > this.fx.surfaceY) return;
    if (!this.lanternTex) loadBitmapOnly('vanilla/Extra_134.png',
      () => !!this.lanternTex, (x) => { this.lanternTex = x; });
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
      if (band === 'far' ? l.depth <= 5 : l.depth > 5) continue;   // 深度带分流
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

  /** 极光绘制(AuroraSky.cs Draw/DrawAuroraSky):帧参数组装 + 地表门输入。
   *  月锚 = Main.LastCelestialBodyPosition(Main.cs:62458-62459 月屏位/ScreenSize;
   *  AuroraSky.cs:129-130 Y 侧再乘 (1920/1080)/(屏宽/屏高) 纵横比较正)——
   *  moonScreen 由本帧月亮分支写入(满月分支带 1/2 磁吸月位 :356-358 消费)。 */
  private drawAurora(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    camY: number, dtMs: number, nightTicks: number, isDay: boolean, moonPhase: number): void {
    const zQ = this.frameCtx?.z ?? 1;
    const camTopTiles = (camY - viewH / 2 / zQ) / 16;   // Main.screenPosition.Y/16
    const ms = this.moonScreen;
    const moonFrac = ms
      ? { x: ms.x / viewW, y: (ms.y / viewH) * (1920 / 1080) / (viewW / viewH) }
      : null;
    this.aurora.draw(ctx, viewW, viewH, {
      nightTicks, isDay, moonPhase,
      camTopTiles,
      surfaceTiles: this.fx.surfaceY / 16,
      moonFrac,
      dtSec: dtMs / 1000,
    });
  }

  /** 灯笼夜 near 带（深度≤5 的近灯 = 全部群系背景层之前,原版 :59310 后带）——
   *  Renderer 在 biomeBg.draw('surface') 之后调用。状态推进仍在 far 遍历内
   *  （本方法只读不推进,重复调用安全） */
  drawLanternsNear(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number, dtMs: number): void {
    this.drawLanterns(ctx, viewW, viewH, camX, camY, dtMs, 'near');
  }

  /** 派对气球 near 入口（PartySky 深 1.6..3.35 全 <5 = 全部背景层之前）——
   *  Renderer 在 biomeBg.draw('surface') 之后调用（原版 DrawToDepth(1) 带 :59621） */
  drawPartyBalloonsNear(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, dtMs: number): void {
    this.drawPartyBalloons(ctx, viewW, viewH, camX, dtMs);
  }

  // ================= 事件天幕（SlimeSky/MartianSky 1:1） =================

  /** 事件天幕激活动轮询 + 60Hz 推进（激活边沿 = 原版 Activate/Deactivate 调用点） */
  private stepEventSkies(frames: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const fc = this.frameCtx;
    const zQ = fc?.z ?? 1;
    const maxTilesX = fc?.world?.w ?? Math.max(1, Math.round(this.fx.worldW));
    const maxTilesY = fc?.world?.h ?? Math.max(1, Math.round(this.fx.worldH));
    // Slime：StartSlimeRain/StopSlimeRain 的 Activate("Slime")/Deactivate（:64221/:64261）
    // ——事件驱动语义:雨再开时无条件 Activate(重生成+!isLeaving,即便上次还在
    // 排空;StartSlimeRain 对已在下的雨 return),故以 wasOn 沿驱动激活半边
    const slimeOn = !!this.weatherRef?.slimeRain;
    if (slimeOn && (!this.slimeSky.isActive || (this.slimeSky.isLeaving && !this.slimeWasOn))) {
      this.slimeSky.activate({
        maxTilesX, maxTilesY, surfacePx: this.fx.surfaceY,
        screenTopY: camY - viewH / 2 / zQ, screenHeight: viewH,
      });
    } else if (!slimeOn && this.slimeSky.isActive && !this.slimeSky.isLeaving) {
      this.slimeSky.deactivate();
    }
    this.slimeWasOn = slimeOn;
    // Martian：invasionType==4 轮询（Main.cs:58757-58763 同式）
    const martianOn = (fc?.world?.invasionType ?? 0) === 4;
    if (martianOn && !this.martianSky.isActive) {
      this.martianSky.activate(maxTilesX);
    } else if (!martianOn && this.martianSky.isActive && !this.martianSky.isLeaving) {
      this.martianSky.deactivate();
    }
    for (let f = 0; f < frames; f++) {      // SkyManager.Update 逐 tick（dayRate=1）
      this.slimeSky.update();
      this.martianSky.update();
    }
  }

  /** SlimeSky.Draw（:162-228）：深度档着色 + 视差投影 + X 4000 环绕 + ±1000 剔除。
   *  原版按 SkyManager 深度窗分段画（DrawToDepth 各段并集 = 全量）;本仓单段全画,
   *  远→近序（数组天然按 i 升序 = Depth 升序）等价。 */
  private drawSlimeSky(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number,
  ): void {
    const sky = this.slimeSky;
    if (!sky.isActive) return;
    const zQ = this.frameCtx?.z ?? 1;
    if (camY - viewH / 2 / zQ > 10000) return;                     // :164 screenPosition.Y>10000
    const cots = this.cots;
    if (!cots) return;
    for (const s of sky.entities) {
      if (!s.active) continue;                                     // :191
      const tex = this.slimeTex(s.tex);
      if (!tex || !(tex.width > 0) || tex.width === 0) continue;
      const p = slimeProject(s.x, s.y, s.depth, camX, camY, viewW, viewH);
      if (p.x < -1000 || p.x > viewW + 1000 || p.y < -1000 || p.y > viewH + 1000) continue;  // :222
      const col = slimeSilhouetteTint(cots, s.depth);              // :193-212
      const sprite = eventTintedSprite(tex,
        Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255), `slime${s.tex}`);
      if (!sprite) continue;
      const fh = tex.height / 4;                                   // :43 FrameHeight = 高/4
      const scale = (1 / s.depth) * 2;                             // :224 vector2.X×2
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, col.a));
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sprite, 0, Math.floor(s.frame / 6) * fh, tex.width, fh,   // :61 帧行 = frame/6
        p.x, p.y, tex.width * scale, fh * scale);                  // origin (0,0)
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** MartianSky.Draw（:258-300）：主贴图 ×(cots×0.9+0.1)×Opacity + 辉光白 ×Opacity,
   *  同变换同源帧叠画;origin (0,0) 绕左上旋。 */
  private drawMartianSky(
    ctx: CanvasRenderingContext2D, viewW: number, viewH: number, camX: number, camY: number,
  ): void {
    const sky = this.martianSky;
    if (!sky.isActive) return;
    const zQ = this.frameCtx?.z ?? 1;
    if (camY - viewH / 2 / zQ > 10000) return;                     // :260
    const cots = this.cots;
    if (!cots) return;
    const tint = ufoTintColor(cots);                               // :283
    const tr = Math.round(tint.r * 255), tg = Math.round(tint.g * 255), tb = Math.round(tint.b * 255);
    for (const u of sky.ufos) {
      if (!u.active) continue;                                     // :291
      const p = ufoProject(u.x, u.y, u.depth, camX, camY, viewW, viewH);
      if (p.x < -1000 || p.x > viewW + 1000 || p.y < -1000 || p.y > viewH + 1000) continue;
      const tex = this.martianTex(u.tex);
      if (!tex || !(tex.width > 0) || tex.width === 0) continue;
      const fh = tex.height / 3;                                   // :152 FrameHeight = 高/3
      const scale = (1 / u.depth) * 5 * u.scale;                   // :293 vector2.X×5×Scale
      const alpha = Math.max(0, Math.min(1, u.opacity));
      const row = Math.floor(u.frame / 4) * fh;                    // :187 源帧行 = frame/4
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(u.rotation);
      ctx.imageSmoothingEnabled = true;
      const sprite = eventTintedSprite(tex, tr, tg, tb, `martian${u.tex}`);
      if (sprite) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite, 0, row, tex.width, fh, 0, 0, tex.width * scale, fh * scale);
      }
      const glow = this.martianGlowTex(u.glow);
      if (glow && glow.width > 0) {                                // :294-297 Color.White×Opacity
        ctx.globalAlpha = alpha;
        ctx.drawImage(glow as CanvasImageSource, 0, row, tex.width, fh, 0, 0, tex.width * scale, fh * scale);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private slimeTex(i: number): ImageBitmap | HTMLImageElement | null {
    const t = this.slimeTexs[i];
    if (!t) loadBitmapOnly(`vanilla/Misc_Sky_Slime_${i + 1}.png`,
      () => !!this.slimeTexs[i], (x) => { this.slimeTexs[i] = x; });
    return t;
  }

  private martianTex(i: number): ImageBitmap | HTMLImageElement | null {
    const t = this.martianTexs[i];
    if (!t) loadBitmapOnly(`vanilla/Extra_${i === 0 ? 5 : 6}.png`,
      () => !!this.martianTexs[i], (x) => { this.martianTexs[i] = x; });
    return t;
  }

  private martianGlowTex(i: number): ImageBitmap | HTMLImageElement | null {
    const t = this.martianGlowTexs[i];
    if (!t) loadBitmapOnly(`vanilla/Glow_${i === 0 ? 90 : 91}.png`,
      () => !!this.martianGlowTexs[i], (x) => { this.martianGlowTexs[i] = x; });
    return t;
  }

  // ================= 沙尘暴/暴风雪色罩状态机（ManageSpecialBiomeVisuals + Update） =================

  /** 单罩状态推进（SandstormSky/BlizzardSky.Update :24-47 同构,纯边沿+渐变） */
  private static stepTintState(st: { active: boolean; leaving: boolean; opacity: number },
    gate: boolean, dtSec: number): void {
    if (gate !== st.active) {                                      // ManageSpecialBiomeVisuals :123-133
      if (gate) { st.active = true; st.leaving = false; }          // Activate(:59-63)
      else st.leaving = true;                                      // Deactivate(:65-68)
    }
    if (!st.active) return;
    if (st.leaving) {                                              // :30-37
      st.opacity -= dtSec;
      if (st.opacity < 0) { st.active = false; st.opacity = 0; }
    } else {                                                       // :39-46
      st.opacity += dtSec;
      if (st.opacity > 1) st.opacity = 1;
    }
  }

  /** 每帧驱动（sky.draw 头部调用;门输入与粒子系统/SceneState 同源） */
  stepWeatherTints(dtSec: number): void {
    const fc = this.frameCtx;
    const wr = this.weatherRef;
    const scene = fc?.scene;
    const player = fc?.player;
    // SceneState.cs:120:ManageSpecialBiomeVisuals("Blizzard", UseStormEffects && ZoneRain && ZoneSnow)
    const blizzOn = blizzardSkyGate(!!scene?.zoneRain, !!scene?.zoneSnow);
    // Sandstorm:ShowSandstormVisuals 本仓等价门（Game.weatherHooks.sandstormVisuals 同源）
    const sandOn = sandstormSkyGate(
      !!wr?.sandstorm.happening, !!scene?.zoneDesert,
      player ? player.cy / 16 : Infinity, fc?.world?.groundLevel ?? 0);
    SkyRenderer.stepTintState(this.sandTintState, sandOn, dtSec);
    SkyRenderer.stepTintState(this.blizzTintState, blizzOn, dtSec);
  }

  /** 色罩 pass 输出（Renderer.drawScreenFilterChain 头插;无 cots/零强度 → 空） */
  weatherTintPasses(): import('./GLScreenFilters').ScreenFxPass[] {
    const out: import('./GLScreenFilters').ScreenFxPass[] = [];
    const cots = this.cots;
    if (!cots) return out;
    const wr = this.weatherRef;
    if (this.sandTintState.opacity > 0.001) {
      const t = sandstormSkyTint(wr?.sandstorm.severity ?? 0, this.sandTintState.opacity, cots);
      out.push({ kind: 'SkyWeatherTint', color: t.color, alpha: t.alpha });
    }
    if (this.blizzTintState.opacity > 0.001) {
      const t = blizzardSkyTint(wr?.cloudAlpha ?? 0, this.blizzTintState.opacity, cots);
      out.push({ kind: 'SkyWeatherTint', color: t.color, alpha: t.alpha });
    }
    return out;
  }

  /** 2D 兜底（GL 不可用路径;source-over = XNA AlphaBlend 同式,精确非近似） */
  drawWeatherTint2D(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    for (const p of this.weatherTintPasses()) {
      if (p.kind !== 'SkyWeatherTint') continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = `rgb(${Math.round(p.color[0] * 255)},${Math.round(p.color[1] * 255)},${Math.round(p.color[2] * 255)})`;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }
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
        loadBitmapOnly(`vanilla/Extra_${69 + i}.png`,
          () => !!this.partyTexs[i], (x) => { this.partyTexs[i] = x; });
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
    this.updateCloudCelestial(camY - viewH / 2);
    const { num3 } = this.cloudBgTop(camY, viewH);
    const distY = num3 * 750 + 830;                          // :59115（scAdj/pushBGTopHack=0）
    this.drawCloudPass(ctx, this.vclouds.filter((c) => c.scale < 1), 1, camY,
      (c) => c.y + distY);
    void isNight;
  }
  /** 上帧昼夜/月相（sky.draw 头部写入;CloudsEnd 天体色/强度输入） */
  private lastMoonPhase = 0;
  private lastIsDay = true;
  /** Main.cloudBGAlpha（:58782-58792 漂移累积器：背景云活跃 +0.0005·dayRate/帧
   *  钳 1,否则 − 同步钳 0;门 = !drunkWorld && ShouldDrawSurfaceBackground &&
   *  camTop ≤ worldSurface+10 tile）。CloudsEnd 强度 ×clamp(1−值) */
  private cloudBGAlpha = 0;
  /** CloudsEnd 每帧天体态（HorizonClouds shader 输入;drawCloudPass 消费） */
  private cloudCelestial: {
    posX: number; posY: number; intensity: number;
    r: number; g: number; b: number;
  } | null = null;

  /** CloudsEnd 天体态计算（NextHorizonRenderer.cs:328-361 逐式）：
   *  uColor = dayTime ? (255,246,204) : GetMoonColor()×GetMoonStrength()（AuroraSky.
   *  ModifyTileColor :410-418 极光活跃且月相≠QuarterAtLeft(3) 时向 _lastSkyColor
   *  lerp opacity）;强度 = max(sunset,sunrise)×celestial,夜 max(·,celestial×0.15),
   *  ×clamp(1−cloudBGAlpha);位置 = GetCelestialBodyPosition = sunScreen/moonScreen。 */
  private updateCloudCelestial(camTop: number): void {
    // cloudBGAlpha 累积器（:58781-58792;ShouldDrawSurfaceBackground ≈ 本方法调用门）
    const dayRate = this.frameCtx?.world?.dayRate?.() ?? 1;
    const camTopTiles = camTop / 16;
    if (!this.frameCtx?.world?.seedFlags?.drunkWorld && camTopTiles <= this.fx.surfaceY / 16 + 10) {
      const d = 0.0005 * dayRate;
      this.cloudBGAlpha = this.weatherRef && this.weatherRef.cloudBGActive > 0
        ? Math.min(1, this.cloudBGAlpha + d)
        : Math.max(0, this.cloudBGAlpha - d);
    }
    const v = this.horizonVisCache;
    const body = this.lastIsDay ? this.sunScreen : this.moonScreen;
    if (!v || !body) { this.cloudCelestial = null; return; }
    let num = Math.max(v.sunset, v.sunrise) * v.celestial;
    if (!this.lastIsDay) num = Math.max(num, v.celestial * 0.15);   // :348-349
    num *= Math.max(0, Math.min(1, 1 - this.cloudBGAlpha));         // :350
    if (num <= 0.0015) { this.cloudCelestial = null; return; }
    // uColor（GetCelestialBodyColors HorizonHelper.cs:109-113 + MoonColors 表 :28-36）
    let r: number, g: number, b: number;
    if (this.lastIsDay) {
      r = 255; g = 246; b = 204;
    } else {
      const moonType = Math.max(0, Math.min(8, this.moonType));
      const mc = MOON_COLORS[moonType];
      r = mc[0]; g = mc[1]; b = mc[2];
      if (this.fx.moonEventKind === 2) { r = 255; g = 225; b = 180; }        // pumpkinMoon(MOON_KIND_PUMPKIN=2)
      else if (this.fx.moonEventKind === 1) { r = 220; g = 220; b = 255; }   // snowMoon(MOON_KIND_FROST=1)
      if (this.frameCtx?.world?.seedFlags?.drunkWorld) { r = 255; g = 255; b = 255; }
      // GetMoonStrength = Remap(|4−phase|, 0,4, 0,1) = |4−phase|/4
      const ms = Math.abs(4 - this.lastMoonPhase) / 4;
      r *= ms; g *= ms; b *= ms;
    }
    // AuroraSky.ModifyTileColor(ref tileColor, 1)（:410-418:极光活跃 && 月相≠3
    // → lerp(tileColor, _lastSkyColor(A=255), opacity)）
    const aur = this.aurora.tileColorState();
    if (aur && this.lastMoonPhase !== 3) {
      const t = Math.min(1, Math.max(0, aur.opacity));
      r = r + (aur.rgb[0] - r) * t;
      g = g + (aur.rgb[1] - g) * t;
      b = b + (aur.rgb[2] - b) * t;
    }
    this.cloudCelestial = { posX: body.x, posY: body.y, intensity: num, r: r / 255, g: g / 255, b: b / 255 };
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
    // ProcessCloudAlpha(SkyManager.cs)1:1:num5 = ProcessCloudAlpha() × atmo,
    // 其中 ProcessCloudAlpha = 1 × Π(激活 CustomSky.GetCloudAlpha())——原版仅
    // 月总/四塔天空 override 为 1-fade(MoonLordSky.cs:72),默认恒 1,墓园不压云。
    // ★wr.cloudAlpha 是【雨云浓度】(IsItRaining 门;雨天 UpdateClouds 换风暴云族
    // 18-21 用),不进此门——曾误接 max(cloudAlpha,墓园×.92) → 晴天云全透明
    // (2026-08-18 用户实报"好多云不渲染";本仓暂无塔/月总天空 fade,乘积恒 1)
    const globalCloudAlpha = atmo;
    void this.weatherRef;
    // ColorOfTheSkies 单源(2026-08-20 原版化):云色直接吃 SetBackColor 曲线
    // (月相地板/血月/晨昏全对齐,原版 Cloud.cloudColor(Main.ColorOfTheSkies));
    // 首帧前回落渐变近似
    const sky = this.cots
      ? [this.cots[0] * atmo, this.cots[1] * atmo, this.cots[2] * atmo]
      : hexRGB(this.lastSkyTop, atmo);
    const sorted = [...clouds].sort((a, b) => b.scale - a.scale);   // scale 交换序等价
    // GL 主路径(2026-08-18):逐精灵顶点色 = 原版 Draw(Color) 语义,精确色零副本;
    // 不可用(WebGL2 缺失/上下文死亡退避/cpuRender/?cloudgl=0)→ 2D cloudTint 兜底
    // #A 合并(2026-08-19):云不再持有独立 WebGL 上下文——与背景层共用
    // Renderer.glfx(每帧注入;不可用/退避/cpuRender/?cloudgl=0 → 2D cloudTint 兜底)
    const glRaw = this.useGLClouds ? this.cloudGlLayer : null;
    const gl = glRaw && !glRaw.unavailable ? glRaw : null;
    if (gl) { gl.resize(ctx.canvas.width, ctx.canvas.height); gl.begin(); }
    ctx.save();
    ctx.imageSmoothingEnabled = true; // 原版云为软边贴图，平滑缩放(2D 兜底路径)
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
      const alpha = Math.min(1, Math.min(1, c.alpha * this.towerCloudMul) * globalCloudAlpha);
      // ---- HorizonClouds（obj62 逐指令;CloudsEnd 对三通道全部 _drawData 施加）----
      // GL 主路径 = 逐像素字节码公式(GLSpriteLayer.cloudQuad);2D 兜底 = 同公式
      // 单探针标量近似(horizonCloudShadeApprox:几何/强度/衰减精确,A/R 固定)
      const cel = this.cloudCelestial;
      const cx = c.x + w / 2, cyPx = yOf(c) + h / 2;         // uDrawPosition = 云中心(DrawData.position,origin=半尺寸)
      if (gl) {
        const gtex = gl.texFromImage(`cloud:${c.type}`, tex);
        if (gtex) {
          if (cel && gl.cloudFxOK) {
            gl.cloudQuad(gtex, 0, 0, gtex.w, gtex.h, c.x, yOf(c), w, h, c.rot, !!c.flip, {
              drawPos: [cx, cyPx],
              celestial: [cel.posX, cel.posY, cel.intensity],
              color: [cel.r, cel.g, cel.b],
              vertColor: [r / 255, g / 255, b / 255, alpha],
            });
          } else {
            gl.quad(gtex, 0, 0, gtex.w, gtex.h, c.x, yOf(c), w, h,
              { alpha, tint: [r / 255, g / 255, b / 255], rot: c.rot, smooth: true, flipX: !!c.flip });
          }
          continue;
        }
        // 纹理上传失败(极端):跳过本朵,不落 2D(避免同帧混路径叠画)
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cyPx);
      ctx.rotate(c.rot);
      if (c.flip) ctx.scale(-1, 1);
      let tR = r, tG = g, tB = b, tA = alpha;
      if (cel) {
        // 2D 兜底:shade 单探针标量 + 字节码尾式 final = v + shade·(lerp(v,u,0.5)·v.a − v)
        // (tex.rgb=1/tex.a=1 整朵近似;登记取舍见函数头)
        const shade = horizonCloudShadeApprox(cel, cx, cyPx, w, h, Math.max(w, h) * 0.3);
        const v0c = r / 255, v1c = g / 255, v2c = b / 255;
        const lc = [v0c + (cel.r - v0c) * 0.5, v1c + (cel.g - v1c) * 0.5, v2c + (cel.b - v2c) * 0.5];
        tR = Math.max(0, Math.min(255, 255 * (v0c + shade * (lc[0] * alpha - v0c))));
        tG = Math.max(0, Math.min(255, 255 * (v1c + shade * (lc[1] * alpha - v1c))));
        tB = Math.max(0, Math.min(255, 255 * (v2c + shade * (lc[2] * alpha - v2c))));
        tA = Math.max(0, Math.min(1, alpha + shade * ((alpha + 1) * 0.5 * alpha - alpha)));
      }
      const tinted = this.cloudTint(tex, Math.round(tR), Math.round(tG), Math.round(tB));
      ctx.globalAlpha = tA;
      ctx.drawImage(tinted, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (gl) { gl.end(); ctx.drawImage(gl.canvas, 0, 0); }   // 合成进主画布(三 pass 间 clear 复用)
  }

  // ---- 云 GL 共享层(#A 2026-08-19 合并:云与背景层共用 Renderer.glfx 一个
  //      WebGL 上下文,每窗少一个上下文+全屏背板;生命周期(死亡退避/重建/
  //      释放)全归 Renderer.acquireGL,本类只持当帧注入的引用) ----
  cloudGlLayer: GLSpriteLayer | null = null;
  /** GL 云总门(?cloudgl=0 逃生门;cpuRender 由 Renderer 注入 null 实现) */
  useGLClouds = typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('cloudgl') !== '0' : true;
  disposeCloudGL(): void {
    // 上下文本体归 Renderer.glfx 管;这里只摘引用(调用方:cpu 切换/销毁)
    this.cloudGlLayer = null;
  }

  private cloudTintCache = new Map<string, HTMLCanvasElement>();
  /** GPU contextlost 后云染缓存内容归零且不会自动重画——失效清空
   *  (Renderer.onLost 统一扫;GL 云路径下通常为空,零成本) */
  clearCloudTintCache(): void {
    for (const c of this.cloudTintCache.values()) { c.width = 0; c.height = 0; }
    for (const c of this.cloudTintFree) { c.width = 0; c.height = 0; }
    this.cloudTintCache.clear();
    this.cloudTintFree.length = 0;
  }
  /** 纹理实例 id(ImageBitmap 无 .src,裸读恒 undefined → 跨云纹理键碰撞;
   *  bitmap 迁移时代 WeakMap 方案同款) */
  private cloudTexIds = new WeakMap<object, number>();
  private cloudTexIdSeq = 0;
  /** 云朵着色缓存（multiply + destination-in 保形）。
   *  为什么存在:原版画云 = spritebatch.Draw(tex, …, new Color(r*i,g*i,b*i))
   *  ——绘制调用自带颜色乘法(shader 一条指令);Canvas 2D 的 drawImage 没有
   *  颜色参数,等价实现只能预烘焙"贴图×天色"副本。天色因子 = 天空渐变 ×
   *  (scale×alpha×pass 系数) × 大气态,每朵云不同且随时间连续漂移 → 按
   *  (纹理,量化色) 键缓存复用。
   *  ★色键量化步进 8(2026-08-18 canvas 出生栈普查:旧键含逐帧漂移的
   *  Math.round(r,g,b) → 每帧每云 miss → ~340 张/秒 createElement('canvas'),
   *  是移动期 IOSurface churn 主源;量化后键只在天色跨桶时换,churn 趋零。
   *  步进 8 = 通道 3% 内误差,软边低对比云上不可感知)
   *  ★真 LRU + cap 24(2026-08-18 二轮):实测工作集 = 同屏云色桶 ~10-16,
   *  旧 FIFO+64 会把历史冷桶全留下(cap 打满 64 张常驻画布)。命中重插到
   *  Map 尾 = 冷桶先走;miss 重染成本 = 3 次 ~200×100 drawImage,即使偶发
   *  超工作集也无感。总画布上限 = cap 24 + free 池 8 = 32 */
  private cloudTint(tex: ImageBitmap | HTMLImageElement, r: number, g: number, b: number): HTMLCanvasElement {
    let tid = this.cloudTexIds.get(tex);
    if (tid === undefined) { tid = ++this.cloudTexIdSeq; this.cloudTexIds.set(tex, tid); }
    const key = `${tid}|${r & ~7},${g & ~7},${b & ~7}`;
    const hit = this.cloudTintCache.get(key);
    if (hit) {
      // 真 LRU:命中重插到 Map 尾——旧 FIFO 不认热,历史冷桶赖着不走,曾把 cap
      // 塞满 64 张常驻画布(实测工作集只有 ~10-16 色桶)
      this.cloudTintCache.delete(key);
      this.cloudTintCache.set(key, hit);
      return hit;
    }
    // ★画布池复用(2026-08-18):同屏多云色桶并存,纯量化仍 ~55 张/秒;
    // 逐桶弃旧新建 = createElement churn(曾 340 张/秒)。改为 LRU 淘汰的画布
    // 进 free 池,miss 时原位重画——零画布出生,活集恒 ≤64(与 chunk atlas 同哲学)
    let c = this.cloudTintFree.pop();
    if (!c) c = document.createElement('canvas');
    if (c.width !== tex.width || c.height !== tex.height) { c.width = tex.width; c.height = tex.height; }
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = true;
    // ★copy 整体替换(review 修,池化复用双坑):①上一轮遗留 globalCompositeOperation
    //  =destination-in 会让首绘变擦除;②残留旧云像素会透过新贴图透明区串色。
    //  copy 连状态带像素一次归零;后续 multiply/destination-in 各自显式设定
    cx.globalCompositeOperation = 'copy';
    cx.drawImage(tex, 0, 0);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(tex, 0, 0);
    this.cloudTintCache.set(key, c);
    if (this.cloudTintCache.size > 24) {
      const first = this.cloudTintCache.keys().next().value;   // Map 头 = 最久未用(LRU)
      if (first !== undefined) {
        const evicted = this.cloudTintCache.get(first);
        this.cloudTintCache.delete(first);
        // 归池复用,不弃;封顶 8——总画布上限 = 24 cap + 8 池 = 32
        if (evicted && this.cloudTintFree.length < 8) this.cloudTintFree.push(evicted);
      }
    }
    return c;
  }
  /** cloudTint 淘汰画布的复用池(封顶 8:miss 优先取池;工作集收缩时 surplus 弃) */
  private cloudTintFree: HTMLCanvasElement[] = [];

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
  private ambTexCache = new Map<string, ImageBitmap | HTMLImageElement>();
  /** NPC.butterflyChance（NPC.cs:94583-94599 每日黎明掷）——按 dayCount 重掷 */
  private butterflyDay = -1;
  private butterflyChance = 999999;
  /** MP 氛围联机（module100）：true = 服务器 AmbienceServer 驱动（原版客户端无本地
   *  调度器——本地掷族关闭,只消费广播 + 本地推进既有实体）；Game 进联机时置位 */
  ambientRemoteDriven = false;
  /** module100 到达的待生成族（onAmbienceSpawn 随时入队；drawAmbience 帧首消费——
   *  生成需要当帧相机位做屏幕空间→世界投影,与本地路径同源） */
  private pendingAmbientSpawns: Array<{ family: AmbientFamily; seed: number; anchorX: number; anchorY: number }> = [];
  /** 最近天空色（GetColor 的 bgColor = Main.ColorOfTheSkies；sky.draw 每帧写入） */
  private lastSkyTop = '#4A90E0';
  private lastSkyBottom = '#B8DCF5';
  /** ColorOfTheSkies(0-255;Renderer 每帧写入,Main.cs:63361)——云 cloudColor/
   *  环境天空实体 GetColor 的 bg 单源。null=首帧前,消费方回落 lastSky* 近似 */
  cots: readonly [number, number, number] | null = null;
  /** 天空底色贴图(Background_0.png 48×1400 竖条,Main.cs:61516 ×ColorOfTheSkies;
   *  首用懒加载,未就绪回落 SKY_KEYS 渐变) */
  private skyBgTex: ImageBitmap | HTMLImageElement | null = null;
  private skyBgTinted: { key: string; canvas: HTMLCanvasElement } | null = null;

  /** 清空（退世界/换图时由 Game.destroy 调用，防跨世界残留） */
  clearAmbience(): void {
    this.ambEntities = [];
    this.ambFrame = 0;
    this.ambNextAttempt = 0;
    this.butterflyDay = -1;
    this.clearTowerSky();
    this.clearMoonlordDrama();
    this.aurora.reset();   // SkyManager.Reset(AuroraSky.cs:435-439)
    this.slimeSky.reset();         // SkyManager.Reset 同批(SlimeSky.Reset :242-245)
    this.martianSky.reset();       // (MartianSky.Reset :342-345)
    this.slimeWasOn = false;
    this.sandTintState = { active: false, leaving: false, opacity: 0 };
    this.blizzTintState = { active: false, leaving: false, opacity: 0 };
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
    life: number, camX: number, camY: number, texKey: string, rows: number, variant: number,
    r: () => number = Math.random): AmbientEnt {
    const spec = AMBIENT_FAMILY_PARAMS[kind];
    const [x, y] = this.ambientWorldPos(sx, sy, depth, camX, camY);
    return {
      kind, x, y, depth, dir, life, bornAt: this.ambFrame,
      fadeIn: spec.fadeIn, fadeOut: spec.fadeOut,
      frame: spec.frameRandom ? Math.floor(r() * rows) : 0,
      rows, framingSpeed: spec.framingSpeed || 0x7fffffff,
      frameOffset: spec.frameOffset ? Math.floor(r() * rows) : 0,
      opacity: 0, vx: 0, vy: 0, rotation: 0,
      brightness: spec.brightness, depthScaleAdj: spec.depthScaleAdj ?? 0,
      grayDepthFade: !!spec.grayDepthFade, texKey, variant,
      magAccX: 0, magAccY: 0, magTX: 0, magTY: 0, magPX: 0, magPY: 0, magVX: 0, magVY: 0,
      state: 0, waviness: 0, dead: false,
    };
  }

  /** 生成一族（AmbientSky.Spawn :1425-1537 分发 → 各类构造器/CreateGroup 1:1）。
   *  r = 随机源（本地路径 Math.random；module100 广播路径 = seed 确定性 PRNG——
   *  全端同 seed 同实体,FastRandom(seed) 同义）。anchor = 出生域锚玩家位
   *  （缺省本地玩家；远端锚玩家 = msg13 镜像位,Player.Center 语义） */
  private spawnAmbientFamily(kind: AmbientFamily, camX: number, camY: number,
    r: () => number = Math.random, anchor?: { x: number; y: number }): void {
    const spec = AMBIENT_FAMILY_PARAMS[kind];
    const group = AMBIENT_GROUP_SPEC[kind];
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    // spriteDir（各族 :191 等：WindForVisuals≤0 → Flip；Airship :1087/AirBalloon :1134 = random.Next(2)）
    const dir: 1 | -1 = spec.randomDir
      ? (Math.floor(r() * 2) !== 0 ? -1 : 1)
      : (wind > 0 ? 1 : -1);
    // VirtualCamera（VirtualCamera.cs:5-14）：Position = 玩家中心 − 2048、Size = 4096²
    // （Main.cs:3753-3755 HiDef 档）——出生域以玩家为锚，与渲染视口无关
    const px = anchor?.x ?? this.amb.playerX;
    const vcamX = px - VIRTUAL_CAM_HALF;                       // vcam.Position.X
    const vcamY = (anchor?.y ?? this.amb.playerY) - VIRTUAL_CAM_HALF;   // vcam.Position.Y
    // :452-459（各族同构）：Effects==None（顺风）→ 左沿外 100；Flip → 右沿(Position.X+Size.X)外 100
    const edgeX = dir > 0 ? vcamX - 100 : vcamX + VIRTUAL_CAM_SIZE + 100;
    const mk = (sx: number, sy: number, d: number, l: number, key: string, rows: number, variant: number) =>
      this.mkAmbient(kind, sx, sy, d, dir, l, camX, camY, key, rows, variant, r);
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

  /** module100 广播路径入口（NetAmbienceModule → AmbientSky.Spawn :1425 1:1）：
   *  type = SkyEntityType 注册序；seed = 服务器 Main.rand.Next() 掷（FastRandom
   *  位级不需复刻——全端只需同 seed 同实体,仓库 mulberry32 确定性等价）；
   *  anchorX/Y = 锚玩家中心（Game 从 msg13 镜像解析）。入队下一帧 drawAmbience
   *  消费（生成需当帧相机投影）。未知型（Meteor/BoneSerpent/未来型）静默忽略 */
  queueAmbientNet(type: number, seed: number, anchorX: number, anchorY: number): void {
    const family = ambientFamilyOfSkyType(type);
    if (!family) return;
    if (this.pendingAmbientSpawns.length > 16) this.pendingAmbientSpawns.shift();   // 防积压
    this.pendingAmbientSpawns.push({ family, seed, anchorX, anchorY });
  }

  /** seed → [0,1) 确定性随机源（mulberry32；module100 广播重放专用——本地路径
   *  仍走 Math.random 保持原分布） */
  private static seededFloat(seed: number): () => number {
    let s = (seed | 0) || 1;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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
   * MP（module100）：服务器 AmbienceServer 独占掷族（原版 dedServ 侧同构）——本地
   * 调度门关（ambientRemoteDriven），帧首消费广播队列（同 seed 重放）。
   */
  drawAmbience(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    camX: number, camY: number, dtMs = 16.7): void {
    if (this.fx.surfaceY <= 0) return;   // 未进世界（fx 未注入）
    const ticks = Math.max(1, Math.round(dtMs / (1000 / 60)));
    const wind = this.weatherRef ? this.weatherRef.windSpeedCurrent : this.wind;
    const moonlord = this.moonLordPresent();   // :1362-1369 月总天空冲突 → Ambience 禁出
    // module100 广播重放（NetAmbienceModule → Spawn：不查本地条件/月总门——服务器
    // 已掷过,客户端照生（原版 Deserialize 同样直生））
    if (this.pendingAmbientSpawns.length) {
      for (const p of this.pendingAmbientSpawns) {
        this.spawnAmbientFamily(p.family, camX, camY,
          SkyRenderer.seededFloat(p.seed), { x: p.anchorX, y: p.anchorY });
      }
      this.pendingAmbientSpawns.length = 0;
    }
    for (let f = 0; f < ticks; f++) {
      this.ambFrame++;
      if (this.ambNextAttempt > 0) {
        this.ambNextAttempt -= 1;                                   // :100-104
      } else if (!moonlord && !this.ambientRemoteDriven) {
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
    // 事件天幕（SlimeSky/MartianSky）：激活轮询 + 60Hz 推进 + 绘制——SkyManager
    // DrawToDepth 深度交错段的本仓等价槽（群系背景之上、tile 之下,与 Ambience 同层）
    this.stepEventSkies(ticks, camX, camY, viewW, viewH);
    this.drawSlimeSky(ctx, viewW, viewH, camX, camY);
    this.drawMartianSky(ctx, viewW, viewH, camX, camY);
    if (!this.ambEntities.length) return;
    // atmo（Game.updateWeather 同公式，Main.cs:62622）——CommonDraw :76 color × atmo
    const atmo = Math.max(0, Math.min(1,
      (camY / 16 - (65 + 10 * (this.fx.worldW / 4200) ** 2)) / Math.max(1, this.fx.surfaceY / 16 / 5)));
    // GetColor 的 bgColor = Main.ColorOfTheSkies(2026-08-20 原版化:单源直取;
    // 首帧前回落渐变底色近似)
    const cbg = this.cots ?? (() => {
      const sv = parseInt(this.lastSkyBottom.slice(1), 16);
      return [(sv >> 16) & 255, (sv >> 8) & 255, sv & 255] as [number, number, number];
    })();
    const sr = cbg[0], sg = cbg[1], sb = cbg[2];
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
  private ambTex(key: string): ImageBitmap | HTMLImageElement | null {
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
  /** 夜月屏位(月亮分支每帧写入,r=月盘半径;Renderer.compositeLight 消费——
   *  光照图注入月盘满光,月区乘法≈恒等=原版"月亮不吃乘光"语义) */
  moonScreen: { x: number; y: number; r: number } | null = null;
  /** sunModY/moonModY（Main.cs:1244/:1246 static short）：日月垂直抓取偏移——
   *  绘制位 = 基准 y + modY（:62376/:62395），LastCelestialBodyPosition（:62458,
   *  即 sunScreen/moonScreen）与命中盒（:62413）同源。游戏内无写点（拖拽彩蛋仅
   *  gameMenu,:62417）→ 恒 0；标题屏写点 = setCelestialModY（TitleMenu 拖拽 →
   *  mainFlow.onSunMoonGrab → MenuBackground.setCelestialModY）。每帧 ×0.999 衰减
   *  （:62415-62416，见 sky.draw 日月段尾） */
  private sunModY = 0;
  private moonModY = 0;
  /** 标题屏拖拽写点（Main.cs:62430 sunModY=(short)(mouseY−num4) / :62440
   *  moonModY=(short)(mouseY−num7)）——本方法 short 截断同式 */
  setCelestialModY(dayTime: boolean, modY: number): void {
    const t = Math.trunc(modY);
    const s = (t << 16) >> 16;
    if (dayTime) this.sunModY = s; else this.moonModY = s;
  }
  private sunflareTex: Partial<Record<SunflareTex, HTMLImageElement>> = {};

  /** GetVisibilities（NextHorizonRenderer.cs:199-239 一比一）：
   *  atmo ×(1-cloudAlpha)² ×(1-蘑菇光影响[无→1])；日出窗 = time∈(0,2700)↑·(3600,10800)↓；
   *  日落窗 = 54000−10800..−3600 ↑ 与 −3600..54000 ↓²；夜/日食清零 */
  private sunVisibilities(dayTimeTicks: number, isDay: boolean, eclipse: boolean, atmo: number,
    cloudAlpha: number, mushroom = 0): { sunset: number; sunrise: number; celestial: number } {
    const celestial = this.celestialEffectPower(dayTimeTicks, isDay);   // :315-325
    let vis = atmo * (1 - cloudAlpha) * (1 - cloudAlpha);               // :205-209
    vis *= 1 - mushroom;                                                // :210(蘑菇影响)
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

  private sunflareTexLoad(key: SunflareTex): ImageBitmap | HTMLImageElement | null {
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
   *  绘制，遮挡调制以 sunVisibility 乘 intensity（登记：层级偏早）。
   *  ★遮挡语义定谳（2026-08-20 PixelShader.cso obj69 逐指令,SM2 解释器执行核验）:
   *  全 pass 共 6 条——texld r0 = 光斑贴图 t0;mul r0 × v0(元素顶点色);mov r1.xy=(0.5,0)
   *  + texld r1 = s1(1×1 遮挡纹理 @ (0.5,0) 恒定采样);mul r0 × r1.w;输出。
   *  即 final = 贴图.rgba × 元素色.rgba × occlusion.α ——【标量×每元素色】,
   *  与本实现"intensity 预乘 occ → tintedSprite×globalAlpha"数学等价(乘法结合律;
   *  解释器金标 tests/fx-pixelshader-parity.test.ts LensFlare 锚)。无渐变重采样
   *  或其他项——现标量近似即字节码精确等价,非近似。 */
  private drawLensFlare(ctx: CanvasRenderingContext2D, viewW: number, viewH: number,
    sunset: number, sunrise: number, celestial: number): void {
    const sun = this.sunScreen;
    if (!sun) return;
    // SunVisibilityEnabled 门（HorizonHelper.cs:42 = _targetUpToDate）：首帧采样未就绪
    // 时不画光斑（原版同）——进世界后第二帧起生效
    if (!this.sunVisSampled) return;
    // AdjustIntensity（:393-408，纯函数 adjustFlareIntensity）：常态
    //  intensity = (temporal×celestial)³；sunScorchCounter>0 分支整体替换为
    //  1−(1−lerp(0,300,counter))² 曲线 ×celestial ×5（吸血鬼种子阳光炽灼档）——
    //  再 × 遮挡可见度（原版在 shader 采样 SunVisibilityPixel alpha）。
    //  ★2026-08-20 校勘：旧实现多乘一次 celestial（(t·c)³·c ≠ (t·c)³,晨昏耀斑
    //  整体过暗——"以前有移植不代表准确"的实证件）
    const occ = this.sunVisibility;
    const scorch = this.frameCtx?.player?.sunScorchCounter ?? 0;
    const num = adjustFlareIntensity(sunrise, celestial, scorch) * occ;
    const num2 = adjustFlareIntensity(sunset, celestial, scorch) * occ;
    if (num <= 0.01 && num2 <= 0.01) return;
    const cx = viewW / 2, cy = viewH / 2;
    // :46-49 轴角 + Main.screenPosition.Y·0.001(世界屏顶 Y——旧误用 sun.y 屏幕坐标)
    const baseRot = Math.atan2(cy - sun.y, cx - sun.x) + this.lastScreenTopY * 0.001;
    // 玩家残影项（LensFlareElement.cs:34-37）：本仓等价 = Player.advancedShadows
    // 位置历史环（翅膀 45 彩虹拖尾同源数据）；无残影（环 ≤1 项）恒 0
    const shadowD = flareShadowTerm(this.frameCtx?.player?.advancedShadows, sun.x, sun.y, cx, cy) * -0.0002;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    if (num2 > 0.01) this.drawLensFlareSet(ctx, sun.x, sun.y, cx, cy, baseRot, num2, 'sunset', shadowD);
    if (num > 0.01) this.drawLensFlareSet(ctx, sun.x, sun.y, cx, cy, baseRot, num, 'sunrise', shadowD);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** DrawSunsetFlare / DrawSunriseFlare 元素表（:410-541 逐元素 1:1）。
   *  元素定位（LensFlareElement.Draw :28-52）：i ∈ [0,RepeatTimes)——
   *  scale = ScaleStart+ScaleOverIndex·i；alpha = Color×(1+IntensityOverIndex·i)×intensity；
   *  d = (DistanceStart+DistanceAlongIndex·i+玩家残影项)%1（:43 num2 += num·−0.0002；
   *  %1 保号=C# 语义,残影项可为负→元素沿轴外推）；pos = Lerp(sun,center,d*2)；rot = 轴角+Rotation */
  private drawLensFlareSet(ctx: CanvasRenderingContext2D, sunX: number, sunY: number,
    cx: number, cy: number, baseRot: number, intensity: number, which: 'sunset' | 'sunrise',
    shadowD = 0): void {
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
        let d = distStart + distStep * i + shadowD;                     // :42-43 num2 += num·−0.0002
        d %= 1;                                                         // :44 %1 保号（残影项可负）
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
      // Main.screenPosition.Y(=屏顶世界 Y,LensFlareElement :49 轴角微扰项)
      this.lastScreenTopY = camY - viewH / 2 / z;
      this.drawLensFlare(ctx, viewW, viewH, v.sunset, v.sunrise, v.celestial);
    }
  }
  /** 上帧屏顶世界 Y(LensFlareElement :49 baseRot 微扰用) */
  private lastScreenTopY = 0;

  /** 月总死亡白闪帧尾出口（MoonlordDeathDrama.DrawWhite Main.cs:61763：ScreenDarkness
   *  .DrawFront 之后、ScreenObstruction.Draw 之前 = 几乎帧末）。2026-08-13 挪正：此前
   *  挂在 drawWorldFx（Renderer 2d' 世界变换段 = tile 上实体下），白闪被实体/光照合成
   *  压掉。Renderer 7c/7c-bis 之间调用（drawMoonLordShake 后、ScreenObstruction 前） */
  drawMoonlordWhiteFlash(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    this.drawMoonlordWhitening(ctx, viewW, viewH);
  }

  /** atmo（Game.updateWeather 同公式，Main.cs:62622） */
  /** 大气层衰减(Main.cs:62622 UpdateAtmosphereTransparencyToSkyColor 的 atmo 值;
   *  2026-08-20 起 Renderer 也消费——云量压暗 cots 用) */
  atmoValue(camY: number): number {
    return atmoOf(camY, this.fx.worldW, this.fx.surfaceY);
  }

  /** 菜单相机 Y（Main.cs:47620 DrawMenu：screenPosition.Y = worldSurface·16 −
   *  screenHeight）——云三通道 num3 视差/大气系数按此归位（曾传 0 → num3 把
   *  云推到屏外树后、atmo 钳 0 染色全暗） */
  vanillaMenuCamY(viewH: number): number {
    return this.fx.surfaceY - viewH;
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
    // 沙尘暴/暴风雪色罩状态机（SandstormSky/BlizzardSky 的门轮询+_opacity 渐变;
    // pass 由 Renderer.drawScreenFilterChain 于帧尾(7d)头插消费——此处先更新状态,
    // 帧内序正确)
    this.stepWeatherTints(dtMs / 1000);
    const t = clock.timeOfDay;
    const isDay = t > ClockVal.DAWN && t < ClockVal.DUSK;
    // ★0.1875 基(=Clock.DAWN,原版 Main.time 0=4:30AM)——曾用 0.25 基差 1.5h,
    //  日/月位与晨昏窗整体偏移(2026-08-23 校正,菜单调度对拍抓出)
    const dayTimeTicks = isDay ? ((t - ClockVal.DAWN) / 0.625) * 54000 : 0;
    // 晨昏可见性(GetVisibilities :217-256,复用既有 sunVisibilities 单实现)
    // +调色板相位(Main.HorizonPhase)——日/月绘制、晨昏渐变与 Renderer.
    // setFrameHorizon(光种渗入)共用;镜头光斑走 drawWorldFx 链不变
    this.horizonVisCache = this.sunVisibilities(dayTimeTicks, isDay, !!clock.eclipse,
      this.atmoValue(camY), this.weatherRef?.cloudAlpha ?? 0,
      this.frameCtx?.scene?.biomeLightInfluence?.mushroom ?? 0);
    this.horizonPhase = horizonPhaseOf(Math.max(0, Math.min(7, clock.moonPhase ?? 0)), isDay, dayTimeTicks);
    // CloudsEnd(HorizonClouds shader)输入态缓存:月相/昼夜(SkyRenderer.drawCloudPass 区消费)
    this.lastMoonPhase = Math.max(0, Math.min(7, clock.moonPhase ?? 0));
    this.lastIsDay = isDay;
    // Main.screenPosition.Y(屏顶世界 Y)与 zoom——天空贴图 bgTopY/日月轨迹/
    // 镜头光斑轴角微扰共用
    const zQ = this.frameCtx?.z ?? 1;
    const screenTopWorld = camY - viewH / 2 / zQ;
    // bgTopY(Main.cs:61483:−screenPosition.Y/(worldSurface·16−600)·200;worldSurface≤30 → 0)
    // ★gameMenu 门(:61481-82 gameMenu||netMode==2 → bgTopY=0)——菜单传原版
    //  screenPosition.Y(=surface−屏高)后此门必须生效,否则日月/云整体偏移
    const skyBgTopY = !this.frameCtx ? 0
      : this.fx.surfaceY > 30
        ? -screenTopWorld / Math.max(1, this.fx.surfaceY - 600) * 200 : 0;
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
    // ★天空底色 = Background_0 × ColorOfTheSkies(Main.cs:61508-61516 唯一绘制式,
    //  2026-08-20 原版化):昼夜/月相地板/血月/日食/晨昏渗入全由 cots 乘法驱动,
    //  天空贴图恒同一张(原版不换昼夜贴图)。夜 = 亮贴图×~0.075 ≈ 暗蓝。
    //  几何 1:1(:61506-61512):dest = (bgStartX, bgTopY, 贴图宽, max(屏高,贴图高))
    //  ——横向逐 48px 平铺(实测横向完全均匀,整幅拉伸等价);竖向 1:1 顶锚
    //  bgTopY(曾整幅拉伸满屏 = 渐变竖向位置漂移,校勘 2026-08-20 末轮)。
    //  贴图未就绪/cots 缺(首帧/测试环境)回落旧渐变
    const skyTex = this.skyTexImg();
    if (skyTex && skyTex.width > 0 && this.cots) {
      const tinted = this.tintSkyTex(skyTex);
      ctx.imageSmoothingEnabled = true;
      const dh0 = Math.max(viewH, skyTex.height);
      ctx.drawImage(tinted, 0, 0, skyTex.width, skyTex.height, 0, skyBgTopY, viewW, dh0);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, viewH);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
      // 回落分支的日食压暗(主分支已含于 cots)
      if (clock.eclipse && t > ClockVal.DAWN && t < ClockVal.DUSK) {
        const dayTime = ((t - ClockVal.DAWN) / 0.625) * 54000;
        const L = Math.min(1, dayTime / 1242);
        if (L > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = `rgb(${Math.round(255 * (1 - 0.925 * L))},${Math.round(255 * (1 - 0.96 * L))},${Math.round(255 * (1 - L))})`;
          ctx.fillRect(0, 0, viewW, viewH);
          ctx.restore();
        }
      }
    }
    // 晨昏地平线渐变(DrawHorizon :81-105,画在天空底色后、星星前)
    if (this.horizonVisCache && (this.horizonVisCache.sunrise > 0.003 || this.horizonVisCache.sunset > 0.003)) {
      this.drawHorizonGradients(ctx, viewW, viewH, camY, this.horizonVisCache, this.horizonPhase);
    }
    // 闪电白已改走 ColorOfTheSkies 链(Main.cs:63346-63355:bgColor 三通道向 1
    // lerp lightning,天空/远景/光种子同步闪亮)——旧全屏白闪 overlay 退役
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
    // 星星(DrawStarsInBackground :62467-62606 + DrawStar :62481-62604,2026-08-20
    // 全量 1:1——贴图/亮度公式/位置映射/坠星尾迹;旧方块近似退役)
    if (isNight) {
      // 墓园雾吞(:62471-62479):×(1−1.4·I),≤0 整群跳过
      const starDim = Math.max(0, 1 - gyIntensity * 1.4);
      // 可见性门(:62491-62493):天空够暗才画(remixWorld 恒画)——
      // 255·(1−cloudAlpha·atmo) − ColorOfTheSkies.R − 25 > 0
      const cotsR = this.cots ? this.cots[0] : 255;
      const visGate = 255 * (1 - (this.weatherRef?.cloudAlpha ?? 0) * this.atmoValue(camY)) - cotsR - 25;
      if (starDim > 0 && visGate > 0) {
        const dayRate = this.frameCtx?.world?.dayRate?.() ?? 1;
        this.updateStars(dayRate, isDay, dayTimeTicks);
        for (let i = 0; i < this.numStars; i++) this.drawStar(ctx, i, starDim, viewW, viewH, skyBgTopY);
      }
    } else {
      // 昼间也推进(昼 time≥27000 重生 hidden 星,UpdateStars :148-155)
      const dayRate = this.frameCtx?.world?.dayRate?.() ?? 1;
      this.updateStars(dayRate, isDay, dayTimeTicks);
    }

    // ---- 月塔天空装饰层（Nebula/Solar/Stardust/Vortex Sky：远景段黑幕盖星，
    //      日月/云画其上；云量 ×GetCloudAlpha()=0.7 起）----
    this.drawTowerSky(ctx, viewW, viewH, camX, camY, dtMs);

    // ---- 原版太阳/月亮(Main.cs:62279 DrawSunAndMoon 一比一,2026-08-20 补全
    //      双通道日光色/云遮蔽/光斑——此前单通道裸绘,用户实报"太阳渲染差
    //      十万八千里")----
    // 昼夜时间(Clock.DAWN 0.1875/DUSK 0.8125 边界 → 原版 day 0-54000 / night
    //  0-32400;★曾用 0.25/0.75 基=差 1.5h,月位/晨昏窗整体偏移 2026-08-23 校正)
    const nightTime = !isDay ? ((((t - ClockVal.DUSK) + 1) % 1) / 0.375) * 32400 : 0;
    // 云遮蔽系数(DrawSunAndMoon :62352-62360/:62378-62383:num12/num13 =
    // 1-蘑菇影响-cloudAlpha×1.5×atmo,钳 0;蘑菇影响 Game 平滑值经 scene 注入)
    const cloudAlpha = this.weatherRef?.cloudAlpha ?? 0;
    const atmoD = this.atmoValue(camY);
    const bio = this.frameCtx?.scene?.biomeLightInfluence;
    const mushI = bio?.mushroom ?? 0;
    const sunDim = Math.max(0, 1 - mushI - cloudAlpha * 1.5 * atmoD);
    // 日/月轨迹 y = bgTopY + dip·250 + 180(:62290/:62301);★旧移植漏 bgTopY,
    // 日月整体偏低 ~200px(校勘 2026-08-20)——skyBgTopY 在 draw() 头部算好共用
    const bgTopY = skyBgTopY;
    // LastCelestialBodyPosition（:62458）基准暂存：绘制用衰减前 modY（:62376），
    // 帧尾 decay 后以衰减值写 sunScreen/moonScreen（:62458-62459 逐帧序）
    let sunBase: { x: number; y: number } | null = null;
    let moonBase: { x: number; y: number; r: number } | null = null;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (isDay) {
      this.moonScreen = null;
      // 日食换贴图(:62354-62364:eclipse → Sun3;else if !gameMenu && player.head==12 →
      // Sun2 骷髅头太阳——头槽 12=物品 237 太阳镜;frameCtx.player 存在即游戏内
      // (菜单不注入 frameCtx = !gameMenu 门),headArmorSlot=时装优先的 player.head 语义)
      let tex: ImageBitmap | HTMLImageElement = this.sunTex;
      const s3 = this.sun3TexImg();
      let flag2 = false;              // Sun2 档（Extra[280] 墨镜叠层门,:62380）
      if (clock.eclipse && s3 && s3.width > 0) tex = s3;
      else {
        const s2 = this.sun2TexImg();                              // :62365-62370
        if (this.frameCtx?.player?.headArmorSlot === 12 && s2) { tex = s2; flag2 = true; }
      }
      if ((tex.width > 0) && tex.width > 0) {
        // 原版:x = time/54000*(屏宽+图宽*2)-图宽(横穿);y = bgTopY + |t*2-1|²*250+180(正午最高);
        // scale = (1.2-|t*2-1|²*0.4)*1.1;rotation = t*2-7.3(t=time/54000)
        // ★:62289 num3 恒用基础 Sun 宽度算——换皮(Sun3/Sun2 64×64)只换绘制贴图,
        //   x 在 value 重指前已定;曾误用换皮贴图宽 → 日食/墨镜太阳横穿轨迹漂移
        //   (基础贴图未就绪兜底 114 = Sun.png 原生宽)
        const ft = dayTimeTicks / 54000;
        const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
        const sw = this.sunTex.width || 114;
        const x = ft * (viewW + sw * 2) - sw;
        const y = bgTopY + dip * 250 + 180;
        const yD = y + this.sunModY;  // :62376 绘制位 = 基准 y + sunModY
        const scale = (1.2 - dip * 0.4) * 1.1;
        sunBase = { x, y };           // 镜头光斑轴锚基准（:62458 衰减后 +sunModY 再写 sunScreen）
        // 双通道(:62352-62374):①本体 = 非日食恒纯白全 α;日食 = 暗紫
        //   (255·n12, sunG·n12, sunB·n12, 255·n12);②叠层 = sunColor×n12 染色、
        //   α = sunColor.B×n12;flag 档(日食 Sun3 :62362-62364 / 太阳镜 Sun2 :62371-62373)
        //   为 (B−60)·n12
        // sunColor 群系修正(:63060-63213 腐化/猩红/丛林/蘑菇四块)
        const sunCol: [number, number, number] = sunColorOf(dayTimeTicks);
        if (bio) applyBiomeToSun(sunCol, bio);
        const scr = sunCol[0], scg = sunCol[1], scb = sunCol[2];
        const ecl = !!clock.eclipse;
        const flag = ecl || flag2;    // :62371(换皮档 → color2 α=(B−60)·n12)
        const pass2 = () => {
          const p2a = (flag ? scb - 60 : scb) * sunDim / 255;
          if (p2a <= 0) return;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, p2a));
          ctx.translate(x, yD);
          ctx.rotate(ft * 2 - 7.3);
          // color2.RGB = sunColor×n12(:62368-62371/:62373)——染色值本身也乘 n12
          const im = (scr > 250 && scg > 250 && scb > 250) ? tex
            : this.tintTex(tex, scr * sunDim, scg * sunDim, scb * sunDim, 'sun');
          ctx.drawImage(im, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
          ctx.restore();
        };
        // 通道①:本体
        ctx.save();
        if (ecl) {
          ctx.globalAlpha = Math.max(0, Math.min(1, sunDim));
          // 暗紫乘染(255·n12, sunG·n12, sunB·n12)
          const p1 = this.tintTex(tex, 255 * sunDim, scg * sunDim, scb * sunDim, 'sun3');
          ctx.translate(x, yD);
          ctx.rotate(ft * 2 - 7.3);
          ctx.drawImage(p1, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
        } else {
          ctx.translate(x, yD);
          ctx.rotate(ft * 2 - 7.3);
          ctx.drawImage(tex, -tex.width / 2 * scale, -tex.height / 2 * scale, tex.width * scale, tex.height * scale);
        }
        ctx.restore();
        pass2();
        // Extra[280] 墨镜叠层(:62380-62385):Sun2 档(color=通道①,非日食恒白 →
        // color3=(255,255,255,100)),同 vector/rotation/origin/scale 再画一张
        if (flag2) {
          const e280 = this.extra280TexImg();
          if (e280) {
            ctx.save();
            ctx.globalAlpha = 100 / 255;
            ctx.translate(x, yD);
            ctx.rotate(ft * 2 - 7.3);
            ctx.drawImage(e280, -e280.width / 2 * scale, -e280.height / 2 * scale, e280.width * scale, e280.height * scale);
            ctx.restore();
          }
        }
        // DrawSun 的 flare1/flare2:贴图是满 alpha 矩形(532×215/1166×254,无软边)
        // → 直接画=方片框(用户实报)。反编译 A=0 可能非伪影而是有意屏蔽——
        // 这两张图是 LensFlare shader 的输入素材,不经 shader 处理不该直画。
        // 太阳旁的横向光效由 drawLensFlare 链的 pointblurry 元素(scale 1.0,
        // 距离 0.6)承担,该链已修好并正常工作。
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
        const y = bgTopY + dip * 250 + 180;
        const yD = y + this.moonModY;   // :62395 position = (num6, num7 + moonModY)
        const scale = 1.2 - dip * 0.4;
        const phase = Math.max(0, Math.min(7, clock.moonPhase)); // MoonPhase.cs:3-13(0=满…4=空;旧 dayCount%8 致首夜亏凸月+导入脱钩)
        // 月绘制色(:62378-62383 + SetBackColor:63354-63359):非血月恒白,
        // 血月红移;云遮蔽 ×(1-cloudAlpha·1.5·atmo)。★XNA moonColor*=num13 是
        // 全通道乘:贡献 = tex.rgb·mr·num13²(rgb 与 α 都乘)——染色值也乘 sunDim
        const moonCol: [number, number, number] = moonDrawColor(nightTime,
          !!(clock as { bloodMoon?: boolean }).bloodMoon);
        // 月色群系修正(蘑菇跨通道块 :63200-63228;★原文快照语义逐字保留)
        if (bio) applyBiomeToMoon(moonCol, bio);
        const mr = moonCol[0], mg = moonCol[1], mb = moonCol[2];
        const moonA = sunDim;
        const moonPlain = sunDim >= 0.999 && mr > 250 && mg > 250 && mb > 250;
        // ★夜月屏位登记(2026-08-20):compositeLight 在光照图注入月盘满光
        //   ——原版月亮直绘 backbuffer 不吃乘光,全屏乘光链曾把月亮压到
        //   月光地板(~0.075,"夜里的月亮不亮");月盘区乘法≈恒等即恢复原色
        //   (:62458 语义:基准 y + 帧尾衰减后 moonModY——见下方 decay 段)
        moonBase = { x, y, r: (mw / 2) * scale };
        ctx.save();
        ctx.globalAlpha = moonA;
        ctx.translate(x, yD);
        ctx.rotate(ft * 2 - 7.3);
        // 原版:竖条第 moonPhase 帧(0,MW*moonPhase,MW,MW),原点为中心;
        // 染色 = 月色×sunDim(全通道乘语义),晴夜白月直绘快速路径
        const mIm = moonPlain ? tex
          : this.tintTex(tex, mr * sunDim, mg * sunDim, mb * sunDim, `moon${this.fx.moonEventKind}`);
        ctx.drawImage(mIm, 0, mw * phase, mw, mw,
          -mw / 2 * scale, -mw / 2 * scale, mw * scale, mw * scale);
        ctx.restore();
      } else {
        this.moonScreen = null;
      }
    }
    ctx.restore();
    // sunModY/moonModY 每帧 ×0.999 衰减（Main.cs:62415-62416，short 截断——
    // 游戏内无写点恒 0 为 no-op；标题屏拖拽残留在切进世界后同式缓回 0）。
    // ★帧序对齐原版：绘制用衰减前值（:62376/:62395），LastCelestialBodyPosition
    // （:62458 = sunScreen/moonScreen 语义）用衰减后值
    this.sunModY = decayCelestialModY(this.sunModY);
    this.moonModY = decayCelestialModY(this.moonModY);
    if (sunBase) this.sunScreen = { x: sunBase.x, y: sunBase.y + this.sunModY };
    if (moonBase) this.moonScreen = { x: moonBase.x, y: moonBase.y + this.moonModY, r: moonBase.r };

    // 云：原版素材与规则（Cloud.cs / NextHorizonRenderer.DrawCloud）；
    // 塔天空激活时云量乘 GetCloudAlpha() = (1-fade)*0.3+0.7（各 Sky 同式 :116-119）
    this.towerCloudMul = this.towerCloudAlphaMul();
    this.drawVanillaClouds(ctx, viewW, viewH, isNight, dtMs, camX, camY);

    // ---- 极光（AuroraSky.cs：SkyManager maxDepth==MaxValue 层 = DrawSurfaceBG 内
    //      首个 DrawToDepth(1/0.09)，Main.cs:58829——即远距云(DrawClouds_Distant
    //      :58757)之后、云背景层之前；日月 :56310 画于其前【以反编译序为准】）----
    this.drawAurora(ctx, viewW, viewH, camY, dtMs, nightTime, isDay,
      Math.max(0, Math.min(7, clock.moonPhase ?? 0)));

    // 派对气球（PartySky 深 1.6..3.35 全 <5 = 全部背景层之前）——由 Renderer 在
    // 群系背景后调 drawPartyBalloonsNear（原版 DrawToDepth(1) 带 :59621；曾画山后）
    // 灯笼夜夜空（LanternSky：灯笼浮升层，需相机 Y 判地表门）——far 带（深度>5,
    // 远山之后）；near 带（深度≤5,山层之前）由 Renderer 在群系背景之后调
    // drawLanternsNear（原版 DrawToDepth(5) 前后带插入 :59310/:59322）
    this.drawLanterns(ctx, viewW, viewH, camX, camY, dtMs, 'far');

  }

}
