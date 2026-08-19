// 原版 Item.color 静态表（Item.cs SetDefaults 内 `color = new Color(...)` 全 10 件）。
// 语义：带色物品的图标/掉落物是**灰度贴图 + 绘制期两遍着色**（底图 pass 后叠一遍
// item.color 的 alpha 混合 pass——世界掉落 Main.cs:38178、图标 :39211 同款
// `item.GetColor(color)` 消费）。最典型 = 凝胶 23：贴图纯灰，(0,80,255,100) 染蓝
// （用户 2026-08-19 报"凝胶变未染色灰"根因：本仓此前两处绘制都不吃这张表——
// Renderer.tintedSprite 死代码 + UI.iconUrl 无着色）。
// A=0 的五组（820-823/3001·3061·3002/3109-3112/4773-4776）在 GetColor 数学上
// 恒为不可见（A 通道钳 0）——原版即视觉无操作，表内保留以对账，渲染侧天然跳过。
export const VANILLA_ITEM_COLOR: Record<number, readonly [number, number, number, number]> = {
  23: [0, 80, 255, 100],                                     // 凝胶（:1638，蓝）
  316: [123, 167, 163, 255], 317: [123, 167, 163, 255],      // :5161 四件套
  318: [123, 167, 163, 255], 319: [123, 167, 163, 255],
  820: [255, 255, 255, 0], 821: [255, 255, 255, 0],          // :4703（A=0 无操作）
  822: [255, 255, 255, 0], 823: [255, 255, 255, 0],
  3001: [255, 255, 255, 0], 3061: [255, 255, 255, 0], 3002: [255, 255, 255, 0],   // :4751
  3109: [255, 255, 255, 0], 3110: [255, 255, 255, 0],        // :11021（3111 粉凝胶贴图原生粉）
  3111: [255, 255, 255, 0], 3112: [255, 255, 255, 0],
  4773: [255, 255, 255, 0], 4774: [255, 255, 255, 0],        // :28785
  4775: [255, 255, 255, 0], 4776: [255, 255, 255, 0],
};

/** 背包图标着色（UI.iconUrl 烘焙用）：对 32×32 图标 ImageData 做原版第二遍
 *  alpha 混合的等价单遍合成——out.rgb = C.rgb·(A/255) + base.rgb·(1−A/255)
 *  （仅基底不透明像素；A=0 恒等跳过）。纯函数便于单测。 */
export function blendItemColorTint(
  data: Uint8ClampedArray, c: readonly [number, number, number, number],
): void {
  const a = c[3] / 255;
  if (a <= 0) return;
  const keep = 1 - a;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = c[0] * a + data[i] * keep;
    data[i + 1] = c[1] * a + data[i + 1] * keep;
    data[i + 2] = c[2] * a + data[i + 2] * keep;
  }
}
