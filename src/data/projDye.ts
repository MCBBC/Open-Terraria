// 弹幕染料四通道单源（清偿刀 N 2026-09-30）——cPet/cLight/cGrapple/cMinion。
// 原版锚（Terarria1457 为唯一标杆）：
//   · Main.GetProjectileDesiredShader（Main.cs:22428-22470）——优先序（后写胜）：
//       ① proj.minion && owner!=255 → cMinion
//       ② projHook[type]（=aiStyle==7 动态派生,Main.cs:6755-6763）→ cGrapple
//       ③ projPet[type] && !minion && owner!=255 && damage==0 && !LightPet[type] → cPet
//       ④ !minion && owner!=255 && damage==0 && LightPet[type] → cLight
//       ⑤ switch(type)：623/1020/1105 → cPet；818 → cMinion（仅 owner!=255,无
//          damage/minion 门——1105 是宠物、818 是扑击弹,均无条件覆写）
//   · Player.UpdateDyes（Player.cs:9667-9692）逐槽亲读定谳：cPet=miscDyes[0] /
//     cLight=miscDyes[1] / cMinecart=miscDyes[2] / cMount=miscDyes[3] / cGrapple=
//     miscDyes[4]（F 刀简报里「cMinion=miscDyes[1]」的存疑映射系误——cMinion 不在
//     miscDyes 槽,唯一源见下条）。
//   · cMinion 唯一来源 = UpdateItemDye（Player.cs:9832-9834）：护甲/时装槽装有
//     4762 CritterShampoo（accessory+vanity+hasVanityEffects,Item.cs:39177-39185）
//     时 cMinion = 配对染料槽 dye[i%10].dye（GetEffectiveDye——配饰 3-9 与时装配饰
//     13-19 同槽对,时装后扫自然胜出=原版同序）。
//   · 消费 = PrepareDrawnProjectileDrawing（Main.cs:38659-38668）→
//     PrepareDrawnEntityDrawing（shader!=0 → spriteBatch Immediate）→
//     EntitySpriteDraw（Main.cs:38695-38705）逐贴图 GameShaders.Armor.Apply——
//     整弹批（尾迹+本体+覆绘）同染。本仓等价 = 逐贴图 SM2 pass
//     （vanillaDyes.applyDyePass,63 pass 字节码 1:1）；光乘 = compositeLight 全屏
//     （染面在弹幕绘制层=全屏乘光【之前】,「白烘×染后光乘」可交换域——与尘/坐骑焰
//     染料同层同语义,V0_MID_PASSES 头注同账）。
//   · 主表：projPet 全表 125 项（Main.cs:8867-8989 逐行照录）、LightPet 12 项
//     （ProjectileID.cs:389 Factory.CreateBoolSet）。
import { dyeApplyOf, applyDyePass, type DyeApply } from './vanillaDyes';
import { globalTimeWrappedHourly } from '../core/GameTime';
import { ITEM_DEFS } from './items';

// ===================== 主表（反编译照录） =====================

/** Main.projPet（Main.cs:8867-8989 全表 125 项） */
export const PROJ_PET: ReadonlySet<number> = new Set([
  492, 499, 653, 701, 703, 702, 764, 765, 319, 334, 324, 266, 313, 314, 317, 175,
  111, 112, 127, 191, 192, 193, 194, 197, 198, 199, 200, 208, 209, 210, 211, 236,
  268, 269, 353, 373, 375, 380, 387, 388, 390, 391, 392, 393, 394, 395, 1093,
  1094, 1112, 1113, 1118, 1119, 398, 407, 423, 533, 613, 623, 625, 626, 627, 628,
  755, 758, 759, 774, 815, 816, 817, 821, 825, 831, 833, 834, 835, 854, 858, 859,
  860, 864, 875, 946, 951, 963, 970, 1022, 881, 882, 883, 884, 885, 886, 887,
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898, 899, 900, 901, 934,
  956, 957, 958, 959, 960, 994, 998, 1003, 1004, 1018, 1056, 1090, 1027, 1046,
  1050, 1095, 1096,
]);

/** ProjectileID.Sets.LightPet（ProjectileID.cs:389） */
export const PROJ_LIGHT_PET: ReadonlySet<number> = new Set([
  18, 500, 72, 87, 86, 211, 492, 650, 702, 891, 896, 895,
]);

/** ItemID.CritterShampoo（ItemID.cs:11070）——cMinion 唯一源配饰 */
export const CRITTER_SHAMPOO = 4762;

