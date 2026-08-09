// 纸娃娃合成：把灰度通道帧表（Player_{v}_{n}.png + Player_Hair_N.png）调色合成为一张
// 40×(20×56) 的完整帧表，缓存复用。通道映射实测自 PlayerDrawLayers.cs：
//   0 头/3,5,7,9 身体/10 腿 = skinColor；4,8 = undershirt；6,13,14 = shirt；
//   11 = pants；12 = shoes；1 = 眼白(白)；2 = 瞳孔(eyeColor)；发型表 14 帧对齐身体帧 6-19。
import { type Appearance, backHairDraw, MALE_VARIANTS } from './Appearance';
import { UITextures } from '../vui/assets/UITextures';

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

const cache = new Map<string, HTMLCanvasElement>();
const tintCache = new Map<string, HTMLCanvasElement>();

function colorKey(color: { r: number; g: number; b: number }): string {
  return `${color.r},${color.g},${color.b}`;
}

/** 灰度图调色：multiply 铺色 + destination-in 用原 alpha 裁回 */
function tint(img: HTMLImageElement, color: { r: number; g: number; b: number }): HTMLCanvasElement {
  const key = (img.src as string) + '|' + colorKey(color);
  let c = tintCache.get(key);
  if (c) return c;
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

function sheetRect(variant: number, sheet: number): HTMLImageElement | null {
  // 女性变体缺的通道回退男体（文件分布：Player_1_ 仅有 4,6,8,11,12,13）
  const r = UITextures.get(`Player_${variant}_${sheet}.png`) ?? UITextures.get(`Player_0_${sheet}.png`);
  return r ? (r.img as HTMLImageElement) : null;
}

/** 合成完整帧表（含发型）。失败（素材缺失）返回 null */
export function compositePaperDoll(a: Appearance): HTMLCanvasElement | null {
  const key = appearanceKey(a);
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement('canvas');
  c.width = FRAME_W;
  c.height = BODY_FRAMES * FRAME_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // 后发层（1.4.4+ PlayerDrawLayers:206-212：backHairDraw 时画在身体之后，即先画）
  const hasBackHair = backHairDraw(a.hair);
  const hairRect = UITextures.get(`Player_Hair_${a.hair + 1}.png`);
  const hairTinted = hairRect ? tint(hairRect.img as HTMLImageElement, a.hairColor) : null;
  if (hairTinted && hasBackHair) {
    for (let row = 0; row < BODY_FRAMES; row++) {
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 竖条通道（腿/裤/鞋/头/眼：20 帧直排） ----
  for (const ch of VERTICAL_CHANNELS) {
    const img = sheetRect(a.skinVariant, ch.sheet);
    if (!img) continue;
    const color = ch.color === 'white' ? { r: 255, g: 255, b: 255 } : (a[ch.color] as { r: number; g: number; b: number });
    const tinted = tint(img, color);
    for (let row = 0; row < BODY_FRAMES; row++) {
      ctx.drawImage(tinted, 0, row * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // ---- 复合网格通道（躯干/手臂/肩：9×4 网格，按 CreateCompositeData 逐行映射） ----
  const female = !MALE_VARIANTS.includes(a.skinVariant);
  const dy = female ? 2 : 0;
  const under = a.undershirtColor, shirt = a.shirtColor;
  const gridRect = (sheet: number, x: number, y: number, color: { r: number; g: number; b: number }) => {
    return { sheet, x, y, color };
  };
  for (let row = 0; row < BODY_FRAMES; row++) {
    const torsoX = row === 5 ? 1 : 0;
    const arm = ARM_FRAME[row];
    // 无盔甲复合绘制顺序（PlayerDrawLayers:1374-1398 后臂 / 前臂同构）：
    // 皮肤臂(7,5) → 底衫臂(8) → 衬衫臂(13)；肩/躯干为 4/6 双层
    const draws = [
      gridRect(3, torsoX, dy, a.skinColor),                                  // 躯干皮肤
      gridRect(7, arm[0], arm[1] + 2, a.skinColor),                          // 后臂皮肤 A
      gridRect(5, arm[0], arm[1] + 2, a.skinColor),                          // 后臂皮肤 B
      gridRect(8, arm[0], arm[1] + 2, under), gridRect(13, arm[0], arm[1] + 2, shirt), // 后臂衣着
      gridRect(4, 1, 1 + dy, under), gridRect(6, 1, 1 + dy, shirt),          // 后肩
      gridRect(4, torsoX, dy, under), gridRect(6, torsoX, dy, shirt),        // 躯干
      gridRect(4, 0, 1 + dy, under), gridRect(6, 0, 1 + dy, shirt),          // 前肩
      gridRect(7, arm[0], arm[1], a.skinColor),                              // 前臂皮肤 A
      gridRect(5, arm[0], arm[1], a.skinColor),                              // 前臂皮肤 B
      gridRect(8, arm[0], arm[1], under), gridRect(13, arm[0], arm[1], shirt), // 前臂衣着
    ];
    for (const d of draws) {
      const img = sheetRect(a.skinVariant, d.sheet);
      if (!img) continue;
      const tinted = tint(img, d.color);
      ctx.drawImage(tinted, d.x * FRAME_W, d.y * FRAME_H, FRAME_W, FRAME_H, 0, row * FRAME_H, FRAME_W, FRAME_H);
    }
  }

  // 前发层（1.4.4+ PlayerDrawSet:1751-1753：backHairDraw 时裁 26px 高，与后发层分离）
  if (hairTinted) {
    const frontH = hasBackHair ? 26 : FRAME_H;
    for (let row = 0; row < BODY_FRAMES; row++) {
      const hr = Math.max(0, Math.min(HAIR_FRAMES - 1, row - 6));
      ctx.drawImage(hairTinted, 0, hr * FRAME_H, FRAME_W, frontH, 0, row * FRAME_H, FRAME_W, frontH);
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
