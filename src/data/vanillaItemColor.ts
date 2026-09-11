// 原版 Item.color 静态表（Item.cs SetDefaults 全 10 处 `color = new Color(...)`，
// SW-BJ60 2026-09-11 全量重提）：SetDefaults 主入口 :48698 起，分散在
// SetDefaults1(:1388)/SetDefaults4(:27660)/SetDefaults5(:35463) 五段拆分开关内。
// 语义：带色物品的绘制是 **两遍叠加**（Terraria.UI/ItemSlot.cs:2879-2889）——
//   pass1 底图：`item.GetAlpha(itemLight)`（Item.cs:49174，alpha=0 时 = 全亮
//   原图；:2879）；
//   pass2 色图：`if (item.color != Color.Transparent)` 才有——
//   `item.GetColor(newColor)`（Item.cs:49348：clamp(color+newColor−255) 逐通道，
//   图标域 newColor=白 → = item.color 本身）同帧再画一遍（:2888）。
// XNA 预乘语义下两遍合成 = 乘色（tex.rgb × C.rgb）+ 底图残量，见 blend 函数注。
//
// ★SW-BJ60 定谳（用户报"火焰花背包图标=纯色 #8DC0BB"）：2026-08-19 凝胶批曾把
// case 319（鲨鱼鳍 :5180）的青色误扩成"316-319 四件套"（注释标 ":5161" 系 1456
// 行号——1456 中该 color 行恰在 :5161），把腐化草 316/水叶草 317/火焰花 318
// 一并染青。1457 权威：**草本 313-318 逐 case 均无 color 赋值**
// （313@:5146 / 314@:5151 / 315@:5156 / 316@:5161 / 317@:5166 / 318@:5171，
// 各自 width12/height14/value100/break；1458 同域零变更 :5146-5181；1456 同），
// 图标原样 = 世界掉落物一致。同批还把 A=0 孤例误扩成 820-823/3001·3061·3002/
// 3109-3112/4773-4776 四"组"——各 case 体均无 color（820@:11011/821@:11023/
// 822@:11031/3001@:27664/3061@:27678/3109@:28788/3110@:28796/3111@:28804/
// 4773@:39260/4774@:39267/4775@:39275），已一并撤除；漏收的 22 铁锭（:1640，
// A=110 可见暖色染）/65 星怒（:2154）/286 黏性荧光棒（:4770）补齐。
// A=0 五件在 GetColor 数学上恒不可见（A 通道钳 0 → pass2 零贡献）——表内保留
// 以对账，渲染侧天然跳过。GetAlpha 内特例（3522/3191/3822/4143/4354-5128 等
// 底图 pass 覆写，Item.cs:49285-49330）与 player 染色件（shirtColor 等
// :4542/:4550/:4558）非 item.color 静态数据，不入本表。
export const VANILLA_ITEM_COLOR: Record<number, readonly [number, number, number, number]> = {
  22: [160, 145, 130, 110],                                  // 铁锭（:1640，A=110 可见）
  23: [0, 80, 255, 100],                                     // 凝胶（:1658，蓝；Item.alpha=175 另域）
  65: [150, 150, 150, 0],                                    // 星怒（:2154，A=0）
  282: [255, 255, 255, 0],                                   // 荧光棒（:4722，A=0）
  286: [255, 255, 255, 0],                                   // 黏性荧光棒（:4770，A=0）
  319: [123, 167, 163, 255],                                 // 鲨鱼鳍（:5180，A=255 乘色）
  823: [255, 255, 255, 0],                                   // 幽灵翼（:11040，A=0；Item.alpha=255 另域）
  3002: [255, 255, 255, 0],                                  // 洞穴探测荧光棒（:27688，A=0）
  3112: [255, 255, 255, 0],                                  // 弹跳荧光棒（:28811，A=0）
  4776: [255, 255, 255, 0],                                  // 仙灵荧光棒（:39283，A=0）
};

/** Item.color 两遍合成（ItemSlot.cs:2879-2889 + Item.cs:49174 GetAlpha /
 *  :49348 GetColor 的 XNA 预乘等价，与 Renderer.xnaCombined 同族公式，ka=1）：
 *  对已画好底图的 RGBA 像素做逐 texel 合成——
 *    occ      = 1−(1−t)(1−t·kc)                      （两遍叠加后 alpha）
 *    premult  = t·T·(C.rgb/255) + t·T·(1−t·kc)        （色图 + 底图残量）
 *    out.rgb  = premult/occ, out.a = occ·255          （直通 alpha 表示）
 *  T=底图 texel、t=底图 alpha、kc=C.a/255。★乘法语义：C 全遮（A=255）时
 *  out = T×C.rgb/255 保留贴图明暗（鲨鱼鳍=暗青鲨鱼鳍,非纯色剪影）；
 *  半遮（凝胶 A=100）时底图按 (1−t·kc) 残量叠加。纯函数便于单测，
 *  UI.iconUrl（图标烘焙）与 Renderer 掉落物着色共用——两路一致性单源。 */
export function blendItemColorTint(
  data: Uint8ClampedArray, c: readonly [number, number, number, number],
): void {
  const kc = c[3] / 255;
  if (kc <= 0) return;                       // A=0：pass2 零贡献（原版视觉无操作）
  const cr = c[0] / 255, cg = c[1] / 255, cb = c[2] / 255;
  for (let i = 0; i < data.length; i += 4) {
    const t = data[i + 3] / 255;
    if (t === 0) continue;
    const occ = 1 - (1 - t) * (1 - t * kc);
    const keep = 1 - t * kc;
    data[i] = (t * data[i] * cr + t * data[i] * keep) / occ;
    data[i + 1] = (t * data[i + 1] * cg + t * data[i + 1] * keep) / occ;
    data[i + 2] = (t * data[i + 2] * cb + t * data[i + 2] * keep) / occ;
    data[i + 3] = occ * 255;
  }
}
