// ★BJ665b（2026-10-12）四月套甲件【恒色 250 自发光】面数据化——BJ594 登记架构债
// （免光实体窗/逐层采光）本刀落地面。原版全式亲读定谳（1.4.5.7 反编译）：
//
//  · PlayerDrawSet.cs SetPassColors：num2..num5 四族计件（:470-514 头/身/腿逐件
//    +1）后被 `num2 = 3; num3 = 3; num4 = 3; num5 = 3;`（:515-518）无条件钉满
//    ——计件支为死码，62.5×(1+3)=250 恒值（星尘腿 127×(1+3)=508 → (byte) 截断
//    252，unchecked 截断语义 508&0xFF）。
//  · 【恒色覆写】只落两族（本模块数据面）：
//      日耀 Solar  —— head==171（:589-593 colorArmorHead）/ body==177（:727-731
//                    colorArmorBody）/ legs==112（:790-794 colorArmorLegs）
//                    = GetImmuneAlphaPure(new Color(250,250,250,255), shadow)；
//      星尘 Stardust —— head==189（:582-588）/ body==190（:689-704）同 250³；
//                    legs==130（:800-806）= (byte)(127×4)=252 → 252³。
//    覆写【替换】 :451-454 的 Lighting.GetColorClamped 采光基值 = 整件甲不取光照
//    = 甲身暗处恒亮（自发光甲）。GetImmuneAlphaPure（Player.cs:54834-54846）=
//    Color.Multiply(newColor, (255−immuneAlpha)/255 × (1−shadow) ×
//    (1−shimmerTransparency))——常态（immune=0/shadow=0/shimmer=0）= ×1 恒等，
//    250³ 原值直出；本仓乘区链（眨眼/微光 bodyAlpha、潜行 armorMul、socialGhost
//    gFade）在渲染侧与甲层同式施加（RendererBJ665b 域）。
//  · 【漩涡/星云不恒色】——原版 169/175/110（漩涡）与 170/176/111（星云）只有
//    GlowMask 加色叠层（headGlowMask 15/16、bodyGlowMask 13-18/14-19+12、
//    legsGlowMask 199/17，色 (250,250,250,0) 纯加法），甲体色保持采光基值=
//    暗处甲身随光变暗+发光条恒亮=原版本相。本仓 BJ597 已落其 glow 叠层
//    （vanillaArmorGlow.ts 同值同锚）→ 此两族【不需要】本刀恒色面（债面陈述
//    「四月套全家恒亮」系 BJ594 概括口径，逐支亲读只有日耀/星尘两族覆写）。
//
//  · 本仓架构（BJ594 定谳候选 B 落地）：恒色甲件从 lit 实体窗烘除（PaperDoll
//    lunarSplit 烘焙拆分）→ 合成后逃逸队列重绘（armorGlowQueue 五族同判例域）；
//    被盖层（手持物/身前配饰/滑轮/坐骑前层等原版 18-38 层组）随迁同域重绘
//    （层序保持，禁 C 候选α=1 裸重绘）。分批：批1=日耀（用户实报域）、
//    批2=星尘（同机制+legs 252）。

/** 批次闸：1=日耀套（171/177/112）；2=+星尘套（189/190/130，legs 252）。
 *  漩涡/星云无恒色覆写，永不入表（原版逐支亲读，见头注）。 */
export const LUNAR_CONST_BATCH = 2;

/** 单甲位恒色值（PlayerDrawSet.cs 逐支亲读）：250=62.5×(1+num4/5)、
 *  252=(byte)(127×(1+num5)) 截断。null=该位无恒色覆写（采光基值）。 */
export function lunarConstPieceOf(slotId: number): number | null {
  if (LUNAR_CONST_BATCH >= 1) {
    if (slotId === 171 || slotId === 177 || slotId === 112) return 250;   // SolarFlare Helmet/Breastplate/Leggings
  }
  if (LUNAR_CONST_BATCH >= 2) {
    if (slotId === 189 || slotId === 190) return 250;                     // Stardust Helmet/Plate
    if (slotId === 130) return 252;                                       // Stardust Leggings（127×4 byte 截断）
  }
  return null;
}

export interface LunarConstPieces {
  /** head 甲位恒色值（null=该位采光） */
  head: number | null;
  body: number | null;
  legs: number | null;
}

/** 三甲位恒色判定（drawPlayer 消费口）：任一位恒色 → 拆分烘焙+逃逸重绘；
 *  全 null → null（lit 窗原路径逐位，零新增开销面）。 */
export function lunarConstPieces(head: number, body: number, legs: number): LunarConstPieces | null {
  const h = lunarConstPieceOf(head);
  const b = lunarConstPieceOf(body);
  const l = lunarConstPieceOf(legs);
  if (h === null && b === null && l === null) return null;
  return { head: h, body: b, legs: l };
}

/** ★BJ665b flush 侧 tint 合成（恒色值÷255 × 甲潜行 RGB 乘区——Renderer.
 *  flushLunarArmor 消费;纯函数供判别测试）。恒色【不取光照】：GetImmuneAlphaPure
 *  链（Player.cs:54834-54846）常态=×1 恒等 → 明亮/黑暗同值=自发光（lightAt=[0,0,0]
 *  下甲件像素仍=texRGB×250/255,与 lit 窗×0 相分异=t 判别面）。 */
export function lunarArmorFlushTint(cv: number, mul: readonly [number, number, number]): [number, number, number] {
  return [cv / 255 * mul[0], cv / 255 * mul[1], cv / 255 * mul[2]];
}
