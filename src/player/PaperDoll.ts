// 纸娃娃合成：把灰度通道帧表（Player_{v}_{n}.png + Player_Hair_N.png）调色合成为一张
// 40×(20×56) 的完整帧表，缓存复用。通道映射实测自 PlayerDrawLayers.cs：
//   0 头/3,5,7,9 身体/10 腿 = skinColor；4,8 = undershirt；6,13,14 = shirt；
//   11 = pants；12 = shoes；1 = 眼白(白)；2 = 瞳孔(eyeColor)；发型表 14 帧对齐身体帧 6-19。
import { type Appearance, backHairDraw } from './Appearance';
import { UITextures } from '../vui/assets/UITextures';

export const BODY_FRAMES = 20;     // 身体帧数
export const FRAME_W = 40;
export const FRAME_H = 56;
export const HAIR_FRAMES = 14;     // 发型表帧数（对齐身体帧 6..19）

/** 通道索引 → 外观颜色字段（顺序即合成顺序：越后越上层） */
const CHANNELS: Array<{ sheet: number; color: keyof Appearance | 'white' }> = [
  { sheet: 3, color: 'skinColor' },
  { sheet: 5, color: 'skinColor' },
  { sheet: 7, color: 'skinColor' },
  { sheet: 9, color: 'skinColor' },
  { sheet: 10, color: 'skinColor' },
  { sheet: 0, color: 'skinColor' },
  { sheet: 4, color: 'undershirtColor' },
  { sheet: 8, color: 'undershirtColor' },
  { sheet: 11, color: 'pantsColor' },
  { sheet: 12, color: 'shoeColor' },
  { sheet: 6, color: 'shirtColor' },
  { sheet: 13, color: 'shirtColor' },
  { sheet: 14, color: 'shirtColor' },
  { sheet: 1, color: 'white' },
  { sheet: 2, color: 'eyeColor' },
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

  for (const ch of CHANNELS) {
    const img = sheetRect(a.skinVariant, ch.sheet);
    if (!img) continue;
    const color = ch.color === 'white' ? { r: 255, g: 255, b: 255 } : (a[ch.color] as { r: number; g: number; b: number });
    ctx.drawImage(tint(img, color), 0, 0);
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
