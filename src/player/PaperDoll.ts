// 纸娃娃合成：把灰度通道帧表（Player_{v}_{n}.png + Player_Hair_N.png）调色合成为一张
// 40×(20×56) 的完整帧表，缓存复用。通道映射实测自 PlayerDrawLayers.cs：
//   0 头/3,5,7,9 身体/10 腿 = skinColor；4,8 = undershirt；6,13,14 = shirt；
//   11 = pants；12 = shoes；1 = 眼白(白)；2 = 瞳孔(eyeColor)；发型表 14 帧对齐身体帧 6-19。
import { type Appearance, backHairDraw, MALE_VARIANTS } from './Appearance';
import { UITextures } from '../vui/assets/UITextures';
import { noteVuiConsumer } from '../assets/SpriteAtlas';

export const BODY_FRAMES = 20;     // 身体帧数
export const FRAME_W = 40;
export const FRAME_H = 56;
export const HAIR_FRAMES = 14;     // 发型表帧数（对齐身体帧 6..19）

/** 通道索引 → 外观颜色字段（竖条 20 帧布局：头/眼/腿/裤/鞋） */
const VERTICAL_CHANNELS: Array<{ sheet: number; color: keyof Appearance | 'white' }> = [
  { sheet: 10, color: 'skinColor' },   // 腿皮肤
  { sheet: 11, color: 'pantsColor' },
  { sheet: 12, color: 'shoeColor' },
  { sheet: 0, color: 'skinColor' },    // 头
  { sheet: 1, color: 'white' },        // 眼白
  { sheet: 2, color: 'eyeColor' },     // 瞳
];

/**
 * 复合帧网格映射（1.4.5.6 PlayerDrawSet.CreateCompositeData：躯干/手臂/肩为 9列×4行 网格，
 * CreateCompositeFrameRect = x*40 + y*56；男用 0-1 行，女 +2 行）。
 * ★ 臂部像素偏移勘误(2026-08-10,用户报"部件不够贴合"):原版 GetCompositeOffset
 * (:4189-4197 的后臂 +6/+2、前臂 -5/0)是 DrawData 的 position 与 origin **共用**偏移——
 * 两者相消,所有复合部件左上角一律对齐躯干锚点(headgear 微偏除外),偏移量只作旋转轴心
 * (将来做 use 手臂旋转时 pivot = bodyVect(20,28)+偏移)。此前误当烘焙位移,导致后臂整体
 * 偏右下 (6,2)、前臂偏左 (5,0)——已归零对齐。
 * 前臂帧表 frameIndex2（按 bodyFrame 行 0..19）：
 *   0→(2,0) 1→(3,0) 2→(4,0) 3→(5,0) 4→(6,0) 5→(2,1) 6→(3,1)
 *   7-10→(4,1) 11-13→(3,1) 14→(5,1) 15,16→(6,1) 17→(5,1) 18,19→(3,1)
 * 后臂 = 前臂 Y+2；躯干 (0,0)（行5=跳跃 (1,0)）；后肩 (1,1)；前肩 (0,1)。
 */
const ARM_FRAME: ReadonlyArray<readonly [number, number]> = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 1], [3, 1],
  [4, 1], [4, 1], [4, 1], [4, 1], [3, 1], [3, 1], [3, 1],
  [5, 1], [6, 1], [6, 1], [5, 1], [3, 1], [3, 1],
];

/** GetHairSettings（1456 Player.cs:16645-16760，switch(head) 精确提取）：
 *  fullHair 头盔露出完整发型 / hatHair 露出特制帽子发型(Player_HairAlt) / 其余完全隐藏 */
const FULL_HAIR_HEADS = new Set([10, 12, 28, 42, 62, 97, 106, 113, 116, 119, 133, 138, 139, 163, 178, 181, 191, 198, 217, 218, 220, 222, 224, 225, 228, 229, 230, 232, 235, 238, 242, 243, 244, 245, 272, 273, 274, 277, 284, 290]);
const HAT_HAIR_HEADS = new Set([13, 14, 15, 16, 18, 21, 24, 25, 26, 29, 40, 44, 51, 56, 59, 60, 63, 64, 65, 67, 68, 69, 81, 92, 94, 95, 100, 114, 121, 126, 130, 136, 140, 143, 145, 158, 159, 161, 182, 184, 190, 195, 215, 216, 219, 223, 226, 227, 231, 233, 234, 262, 263, 264, 265, 267, 275, 279, 280, 281, 286, 289, 292]);

