// 原版飘字位图字体（Combat_Text/Combat_Crit xnb → ReLogic DynamicSpriteFont,
// tools/extract-combat-font.mjs 提取;Reader 字段序反编译自本地 ReLogic.dll）。
//   字形布局（XNA SpriteFont.Draw 语义）:x += kerning.X → draw(glyph rect) →
//   x += kerning.Y + kerning.Z + spacing;行内顶部对齐。
//   5 层绘制（Main.cs DrawCombatText :61788-61841）:0-3 = ±targetScale 四向
//   偏移的暗化层（本色调暗至 ×0.3,非纯黑）,4 = 本体;锚点 = 文字盒中心
//   （origin = Measure/2）;crit 带 rotation（NewText :107 初始 ±0.12、Update
//   :178-187 漂移 ±0.001/t）。
// 第三字体 Item_Stack（= FontAssets.ItemStack,AssetInitializer.cs:110;Boss 血条
//   数值文本 BigProgressBarHelper.DrawHealthText 用,2026-08-21 增）:仅数字+/
//   11 字形裁片（p0 页 (0,0,240,104) 裁,字形坐标同原页),文字盒高 = lineSpacing 24。
import { upgradeToBitmap } from '../assets/SpriteAtlas';
import combatFontJson from '../data/combat-font.json';

interface GlyphRect { x: number; y: number; width: number; height: number }
interface FontPage {
  lineSpacing: number; spacing: number; defaultCharacter: number;
  texture: string;
  glyphs: GlyphRect[]; padding: GlyphRect[];
  characters: number[];
  kerning: Array<[number, number, number]>;
}

/** 字体注册表（索引即 fi）:0=Combat_Text 1=Combat_Crit 2=Item_Stack */
const FONT_KEYS = ['Combat_Text', 'Combat_Crit', 'Item_Stack'] as const;
/** Item_Stack 的注册表索引（BossBars 数值文本用） */
export const ITEM_STACK_FONT = 2;
const FONTS = combatFontJson as unknown as Record<(typeof FONT_KEYS)[number], FontPage>;
const TEX: Array<ImageBitmap | HTMLImageElement | null> = FONT_KEYS.map(() => null);
const CHAR_INDEX: Array<Map<number, number>> = FONT_KEYS.map(() => new Map<number, number>());
const READY: boolean[] = FONT_KEYS.map(() => false);

// 字符索引与贴图解耦注册（无 Image 环境如 vitest 也可度量;贴图就绪门 READY 不变）
FONT_KEYS.forEach((key, i) => {
  FONTS[key].characters.forEach((c, k) => CHAR_INDEX[i].set(c, k));
});

(function load() {
  if (typeof Image === 'undefined') return;
  FONT_KEYS.forEach((key, i) => {
    const p = FONTS[key];
    const img = new Image();
    img.onload = () => upgradeToBitmap(img, (b) => { TEX[i] = b; READY[i] = true; });
    img.src = `sprites/${p.texture}`;
  });
})();

export function combatFontReady(crit: boolean): boolean {
  return READY[crit ? 1 : 0];
}

/** Item_Stack 字体就绪（供 Boss 血条等消费方预检/兜底） */
export function itemStackFontReady(): boolean {
  return READY[ITEM_STACK_FONT];
}

/**
 * 染色字形缓存:XNA DrawString 的 color 乘进纹理(SpriteFont 白字 × tint);
 * Canvas 的 drawImage 不受 fillStyle 影响——必须离屏预染(source-atop 只铺
 * 到字形不透明像素上,位图字形 alpha 近二值=纯染色)。键 = 字体|字形|颜色,
 * 影层暗化色(×0.3)作独立键。上限清空防膨胀(色种有限,实测极小)
 */