// ===================== 通道解析（Player.UpdateDyes 1:1） =====================

/** Inventory 消费窄接口（InvItem 只读 {id} 面——测试可喂 fixture） */
export interface DyeInvSource {
  miscDyes: Array<{ id: number } | null>;
  armor: Array<{ id: number } | null>;
  isItemSlotUnlockedAndUsable(i: number): boolean;
  getEffectiveDye(slot: number): { id: number } | null;
}

export interface DyeChannels {
  cPet: number;
  cLight: number;
  cGrapple: number;
  cMinion: number;
}

const vidOf = (it: { id: number } | null | undefined): number =>
  it ? (ITEM_DEFS[it.id]?.vid ?? -1) : -1;

/**
 * Player.UpdateDyes（Player.cs:9667-9692）等价——四通道染料 vid（0=无）。
 * miscDyes 逐槽直读（杂项槽无 IsItemSlotUnlockedAndUsable 门=原版同相）；
 * cMinion=CritterShampoo 链（armor[0..19] 扫描,IsItemSlotUnlockedAndUsable 门 +
 * 配对染料槽 getEffectiveDye(i%10)——LoadoutShare 语义由 Inventory.getEffectiveDye
 * 承载,wingDyeVid 同款）。返回值直接可喂 dyeApplyOf（-1/0 同作无染）。
 */
export function dyeChannelsOf(inv: DyeInvSource): DyeChannels {
  const ch: DyeChannels = { cPet: 0, cLight: 0, cGrapple: 0, cMinion: 0 };
  const m0 = inv.miscDyes[0], m1 = inv.miscDyes[1], m4 = inv.miscDyes[4];
  if (m0) ch.cPet = vidOf(m0);
  if (m1) ch.cLight = vidOf(m1);
  if (m4) ch.cGrapple = vidOf(m4);
  for (let i = 0; i < 20; i++) {
    if (!inv.isItemSlotUnlockedAndUsable(i)) continue;
    if (vidOf(inv.armor[i]) === CRITTER_SHAMPOO) {
      const dye = inv.getEffectiveDye(i % 10);
      if (dye) ch.cMinion = vidOf(dye);
    }
  }
  return ch;
}

/**
 * Main.GetProjectileDesiredShader（Main.cs:22428-22470）1:1——返回染料 vid。
 * owner!=255 门由调用方承载（本仓弹幕属主恒真实玩家；傀儡 miscDyes 未同步=通道
 * 全 0=无染,登记 MP 边界债）。q.aiStyle 缺省 -1（不命中 projHook）。
 */
export function getProjDesiredDyeVid(
  q: { vid: number; minion: boolean; damage: number; aiStyle?: number },
  ch: DyeChannels,
): number {
  let result = 0;
  if (q.minion) result = ch.cMinion;
  if (q.aiStyle === 7) result = ch.cGrapple;
  if (PROJ_PET.has(q.vid) && !q.minion && q.damage === 0 && !PROJ_LIGHT_PET.has(q.vid)) {
    result = ch.cPet;
  }
  if (!q.minion && q.damage === 0 && PROJ_LIGHT_PET.has(q.vid)) {
    result = ch.cLight;
  }
  switch (q.vid) {
    case 623:
    case 1020:
    case 1105:
      result = ch.cPet;
      break;
    case 818:
      result = ch.cMinion;
      break;
  }
  return result;
}

// ===================== 贴图染色（EntitySpriteDraw×Armor.Apply 等价） =====================

/** 静态技术集（无 uTime/uLight 依赖——烘焙缓存恒有效；dustDyeCache 同判据放宽） */
const STATIC_TECHS: ReadonlySet<string> = new Set([
  'ArmorColored', 'ArmorColoredDefault', 'ArmorColoredAndBlack',
  'ArmorColoredAndSilverTrim', 'ArmorBrightnessColored',
]);

type Tex = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

interface BakeCacheEntry { canvas: HTMLCanvasElement; at: number }
const bakeCache = new Map<string, BakeCacheEntry>();
let bakePruneAt = 0;
const BAKE_CAP = 64;
const BUCKET_MS = 200;                       // 动态族刷新拍（wingTexSource 同档）

function cacheGet(key: string, isStatic: boolean): HTMLCanvasElement | null {
  const e = bakeCache.get(key);
  if (e) return e.canvas;
  if (!isStatic) return null;
  // 静态族缓存未命中 → 走正常烘焙后入缓存（此处仅 prune）
  return null;
}