/** 发型层信息（发色剂渲染拆层用）：mode=隐藏时 null */
export interface DollHairLayer {
  mode: 'full' | 'alt';
  /** 贴图名（Player_Hair_N / Player_HairAlt_N） */
  src: string;
  /** 后发层（backHairDraw :16771）——true 时全帧高先画、前发层只画顶部 26px */
  back: boolean;
}

/** 头盔下的发型档（GetHairSettings；compositePaperDoll 与发色剂叠层共用同一判定） */
export function dollHairLayer(a: Appearance, headIdx: number): DollHairLayer | null {
  const mode = headIdx === 0 || FULL_HAIR_HEADS.has(headIdx) ? 'full' as const
    : HAT_HAIR_HEADS.has(headIdx) ? 'alt' as const : null;
  if (!mode) return null;
  return {
    mode,
    src: mode === 'alt' ? `Player_HairAlt_${a.hair + 1}.png` : `Player_Hair_${a.hair + 1}.png`,
    back: backHairDraw(a.hair),
  };
}

/** 发色剂逐帧着色头发帧（40×56，动态染料每帧变色——不进 tintCache 防爆缓存）。
 *  复用 tint() 的 multiply+destination-in 模式，输出为共享 scratch（当帧即用勿存） */
export function hairFrameTinted(layer: DollHairLayer, row: number, color: { r: number; g: number; b: number }): HTMLCanvasElement | null {
  const rect = UITextures.get(layer.src);
  if (!rect) return null;
  const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
  const img = rect.img as HTMLImageElement;
  const sc = hairScratch ??= document.createElement('canvas');
  if (sc.width !== FRAME_W || sc.height !== FRAME_H) { sc.width = FRAME_W; sc.height = FRAME_H; }
  const sctx = sc.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;
  sctx.clearRect(0, 0, FRAME_W, FRAME_H);
  sctx.drawImage(img, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'multiply';
  sctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  sctx.fillRect(0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(img, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
  sctx.globalCompositeOperation = 'source-over';
  return sc;
}

/** 发色剂 scratch（每帧重画，contextlost 后内容自动补齐——勿缓存其结果） */
let hairScratch: HTMLCanvasElement | null = null;

/** 头甲贴图（Armor_Head_N.png；发色剂叠层时画在发层之后，与 composite 内层序一致） */
export function headArmorImage(headIdx: number): ImageBitmap | HTMLImageElement | null {
  if (!headIdx) return null;
  const r = UITextures.get(`Armor_Head_${headIdx}.png`);
  return r ? (r.img as HTMLImageElement) : null;
}

const cache = new Map<string, HTMLCanvasElement>();
/** 调色缓存上限(2026-08-13 泄露 review):键=贴图×外观色(用户可控,键空间近无限),
 *  值=整图尺寸 canvas——无闸时长会话/选人界面拖色条无界增长(同文件 cache 有
 *  LRU 64 而此表漏配)。超限整体清空(值小,重建廉价) */
const TINT_CACHE_MAX = 256;
const tintCache = new Map<string, HTMLCanvasElement>();
/** WeakMap(2026-08-13):外层原为强引用 Map——会把已被 cache LRU 淘汰的合成
 *  canvas 钉住永不释放;改弱引用后源 canvas 回收时条目随之消失 */
const stealthTintCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/** 清空全部合成/调色缓存。
 *  缓存 canvas 在 GPU contextlost 后内容归零且不会自动重画——不失效就
 *  "角色/装备/时装全部隐形"(选人界面与游戏内 alike)。退出世界与进世界时调用。 */
export function clearPaperDollCache(): void {
  for (const c of cache.values()) { c.width = 0; c.height = 0; }
  for (const c of tintCache.values()) { c.width = 0; c.height = 0; }
  cache.clear();
  tintCache.clear();
}

function colorKey(color: { r: number; g: number; b: number }): string {
  return `${color.r},${color.g},${color.b}`;
}

/** 灰度图调色：multiply 铺色 + destination-in 用原 alpha 裁回 */
/** 贴图实例稳定 id(ImageBitmap 化后无 .src 可拼键——用 WeakMap 自增 id 防跨表碰撞) */
const tintImgId = new WeakMap<object, number>();
let tintImgSeq = 0;
function tint(img: CanvasImageSource & { width: number; height: number }, color: { r: number; g: number; b: number }): HTMLCanvasElement {
  let id = tintImgId.get(img as object);
  if (id === undefined) { id = ++tintImgSeq; tintImgId.set(img as object, id); }
  const key = `t${id}|` + colorKey(color);
  let c = tintCache.get(key);
  if (c) return c;
  if (tintCache.size >= TINT_CACHE_MAX) {  // 满即清(防无界)
    for (const old of tintCache.values()) { old.width = 0; old.height = 0; }
    tintCache.clear();
  }
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  tintCache.set(key, c);
  return c;
}

function appearanceKey(a: Appearance): string {
  return [
    a.skinVariant, a.hair,
    colorKey(a.skinColor), colorKey(a.undershirtColor), colorKey(a.pantsColor),
    colorKey(a.shoeColor), colorKey(a.shirtColor), colorKey(a.eyeColor), colorKey(a.hairColor),
  ].join('|');
}

function sheetRect(variant: number, sheet: number): ImageBitmap | HTMLImageElement | null {
  // 女性变体缺的通道回退男体（文件分布：Player_1_ 仅有 4,6,8,11,12,13）
  // 消费点埋点:回退 miss 时 vui 失配报告能给出"谁在查"
  noteVuiConsumer(`PaperDoll.sheetRect(v${variant},s${sheet})`);
  const r = UITextures.get(`Player_${variant}_${sheet}.png`) ?? UITextures.get(`Player_0_${sheet}.png`);
  return r ? (r.img as HTMLImageElement) : null;
}

/** 合成完整帧表（含发型+装备）。equip 为原版物品 id（Armor_Head_/Armor_Legs_/Armor_Armor_ 贴图索引）。
 *  opts.skipHair = 发色剂激活时拆层：头发与头甲都不进烘焙（调用方 hairFrameTinted/
 *  headArmorImage 按 后发→本体→前发→头甲 层序叠画——动态染料逐帧变色，烘焙缓存无法承载）
 *  opts.layer = stealth 视觉分层（PlayerDrawSet.cs:1523-1660）：'skin' = 皮肤/发/衣着
 *   （×s'² 消费）；'armor' = 三件甲贴图（×s' 消费，3106/蘑菇矿 B 分量 ×settled；
 *   'armorNoHead' 发色剂激活时头甲归叠层路径）。原版腿甲/身甲整体替代对应皮肤衣着
 *   （DrawPlayer_02/13 else-if 链）→ skin 层在有甲的槽位同样留空（甲覆盖语义一致） */
export type DollLayer = 'skin' | 'armor' | 'armorNoHead';
export function compositePaperDoll(
  a: Appearance,
  equip?: { head?: number | null; body?: number | null; legs?: number | null },
  opts?: { skipHair?: boolean; layer?: DollLayer },
): HTMLCanvasElement | null {
  const key = appearanceKey(a) + (equip ? `|e${equip.head ?? 0},${equip.body ?? 0},${equip.legs ?? 0}` : '')
    + (opts?.skipHair ? '|nohair' : '') + (opts?.layer ? `|L${opts.layer}` : '');
  const hit = cache.get(key);
  if (hit) return hit;

  // 发型模式（GetHairSettings）：无头盔=完整；fullHair 头盔=完整；hatHair=帽子发型；其余=隐藏
  const headIdx = equip?.head ?? 0;
  const hairLayer = opts?.skipHair ? null : dollHairLayer(a, headIdx);
  const hairMode: 'full' | 'alt' | 'none' = !hairLayer ? 'none' : hairLayer.mode;
  const hairSrc = hairLayer ? hairLayer.src : '';

  // ---- 懒加载就绪预检(vanilla-ui 按需加载后必需):任一必需贴图未就绪 → 返回 null
  // 且【不缓存】(查询本身触发后台加载,消费方下帧重试)。否则首帧的空纸娃娃会被
  // 永久缓存——角色选择界面人物贴图就再也出不来了
  const needSheets = new Set<number>([...VERTICAL_CHANNELS.map((ch) => ch.sheet), 3, 4, 5, 6, 7, 8, 13]);
  for (const s of needSheets) {
    if (!sheetRect(a.skinVariant, s)) return null;
  }
  if (hairMode !== 'none' && !UITextures.get(hairSrc)) return null;
  if (equip?.legs && !UITextures.get(`Armor_Legs_${equip.legs}.png`)) return null;
  if (equip?.body && !UITextures.get(`Armor_Armor_${equip.body}.png`)) return null;
  if (equip?.head && !UITextures.get(`Armor_Head_${equip.head}.png`)) return null;

  const c = document.createElement('canvas');
  c.width = FRAME_W;
  c.height = BODY_FRAMES * FRAME_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const hasBackHair = hairMode !== 'none' && backHairDraw(a.hair);
  const hairRect = hairMode !== 'none' ? UITextures.get(hairSrc) : null;
  const hairTinted = hairRect ? tint(hairRect.img as HTMLImageElement, a.hairColor) : null;
  const onlyArmor = opts?.layer === 'armor' || opts?.layer === 'armorNoHead';
  const noArmor = opts?.layer === 'skin';
  // 后发层（1.4.4+ PlayerDrawLayers:206-212：backHairDraw 时画在身体之后，即先画）
  if (!onlyArmor && hairTinted && hasBackHair) {
    for (let row = 0; row < BODY_FRAMES; row++) {
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 竖条通道（腿/裤/鞋/头/眼：20 帧直排） ----
  const legsArmor = equip?.legs ? UITextures.get(`Armor_Legs_${equip.legs}.png`) : null;
  for (const ch of onlyArmor ? [] : VERTICAL_CHANNELS) {
    if (legsArmor && (ch.sheet === 10 || ch.sheet === 11 || ch.sheet === 12)) continue; // 腿甲整体替代腿皮肤/裤/鞋（DrawPlayer_02 else-if）
    const img = sheetRect(a.skinVariant, ch.sheet);
    if (!img) continue;
    const color = ch.color === 'white' ? { r: 255, g: 255, b: 255 } : (a[ch.color] as { r: number; g: number; b: number });
    const tinted = tint(img, color);
    for (let row = 0; row < BODY_FRAMES; row++) {
      ctx.drawImage(tinted, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }
  // 腿甲（竖条 20 帧，Armor_Legs_{id} 替代 pants+shoes）
  if (legsArmor && !noArmor) {
    for (let row = 0; row < BODY_FRAMES; row++) {
      ctx.drawImage(legsArmor.img, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 复合网格通道（躯干/手臂/肩：9×4 网格，按 CreateCompositeData 逐行映射） ----
  const female = !MALE_VARIANTS.includes(a.skinVariant);
  const dy = female ? 2 : 0;
  const under = a.undershirtColor, shirt = a.shirtColor;
  // 身甲（Armor/Armor_{id} 复合网格，与玩家复合通道同构；有身甲时替代全部衣着层）
  const bodyArmor = equip?.body ? UITextures.get(`Armor_Armor_${equip.body}.png`) : null;
  const bodyArmorImg = bodyArmor ? (bodyArmor.img as HTMLImageElement) : null;
  const gridRect = (sheet: number, x: number, y: number, color: { r: number; g: number; b: number }) => {
    return { sheet, x, y, color };
  };
  for (let row = 0; row < BODY_FRAMES; row++) {
    if (onlyArmor && !bodyArmorImg) continue;    // armor 层无身甲槽则该层为空
    if (noArmor && bodyArmorImg) continue;       // skin 层身甲槽留空（甲覆盖语义）
    const torsoX = row === 5 ? 1 : 0;
    const arm = ARM_FRAME[row];
    const drawTinted = (img: ImageBitmap | HTMLImageElement, x: number, y: number, color: { r: number; g: number; b: number }) => {
      // 全部部件左上角对齐帧锚点(原版 position-origin 相消;臂偏移仅是旋转 pivot,见文件头)
      ctx.drawImage(tint(img, color), x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
        0, row * FRAME_H, FRAME_W, FRAME_H);
    };
    const drawArmorCell = (img: ImageBitmap | HTMLImageElement, x: number, y: number) => {
      ctx.drawImage(img, x * FRAME_W, y * FRAME_H, FRAME_W, FRAME_H,
        0, row * FRAME_H, FRAME_W, FRAME_H);
    };
    if (bodyArmorImg) {
      // 身甲复合绘制（PlayerDrawLayers:1345-1366 同构）：后肩→后臂→躯干→前肩→前臂，不再画衣着层
      drawArmorCell(bodyArmorImg, 1, 1 + dy);                          // 后肩
      drawArmorCell(bodyArmorImg, arm[0], arm[1] + 2);                 // 后臂
      drawArmorCell(bodyArmorImg, torsoX, dy);                         // 躯干
      drawArmorCell(bodyArmorImg, 0, 1 + dy);                          // 前肩
      drawArmorCell(bodyArmorImg, arm[0], arm[1]);                     // 前臂
      continue;
    }
    // 无盔甲复合绘制（DrawPlayer_12_SkinComposite_BackArmShirt :1385-1403 /
    // DrawPlayer_28_ArmOverItemComposite :3796-3803）：
    //   后臂层序 = 皮肤7→皮肤5→底衫8→衬衫13（:1385-1403）；
    //   前臂层序 = 皮肤7→底衫8→衬衫13→衬衫6（:3796-3803,第4层是 6 不是 5）；
    //   肩/躯干按层序:底衫4(后肩→躯干→前肩) → 衬衫6(同序)——对应原版 13/14 两个 pass
    const draws = [
      { d: gridRect(3, torsoX, dy, a.skinColor) },                              // 躯干皮肤(:1280)
      { d: gridRect(7, arm[0], arm[1] + 2, a.skinColor) },                      // 后臂皮肤 A
      { d: gridRect(5, arm[0], arm[1] + 2, a.skinColor) },                      // 后臂皮肤 B
      { d: gridRect(8, arm[0], arm[1] + 2, under) },                            // 后臂底衫
      { d: gridRect(13, arm[0], arm[1] + 2, shirt) },                           // 后臂衬衫
      { d: gridRect(4, 1, 1 + dy, under) },                                     // 后肩·底衫
      { d: gridRect(4, torsoX, dy, under) },                                    // 躯干·底衫
      { d: gridRect(4, 0, 1 + dy, under) },                                     // 前肩·底衫
      { d: gridRect(6, 1, 1 + dy, shirt) },                                     // 后肩·衬衫
      { d: gridRect(6, torsoX, dy, shirt) },                                    // 躯干·衬衫
      { d: gridRect(6, 0, 1 + dy, shirt) },                                     // 前肩·衬衫
      { d: gridRect(7, arm[0], arm[1], a.skinColor) },                          // 前臂皮肤
      { d: gridRect(8, arm[0], arm[1], under) },                                // 前臂底衫
      { d: gridRect(13, arm[0], arm[1], shirt) },                               // 前臂衬衫
      { d: gridRect(6, arm[0], arm[1], shirt) },                                // 前臂衬衫 B(:3803)
    ];
    for (const { d } of draws) {
      const img = sheetRect(a.skinVariant, d.sheet);
      if (!img) continue;
      drawTinted(img, d.x, d.y, d.color);
    }
  }

  // 前发层（1.4.4+ PlayerDrawSet:1751-1753：backHairDraw 时裁 26px 高，与后发层分离）
  if (!onlyArmor && hairTinted) {
    const frontH = hasBackHair ? 26 : FRAME_H;
    for (let row = 0; row < BODY_FRAMES; row++) {
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, frontH, 0, row * FRAME_H, FRAME_W, frontH);
    }
  }

  // 头甲（Armor_Head_{id} 竖条 20 帧，画在头发之后——头盔覆盖发型）。
  // skipHair 时一并让出（发色剂叠层路径由调用方在发层之后补画，保层序）
  if (equip?.head && !opts?.skipHair && !noArmor && opts?.layer !== 'armorNoHead') {
    const headArmor = UITextures.get(`Armor_Head_${equip.head}.png`);
    if (headArmor) {
      for (let row = 0; row < BODY_FRAMES; row++) {
        ctx.drawImage(headArmor.img, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
      }
    }
  }

  cache.set(key, c);
  if (cache.size > 64) {
    // 简单淘汰：清一半最旧条目
    let i = 0;
    for (const k of cache.keys()) {
      if (i++ > 32) break;
      cache.delete(k);
    }
  }
  return c;
}

/** 取某一帧的绘制参数（供 UISpriteBatch.draw 直接使用） */
export function dollFrame(doll: HTMLCanvasElement, frame: number): { img: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } {
  const idx = Math.max(0, Math.min(BODY_FRAMES - 1, frame));
  return { img: doll, sx: 0, sy: idx * FRAME_H, sw: FRAME_W, sh: FRAME_H };
}

/** 行走动画帧号（UICharacter.UpdateAnim：(time/0.07 % 14 + 6)） */
export function walkFrame(timeSec: number): number {
  return (Math.floor(timeSec / 0.07) % 14 + 6);
}

/** 站立帧 */
export const IDLE_FRAME = 0;

/** 逐通道 RGB 缩调（stealth 分层消费：armor ×s'/B×settled、星璇 Lerp 通道）。
 *  multiply 铺 rgb(255·m) 逐通道乘 + destination-in 保原 alpha；mul 量化 1/128 防缓存爆 */
export function tintRGBA(src: HTMLCanvasElement, mul: [number, number, number]): HTMLCanvasElement {
  const q = mul.map((m) => Math.round(m * 128) / 128);
  const key = `${q[0]},${q[1]},${q[2]}`;
  let inner = stealthTintCache.get(src);
  if (!inner) { inner = new Map(); stealthTintCache.set(src, inner); }
  const hit = inner.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${Math.round(q[0] * 255)},${Math.round(q[1] * 255)},${Math.round(q[2] * 255)})`;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  inner.set(key, c);
  if (inner.size > 48) {   // 量化档 ≤129；stealth 连续变化时留中段档位
    let i = 0;
    for (const k of inner.keys()) { if (i++ > 24) break; inner.delete(k); }
  }
  return c;
}
