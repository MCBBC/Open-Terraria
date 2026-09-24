// 原版掉落物命中盒逐 vid 尺寸运行时（tools/extract-itemdims.mjs → vanilla-itemdims.json）。
// ★BJ326 件 2（2026-09-24）：掉落物盒 12×12 统一简化 → 原版 Item.width/height 按 vid
// （Item.cs SetDefaults1..5 + SetFoodDefaults 终值;字段缺省 0/case 体逐项赋值）。
// 消费面 = ItemDrop 命中盒（物理/拾取/岩浆烧毁/微光探针全吃 this.w/h;渲染 drawDrop
// 按盒中心锚定精灵 → 中心不变绘制不变）。表外（SW 自创物品 vid≤0/6196 域内 25 个
// 流分析形态缺口——yoyo 共体/空 case 等）回落 12×12 = 旧统一盒。
import dimsJson from './vanilla-itemdims.json';

const DIMS = dimsJson as Record<string, [number, number]>;

/** 原版 vid → 掉落命中盒 [width, height]（px）;表外 null */
export function vanillaItemDimsOfVid(vid: number): [number, number] | null {
  if (vid <= 0) return null;
  return DIMS[String(vid)] ?? null;
}
