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

// 原版 Item.alpha 静态表（Item.cs SetDefaults 全部 `alpha = N` 赋值，SW-FX49
// 2026-09-12 全文件 python 扫描逐行亲读提取；ResetDefaults :48997 缺省=0，
// 未列件 alpha=0）。消费面：GetAlpha 默认支（Item.cs:49328-49347）
// f=(255−alpha)/255 —— pass1 底图乘 f（ItemSlot.cs:2879 UI 图标 / Main.cs:39284
// 世界掉落，两路同构）。直通 alpha 表示下 = 仅 alpha 通道乘 f。
// ★GetAlpha 特例中和（:49174-49330 内 switch）——下列件虽 SetDefaults 有 alpha
// 但特例覆写为不透明，**不入表**：75 坠星（:2305 alpha=75，GetAlpha case 75
// :49191→(255,255,255,255)）、120 熔岩之弓（:2833 alpha=30，case 119-122
// :49197→(255,255,255,255)）。
// ★SW-BJ60 锚值勘误（BJ60 旧登记"22 A=110/23 A=100/65 A=0"系把 item.color 的
// A 通道串域到 Item.alpha；1457 实值：22 铁锭无 alpha 赋值=0（case 22 :1633-1639
// 全体无 alpha）、23 凝胶=175（:1656）、65 星怒=100（:2153）、319 鲨鱼鳍无赋值=0
// （:5180）、823 幽灵翼=255（:11041，GetAlpha 无特例→默认支 f=0=图标/掉落全透明，
// 其 tooltip"I am right here."即隐形本相的自白；1456 :11022/1458 :11041 同值）。
// 发光棒族 282/286/3112/4776 无赋值=0（:4722/:4770/:28811/:39283 仅 color 通道），
// 3002 显式 alpha=0（:27687）。
export const VANILLA_ITEM_ALPHA: Record<number, number> = {
  23: 175,   // 凝胶 :1656
  44: 30,    // 恶魔弓 :1907
  47: 30,    // 邪恶箭 :1954
  65: 100,   // 星怒 :2153（color=(150,150,150,0) A=0→pass2 零贡献，纯 alpha 维度）
  150: 100,  // 蛛网 :3185
  177: 50,   // 蓝玉 :3558（createTile 178 六宝石族）
  178: 50,   // 红玉 :3572
  179: 50,   // 绿玉 :3586
  180: 50,   // 黄玉 :3600
  181: 50,   // 紫晶 :3614
  182: 50,   // 钻石 :3628
  725: 30,   // 冰雪弓 :9871
  796: 30,   // 猩红弓 :10702
  823: 255,  // 幽灵翼（Ghostar's Infinity Eight）:11041 → f=0 图标+掉落全透明
  999: 50,   // 琥珀 :12909
  3002: 0,   // 洞穴探测荧光棒 :27687（显式 0，对账保留=无操作）
  3111: 100, // 粉凝胶 :28807
  5471: 100, // 蛛网复制品 :43154
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
 *  UI.iconUrl（图标烘焙）与 Renderer 掉落物着色共用——两路一致性单源。
 *  ★SW-FX49 第三参 itemAlpha=Item.alpha（VANILLA_ITEM_ALPHA 表）：>0 时先做
 *  pass1 底图 alpha×f（f=(255−alpha)/255，GetAlpha 默认支 :49328）再做色图
 *  叠加；c=null 且 f<1 = 纯 pass1（星怒/恶魔弓等无可见 color 件）。
 *  f=1 时走 BJ60 原式逐位基线；f<1 合成式见函数内注（pass2 α 用原 t）。 */
export function blendItemColorTint(
  data: Uint8ClampedArray, c: readonly [number, number, number, number] | null,
  itemAlpha = 0,
): void {
  // ★SW-FX49 pass1 维度（Item.cs GetAlpha 默认支 :49328-49347）：
  // f=(255−alpha)/255。直通 alpha 表示下 pass1 = 仅 alpha 通道乘 f、RGB 不动
  // （预乘域 T·(255f,255f,255f,255−alpha) 的 straight 等价 = (T.rgb, T.a·f)，
  // 变暗发生在 alpha 通道——与"RGB 乘暗"是两种不同债面）。
  const f = (255 - Math.max(0, Math.min(255, itemAlpha))) / 255;
  const kc = c ? c[3] / 255 : 0;
  if (kc <= 0 && f >= 1) return;             // A=0：pass2 零贡献（原版视觉无操作）
  const cr = c ? c[0] / 255 : 0, cg = c ? c[1] / 255 : 0, cb = c ? c[2] / 255 : 0;
  for (let i = 0; i < data.length; i += 4) {
    const t = data[i + 3] / 255;
    if (t === 0) continue;
    if (kc <= 0) {                           // 仅 pass1（c=null 或 color A=0）
      data[i + 3] = data[i + 3] * f;
      continue;
    }
    if (f >= 1) {                            // BJ60 原式（f=1 逐位基线，勿动）
      const occ = 1 - (1 - t) * (1 - t * kc);
      const keep = 1 - t * kc;
      data[i] = (t * data[i] * cr + t * data[i] * keep) / occ;
      data[i + 1] = (t * data[i + 1] * cg + t * data[i + 1] * keep) / occ;
      data[i + 2] = (t * data[i + 2] * cb + t * data[i + 2] * keep) / occ;
      data[i + 3] = occ * 255;
      continue;
    }
    // f<1：pass1(pre)=(T.rgb·a1, a1) 叠 pass2(pre)=(T.rgb·t·cr, t·kc) 的
    // source-over 合成（xnaCombined 同式，Renderer.ts:14795 前注）。
    // ★判别位：pass2 的 α 用【原 t】——原版第二遍画原贴图，不吃 pass1 的
    // alpha 折减（若误用 a1·kc，凝胶合成 α 0.583→0.398 即爆红）。
    const a1 = t * f;
    const keep = 1 - t * kc;
    const occ = t * kc + a1 * keep;
    data[i] = (t * data[i] * cr + a1 * data[i] * keep) / occ;
    data[i + 1] = (t * data[i + 1] * cg + a1 * data[i + 1] * keep) / occ;
    data[i + 2] = (t * data[i + 2] * cb + a1 * data[i + 2] * keep) / occ;
    data[i + 3] = occ * 255;
  }
}