function cachePut(key: string, canvas: HTMLCanvasElement, isStatic: boolean): void {
  if (!isStatic) return;                     // 动态族不入缓存（逐帧新算,小贴图开销可忽略）
  const now = performance.now();
  if (now - bakePruneAt > 2000) {
    bakePruneAt = now;
    while (bakeCache.size >= BAKE_CAP) {
      const k0 = bakeCache.keys().next().value as string;
      bakeCache.delete(k0);
    }
  }
  bakeCache.set(key, { canvas, at: now });
}

/** 反射族光照探针（ReflectiveArmorShaderData.Apply 的 4 点格光梯度——
 *  Renderer.reflectiveLightSource 同式；无光照引擎回退 [0,0,0,0]） */
export interface DyeTexOpts {
  facing?: number;
  lightAt?: ((tx: number, ty: number) => readonly [number, number, number]) | null;
  box?: { x: number; y: number; w: number; h: number };
  /** uSourceRect/uImageSize0 覆写（uSourceRect=原版=【绘制源矩形】、uImageSize0=
   *  【整贴图】尺寸——帧画布（projFrameImg 裁切产物）过染时传原片内矩形,渐变族
   *  T0 坐标才与 vanilla 同源;缺省=img 自身矩形（整图语义） */
  t0Rect?: { sx: number; sy: number; sheetW: number; sheetH: number };
}

function reflectiveLightSource(o: DyeTexOpts): [number, number, number, number] {
  const la = o.lightAt;
  const b = o.box;
  if (!la || !b) return [0, 0, 0, 0];
  const vx = b.x + b.w * 0.1, vy = b.y + b.h * 0.1;
  const w = b.w * 0.8, h = b.h * 0.8;
  const sub = (x: number, y: number): number => {
    const c = la(Math.floor(x / 16), Math.floor(y / 16));
    return (c[0] + c[1] + c[2]) / 255;
  };
  const n4 = sub(vx + w * 0.5, vy);
  const n5 = sub(vx, vy + h * 0.5);
  const n6 = sub(vx + w, vy + h * 0.5);
  const n7 = sub(vx + w * 0.5, vy + h);
  let spx = n6 - n5, spy = n7 - n4;
  const len = Math.hypot(spx, spy);
  if (len > 1) { spx /= len; spy /= len; }
  if ((o.facing ?? 1) === -1) spx *= -1;
  let x3 = spx * 2, y3 = (spy - 0.15) * 2, z3 = 1 - (spx * spx + spy * spy);
  const l3 = Math.hypot(x3, y3, z3) || 1;
  x3 /= l3; y3 /= l3; z3 = (z3 / l3) * 0.6;
  return [x3, y3, z3, 0];
}

/** s1 采样器装配（needsImage1：HallowBoss→Extra_156 ramp；noise 族→内建噪声——
 *  vanillaDyes.resolveDyeExtra 已在 applyDyePass 内部处理 noise 覆写,此处只补
 *  HallowBoss 的 s1）。Extra_156 懒加载（Renderer.hallowRampSampler 同源贴图）。 */
let hallowRamp: { data: Uint8ClampedArray; w: number; h: number } | null = null;
let hallowStarted = false;
function hallowSampler(): ((u: number, v: number, o4: Float64Array) => void) | null {
  if (hallowRamp) {
    const r = hallowRamp;
    return (u, v, o4) => {
      const fu = ((u % 1) + 1) % 1, fv = ((v % 1) + 1) % 1;   // LinearWrap
      const x = Math.min(r.w - 1, Math.max(0, Math.floor(fu * r.w)));
      const y = Math.min(r.h - 1, Math.max(0, Math.floor(fv * r.h)));
      const i = (y * r.w + x) * 4;
      o4[0] = r.data[i] / 255; o4[1] = r.data[i + 1] / 255;
      o4[2] = r.data[i + 2] / 255; o4[3] = r.data[i + 3] / 255;
    };
  }
  if (hallowStarted || typeof document === 'undefined') return null;
  hallowStarted = true;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        if (!cx || !cv.width || !cv.height) return;
        cx.drawImage(img, 0, 0);
        hallowRamp = { data: cx.getImageData(0, 0, cv.width, cv.height).data, w: cv.width, h: cv.height };
      } catch { /* 维持 null */ }
    };
    img.onerror = () => { hallowStarted = false; };   // 失败可重试（noiseSampler 同惯例）
    img.src = '/sprites/vanilla/Extra_156.png';
  } catch { /* 无 DOM */ }
  return null;
}

