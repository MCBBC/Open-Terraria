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
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import type { TileStore } from './TileStore';

/** 平台楼梯坡度帧码（WorldGen.cs:86748 平台表分支专码，坡/平两支互斥）：
 *  slope1 支 {180,360,396,432,468} / slope2 支 {144,342,378,414,450}；
 *  平支专码 {0..126} ∪ {216,234,252,270,288} 不参与（合法平帧）。
 *  用于修复「楼梯帧+slope=0」嵌合态（旧 wld 导入门缺陷的存量档，见下） */
const SLOPE1_FRAME_CODES = new Set([180, 360, 396, 432, 468]);
const SLOPE2_FRAME_CODES = new Set([144, 342, 378, 414, 450]);

export function repairIndexFramesInStore(st: TileStore): number {
  let fixed = 0;
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = st.idx(x, y);
      const type = st.type[i];
      if (type === 0 || !st.flags[i]) continue;
      const def = TILE_DEFS[type];
      // 平台楼梯坡度修复（2026-08-28）：旧 wld 导入器 SaveSlopes 门错用本仓碰撞域
      // solid（平台=false），导入世界的平台坡度全丢 →「楼梯帧+slope=0」嵌合态
      // （渲染出孤立楼梯碎片+平碰撞；原版不可能产出该态——SaveSlopes 含平台族，
      // 且坡/平帧码分支互斥）。帧码反推坡度，幂等（修复后 slope≠0 恒跳过）
      if (def?.platform && st.slope[i] === 0) {
        const fx = st.frameX[i];
        if (SLOPE1_FRAME_CODES.has(fx)) { st.slope[i] = 1; fixed++; continue; }
        if (SLOPE2_FRAME_CODES.has(fx)) { st.slope[i] = 2; fixed++; continue; }
      }
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

/** Chest.IsLocked（Chest.cs:295-310）帧区间判定：tile21 六段锁定带 + tile467
 *  style13（沙漠锁箱）。正典位=本文件（BJ377 从 WldImport 平移,WldImport 再导出
 *  保持 API 不变）——存量锚修复与 .wld 导入必须同源,防两份帧带漂移。 */
export function vanillaChestIsLocked(sheet: number, fx: number): boolean {
  return sheet === 21
    ? (fx >= 72 && fx <= 106) || (fx >= 144 && fx <= 178) || (fx >= 828 && fx <= 1006)
      || (fx >= 1296 && fx <= 1330) || (fx >= 1368 && fx <= 1402) || (fx >= 1440 && fx <= 1474)
    : sheet === 467 && Math.floor(fx / 36) === 13;
}

/**
 * ★BJ377（2026-09-28）存量 .wld 导入档容器锚格类型误写批修（纯函数,幂等）。
 *
 * 背景：2026-09-07 蓝队门1 之前 WldImport 的箱锚兜底判据是
 * `type[anchor] !== CHEST_TILE`——把合法容器族（467 群系箱族 / 88 梳妆台族,
 * 原版 Chest.CreateChest 三族,IS_A_CONTAINER_SHEETS={21,467,88}）的登记锚格
 * 判成「登记箱与图格脱节」强改写为 tile 21（**帧不动**）。旧构建导入的 .wld
 * 从此每个 467 箱/梳妆台的左上锚格变成 type 21 + 家族风格列基帧：
 *   ①左上格贴图错误（外来帧值落 21 的 sheet 带,画出别款箱）;
 *   ②破坏链碎片化——整件清格带同类型门（Game.ts 锚点盒 `get()===type` 才清）
 *     挖 467 格清 3 格留锚格、挖锚格清 1 格留 3 格 =「多段破坏」实感;
 *   ③锚帧落 21 锁带（144/918/972/1296/1458…∈Chest.IsLocked 区间）→ 白送
 *     locked=true,开箱白要金钥匙（本种 66 污染锚实测 37 锚误锁）。
 * 用户存档 66 锚（47×467+19×88）全数命中；现行导入链（蓝队门1 后）重导同源
 * .wld 已净（421 锚审计 0 坏）,本修只针对存量档。
 *
 * 判别（保守,只动注册表锚）：锚格 type=21 且锚帧处锚相位（467:fx%36==0&&fy%36==0;
 * 88:fx%54==0&&fy%36==0）且物盒内（除锚格）存在同族格帧全等偏移（col·18/row·18）
 * 证据且无同族格反证 → 锚 type 改回本族（帧一律不动）。重合碰撞不可能：467 非锚格
 * fx≡18(mod 36) 与 21 锚 fx≡0(mod 36) 不同余;88 同理（54 带内 36k+18≡0(mod 54)
 * 需 k≡1(mod 3) 即 21 锚 fx=54k 恰是 88 家族锚相位——而该格同时是本族锚格,
 * 两容器物理上不可重叠,有效布局不存在此态）。
 * locked 刷新：仅对已修锚按真 sheet 重算（Chest.IsLocked）,合法锁箱（21 锁带
 * /467 style13）不受影响。
 * 幂等：修后锚 type≠21 → 判别门恒跳过;合法世界零写入零扰动。
 * 边界：仅 v3+ 存档调用（SaveFile.loadSaveData v3 门）——v2 旧内部下标域与本仓
 * 现行 TILE_BY_KEY 域无保序契约,不在本修判别域（v2 档首次存档转 v5 后下一读档
 * 自动入修）。
 */
export function repairLegacyContainerAnchorsInStore(
  st: Pick<TileStore, 'idx' | 'inBounds' | 'type' | 'frameX' | 'frameY'>,
  chests: ReadonlyArray<{ x: number; y: number; locked?: boolean }>,
): number {
  const CHEST = TILE_BY_KEY['chest'];
  const CHEST2 = TILE_BY_KEY['v_467_chests_group_2'];
  const DRESSER = TILE_BY_KEY['dresser'];
  if (CHEST === undefined || CHEST2 === undefined || DRESSER === undefined) return 0;
  let fixed = 0;
  for (const c of chests) {
    if (!st.inBounds(c.x, c.y)) continue;
    const a = st.idx(c.x, c.y);
    if (st.type[a] !== CHEST) continue;                       // 只修误写锚（幂等门）
    const ax = st.frameX[a], ay = st.frameY[a];
    if (ay % 18 !== 0) continue;                              // 非格距帧=残缺,不判
    // 家族证据扫描：物盒内除锚格,同族格帧全等偏移=证据;同族格帧不合=反证即弃
    const tryFamily = (fw: number, fh: number, family: number): boolean => {
      let evidence = false;
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = c.x + dx, yy = c.y + dy;
          if (!st.inBounds(xx, yy)) continue;
          const k = st.idx(xx, yy);
          if (st.type[k] !== family) continue;                // 非本族格（被挖/异物）不证不斥
          if (st.frameX[k] === ax + dx * 18 && st.frameY[k] === ay + dy * 18) evidence = true;
          else return false;                                  // 同族格帧不合 = 反证,保守弃修
        }
      }
      return evidence;
    };
    let family = 0;
    if (ax % 36 === 0 && ay % 36 === 0 && tryFamily(2, 2, CHEST2)) family = CHEST2;
    else if (ax % 54 === 0 && ay % 36 === 0 && tryFamily(3, 2, DRESSER)) family = DRESSER;
    if (!family) continue;
    st.type[a] = family;                                      // 帧不动（污染面只改 type）
    c.locked = vanillaChestIsLocked(TILE_DEFS[family].vanilla?.sheet ?? -1, ax) || undefined;
    fixed++;
  }
  return fixed;
}
