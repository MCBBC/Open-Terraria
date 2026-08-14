// 原版飘字位图字体（Combat_Text/Combat_Crit xnb → ReLogic DynamicSpriteFont,
// tools/extract-combat-font.mjs 提取;Reader 字段序反编译自本地 ReLogic.dll）。
//   字形布局（XNA SpriteFont.Draw 语义）:x += kerning.X → draw(glyph rect) →
//   x += kerning.Y + kerning.Z + spacing;行内顶部对齐。
//   5 层绘制（Main.cs DrawCombatText :61788-61841）:0-3 = ±targetScale 四向
//   偏移的暗化层（本色调暗至 ×0.3,非纯黑）,4 = 本体;锚点 = 文字盒中心
//   （origin = Measure/2）;crit 带 rotation（NewText :107 初始 ±0.12、Update
//   :178-187 漂移 ±0.001/t）。
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

const FONTS = combatFontJson as unknown as { Combat_Text: FontPage; Combat_Crit: FontPage };
const TEX: Array<ImageBitmap | HTMLImageElement | null> = [null, null];
const CHAR_INDEX: Array<Map<number, number>> = [new Map(), new Map()];
const READY: [boolean, boolean] = [false, false];

(function load() {
  if (typeof Image === 'undefined') return;
  const pages = [FONTS.Combat_Text, FONTS.Combat_Crit];
  pages.forEach((p, i) => {
    p.characters.forEach((c, k) => CHAR_INDEX[i].set(c, k));
    const img = new Image();
    img.onload = () => upgradeToBitmap(img, (b) => { TEX[i] = b; READY[i] = true; });
    img.src = `sprites/${p.texture}`;
  });
})();

export function combatFontReady(crit: boolean): boolean {
  return READY[crit ? 1 : 0];
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
  const f = fi === 1 ? FONTS.Combat_Crit : FONTS.Combat_Text;
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

/** MeasureString（单行数字,XNA 语义:每字符 advance 后 +spacing,含尾字符）;
 *  高 = lineSpacing */
export function combatMeasure(text: string, crit: boolean): { w: number; h: number } {
  const f = FONTS[crit ? 'Combat_Crit' : 'Combat_Text'];
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const k = CHAR_INDEX[crit ? 1 : 0].get(text.charCodeAt(i));
    if (k === undefined) { w += 8 + f.spacing; continue; }
    const [l, wd, r] = f.kerning[k];
    w += l + wd + r + f.spacing;
  }
  return { w, h: f.lineSpacing };
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
  const f = FONTS[crit ? 'Combat_Crit' : 'Combat_Text'];
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
