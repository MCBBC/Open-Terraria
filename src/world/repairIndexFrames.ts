// 历史存档索引帧修复（纯函数，#perf2026-08-28 从 Game.repairIndexFrames 平移——
// 主线程 / worldGen worker 两侧共用；worker 读档管线在沉降【前】调用）。
//
// 背景：旧版生成代码曾把多格家具的格内偏移写成【格索引】(0/1) 而非【像素】(0/18)，
// 渲染端 ofx=1 只偏 1px → 2×2 宝箱四格显示同一贴图。特征：多格 vanilla framed
// 物体的全部格帧 <18 且非全 0（合法块必有一格 ≥18；全 0 是 wld 残缺帧，渲染端另有重建）。
//
// ★幂等性：任一物体一旦被修，其帧值 ≥18 → 特征判定 (maxFx≥18||maxFy≥18) 恒真跳过
// ——分批/续跑/重复执行绝不二次 ×18（worker 修完 + 门控失灵主线程再跑也安全）。
// 圣诞树 sheet171 豁免：wld 原生就是"索引帧"约定（锚点 frameX=10 哨兵 + 列/行
// 裸索引 + 锚点 frameY 装饰位段），×18 会同时毁掉两者（位段溢出 uint16 成垃圾）。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from './TileStore';

export function repairIndexFramesInStore(st: TileStore): number {
  let fixed = 0;
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      const type = st.type[i];
      if (type === 0 || !st.flags[i]) continue;
      const def = TILE_DEFS[type];
      const fw = def?.vanilla?.fw ?? 0, fh = def?.vanilla?.fh ?? 0;
      if (!def?.vanilla || def.vanilla.frame !== 'style' || fw < 2) continue;
      // 圣诞树 171 豁免：锚 frameX=10 哨兵 + 列/行裸索引 + frameY 装饰位段（原约定）
      if (def.vanilla.sheet === 171) continue;
      // 物体块帧汇总（fw×fh 邻域内同型格）
      let maxFx = 0, maxFy = 0, cells = 0, anyNonZero = false;
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          const xx = x + dx, yy = y + dy;
          if (!st.inBounds(xx, yy)) continue;
          const ii = st.idx(xx, yy);
          if (st.type[ii] !== type) continue;
          cells++;
          const fx = st.frameX[ii], fy = st.frameY[ii];
          if (fx > maxFx) maxFx = fx;
          if (fy > maxFy) maxFy = fy;
          if (fx !== 0 || fy !== 0) anyNonZero = true;
        }
      }
      // 索引帧特征：≥2 格且全 <18 且非全 0（全 0 是 wld 残缺帧，渲染端另有重建）
      if (cells < 2 || maxFx >= 18 || maxFy >= 18 || !anyNonZero) continue;
      // 只在左上角格修一次（dx=dy=0 的格），避免重复 ×18
      const li = st.idx(x - 1, y);
      const above = st.idx(x, y - 1);
      if (st.inBounds(x - 1, y) && st.type[li] === type) continue;
      if (st.inBounds(x, y - 1) && st.type[above] === type) continue;
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          const xx = x + dx, yy = y + dy;
          if (!st.inBounds(xx, yy)) continue;
          const ii = st.idx(xx, yy);
          if (st.type[ii] !== type) continue;
          st.frameX[ii] = st.frameX[ii] * 18;
          st.frameY[ii] = st.frameY[ii] * 18;
          fixed++;
        }
      }
    }
  }
  return fixed;
}