const tintCache = new Map<string, HTMLCanvasElement>();
function tintedGlyph(fi: number, gi: number, fill: string): HTMLCanvasElement {
  const key = `${fi}|${gi}|${fill}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const f = FONTS[FONT_KEYS[fi]];
  const img = TEX[fi]!;
  const g = f.glyphs[gi];
  const c = document.createElement('canvas');
  c.width = g.width; c.height = g.height;
  const cx = c.getContext('2d')!;
  cx.drawImage(img, g.x, g.y, g.width, g.height, 0, 0, g.width, g.height);
  cx.globalCompositeOperation = 'source-atop';
  cx.fillStyle = fill;
  cx.fillRect(0, 0, g.width, g.height);
  if (tintCache.size > 512) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

/** MeasureString 内核（单行,XNA 语义:每字符 advance 后 +spacing,含尾字符）;
 *  高 = lineSpacing */
function measureOf(fi: number, text: string): { w: number; h: number } {
  const f = FONTS[FONT_KEYS[fi]];
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const k = CHAR_INDEX[fi].get(text.charCodeAt(i));
    if (k === undefined) { w += 8 + f.spacing; continue; }
    const [l, wd, r] = f.kerning[k];
    w += l + wd + r + f.spacing;
  }
  return { w, h: f.lineSpacing };
}

/** MeasureString（单行数字,XNA 语义:每字符 advance 后 +spacing,含尾字符）;
 *  高 = lineSpacing */
export function combatMeasure(text: string, crit: boolean): { w: number; h: number } {
  return measureOf(crit ? 1 : 0, text);
}

/** Item_Stack 的 MeasureString（Boss 血条数值文本） */
export function itemStackMeasure(text: string): { w: number; h: number } {
  return measureOf(ITEM_STACK_FONT, text);
}

/**
 * 原版 5 层绘制（Main.cs:61805-61841）。x/y = 文字盒中心（origin=Measure/2）。
 * scale/rotation/alpha 按 CombatText 字段传入。返回实际绘制字号(px)供外层参考。
 */
export function drawCombatText(
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, cy: number,
  rgb: [number, number, number], alpha: number,
  scale: number, rotation: number, crit: boolean, targetScale = 1,
): void {
  const fi = crit ? 1 : 0;
  const f = FONTS[FONT_KEYS[fi]];
  const img = TEX[fi];
  if (!img || !READY[fi]) return;
  const m = combatMeasure(text, crit);
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  // num15 = scale/targetScale（:61795）:生长段(scale<1)整体亮度随比例衰减
  const num15 = scale / targetScale;
  for (let layer = 0; layer < 5; layer++) {
    const isShadow = layer < 4;
    const dx = layer === 0 ? -targetScale : layer === 1 ? targetScale : 0;
    const dy = layer === 2 ? -targetScale : layer === 3 ? targetScale : 0;
    // 颜色（:61800-61828):影层 RGB×num15×alpha×0.3(本色调暗);本体 RGB×num15×alpha。
    // alpha 用 globalAlpha 施加;RGB 经 tintedGlyph 染进字形缓存
    const k = isShadow ? 0.3 : 1;
    ctx.globalAlpha = alpha * num15;
    let x = -m.w / 2 + dx;
    const y0 = -m.h / 2 + dy;
    const fill = `rgb(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)})`;
    for (let i = 0; i < text.length; i++) {
      const gi = CHAR_INDEX[fi].get(text.charCodeAt(i));
      if (gi === undefined) { x += 8; continue; }
      const [l, wd, r] = f.kerning[gi];
      x += l;
      const g = f.glyphs[gi];
      ctx.drawImage(tintedGlyph(fi, gi, fill), Math.round(x), Math.round(y0));
      x += wd + r + f.spacing;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * Utils.DrawBorderStringFourWay（:2600-2628）· Item_Stack 字体（Boss 血条数值
 * 文本,BigProgressBarHelper.DrawHealthText :62-76 的三段串各一次调用）:
 * 5 遍绘制 = 黑边四向偏移 (±2,0)/(0,±2) + 白色本体;锚点为 XNA DrawString 语义
 * ——(x,y) 是 origin 落点,文字盒左上 = (x-originX, y-originY),盒高 =
 * lineSpacing(字形顶对齐行盒顶)。text 超出字符集(数字+"/")的字形按 8px 空位跳过
 * （与飘字路径同兜底;BossBars 消费面恒为数字串,不触发）。
 */
export function drawItemStackBorderString(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  originX: number, originY: number,
): void {
  const fi = ITEM_STACK_FONT;
  const f = FONTS.Item_Stack;
  const img = TEX[fi];
  if (!img || !READY[fi]) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (let layer = 0; layer < 5; layer++) {
    const dx = layer === 0 ? -2 : layer === 1 ? 2 : 0;
    const dy = layer === 2 ? -2 : layer === 3 ? 2 : 0;
    const fill = layer < 4 ? '#000' : '#FFF';
    let px = x - originX + dx;
    const py = y - originY + dy;
    for (let i = 0; i < text.length; i++) {
      const gi = CHAR_INDEX[fi].get(text.charCodeAt(i));
      if (gi === undefined) { px += 8; continue; }
      const [l, wd, r] = f.kerning[gi];
      px += l;
      const g = f.glyphs[gi];
      ctx.drawImage(tintedGlyph(fi, gi, fill), Math.round(px), Math.round(py));
      px += wd + r + f.spacing;
    }
  }
  ctx.restore();
}