/**
 * EntitySpriteDraw×GameShaders.Armor.Apply 等价：贴图帧 (sx,sy,sw,sh) 过染料
 * pass → 染后 canvas（静态族缓存 keyed vid|rect|bucket|facing；动态族逐调新算,
 * 200ms 桶自然限频）。无染料/无字节码 pass → null（调用方回退原图直绘）。
 * t0Rect = 源矩形（渐变族 T0 坐标语义与 vanilla uSourceRect 同源）。
 */
export function dyedProjCanvas(
  img: Tex, sx: number, sy: number, sw: number, sh: number,
  dyeVid: number, opts: DyeTexOpts = {},
): HTMLCanvasElement | null {
  if (!(dyeVid > 0)) return null;
  const apply: DyeApply | null = dyeApplyOf(dyeVid);
  if (!apply) return null;
  const facing = opts.facing ?? 1;
  const isStatic = STATIC_TECHS.has(apply.tech);
  const bucket = isStatic ? 0 : Math.floor(performance.now() / BUCKET_MS);
  const t0 = opts.t0Rect;
  const key = `${dyeVid}|${sx},${sy},${sw}x${sh}|${bucket}|${facing}${t0 ? `|r${t0.sx},${t0.sy},${t0.sheetW}x${t0.sheetH}` : ''}`;
  const cached = cacheGet(key, isStatic);
  if (cached) return cached;
  if (sw < 1 || sh < 1) return null;
  const cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, sw, sh);
  const idd = cx.getImageData(0, 0, sw, sh);
  apply.uniforms.uTime = globalTimeWrappedHourly();          // ★BJ330 GTW 单源
  apply.uniforms.uDirection = facing;                        // ArmorShaderData.Apply 尾 entity.direction
  if (apply.tech === 'ArmorReflective' || apply.tech === 'ArmorReflectiveColor') {
    apply.uniforms.uLightSource = reflectiveLightSource(opts);
  }
  const extra: Array<((u: number, v: number, o4: Float64Array) => void) | undefined> = [];
  if (apply.needsImage1 && apply.tech === 'ArmorHallowBoss') {
    const hs = hallowSampler();
    if (hs) extra.push(hs);
    apply.uniforms.uImageSize1 = [256, 256];                 // Extra_156 256²（尺寸 rcp 消费面）
  }
  applyDyePass(idd.data, sw, sh, apply, extra, opts.t0Rect ?? { sx, sy, sheetW: img.width, sheetH: img.height });
  cx.putImageData(idd, 0, 0);
  cachePut(key, cv, isStatic);
  return cv;
}

/**
 * 纯色面过染料 pass（1020 DrawContinuousTrail 白带档：vanilla MagicPixel 1×1 白
 * 过 shader——同 UV 恒同输出,段间恒同色=每拍一色 1:1）。返回 [r,g,b,a]（0-255,
 * 含 pass 输出 α——ArmorColored 族输出 α=tex.a×uColor.a=255,即染后带 α 提到 255,
 * 与未染档 127 有别=原版同相）。
 */
export function dyedSolidBand(dyeVid: number, facing: number): [number, number, number, number] | null {
  if (!(dyeVid > 0)) return null;
  const apply = dyeApplyOf(dyeVid);
  if (!apply) return null;
  const isStatic = STATIC_TECHS.has(apply.tech);
  const bucket = isStatic ? 0 : Math.floor(performance.now() / BUCKET_MS);
  const key = `solid|${dyeVid}|${bucket}|${facing}`;
  const cached = cacheGet(key, isStatic);
  if (cached) {
    const d = cached.getContext('2d')!.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.clearRect(0, 0, 1, 1);
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, 1, 1);
  const idd = cx.getImageData(0, 0, 1, 1);
  apply.uniforms.uTime = globalTimeWrappedHourly();
  apply.uniforms.uDirection = facing;
  applyDyePass(idd.data, 1, 1, apply, [], { sx: 0, sy: 0, sheetW: 1, sheetH: 1 });
  cx.putImageData(idd, 0, 0);
  cachePut(key, cv, isStatic);
  const d = cx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

/** 测试/上层清缓存（桶边界漂移防伪影） */
export function clearProjDyeCaches(): void {
  bakeCache.clear();
}
