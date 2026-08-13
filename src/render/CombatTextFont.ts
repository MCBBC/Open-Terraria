// 原版飘字位图字体（Combat_Text/Combat_Crit xnb → ReLogic DynamicSpriteFont,
// tools/extract-combat-font.mjs 提取;Reader 字段序反编译自本地 ReLogic.dll）。
//   字形布局（XNA SpriteFont.Draw 语义）:x += kerning.X → draw(glyph rect) →
//   x += kerning.Y + kerning.Z + spacing;行内顶部对齐。
//   5 层绘制（Main.cs DrawCombatText :61788-61841）:0-3 = ±targetScale 四向
//   偏移的暗化层（本色调暗至 ×0.3,非纯黑）,4 = 本体;锚点 = 文字盒中心
//   （origin = Measure/2）;crit 带 rotation（NewText :107 初始 ±0.12、Update
//   :178-187 漂移 ±0.001/t）。
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
const TEX: Array<HTMLImageElement | null> = [null, null];
const CHAR_INDEX: Array<Map<number, number>> = [new Map(), new Map()];
const READY: [boolean, boolean] = [false, false];

(function load() {
  if (typeof Image === 'undefined') return;
  const pages = [FONTS.Combat_Text, FONTS.Combat_Crit];
  pages.forEach((p, i) => {
    p.characters.forEach((c, k) => CHAR_INDEX[i].set(c, k));
    const img = new Image();
    img.onload = () => { TEX[i] = img; READY[i] = true; };
    img.src = `sprites/${p.texture}`;
  });
})();

export function combatFontReady(crit: boolean): boolean {
  return READY[crit ? 1 : 0];
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
    // ★alpha 两层都不再乘额外系数(影层 A=num15×alpha,曾误乘 0.3)
    const k = isShadow ? 0.3 : 1;
    ctx.globalAlpha = alpha * num15;
    ctx.fillStyle = `rgba(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)},1)`;
    let x = -m.w / 2 + dx;
    const y0 = -m.h / 2 + dy;
    for (let i = 0; i < text.length; i++) {
      const gi = CHAR_INDEX[fi].get(text.charCodeAt(i));
      if (gi === undefined) { x += 8; continue; }
      const [l, wd, r] = f.kerning[gi];
      x += l;
      const g = f.glyphs[gi];
      ctx.drawImage(img, g.x, g.y, g.width, g.height, Math.round(x), Math.round(y0), g.width, g.height);
      x += wd + r + f.spacing;
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
