// R1(framed-multitile-incomplete)豁免表。
// ★每条必须写:①原版/内部依据 ②移除条件(豁免表防腐——数据修好/语义接通后必须缩)。
// 注:下列类型无需进表即自动排除——!framed / 尺寸 1×1 / vanilla.frame!=='style'
// (auto/blend 是块族) / 树族(1×1) / 平台(非 framed) / pixel_block(drawVanillaCell 特判)。
// 门(1×3/2×3)**不豁免**:竖排门缺格正是要抓的(2026-08-13 巨石同族)。
export const MULTITILE_EXEMPT: ReadonlySet<string> = new Set([
  // sheet 314 矿轨:frameX/frameY=前后轨连接 ID(0-35),逐格独立非拼图
  // (VanillaTiler.ts:818 特判)。移除条件:矿轨改拼图语义。
  'v_314_minecart_track',
  // 多 style 多尺寸表:single w×h 矩形判定不成立(sheets 165/185/233)
  // (SpriteAtlas.VanillaTileMeta.frameSize 仅 3 个 tile 多 style)。
  // 移除条件:R1 支持按 style 的变尺寸矩阵。
  'v_165_cave_decos', 'v_185_small_decos', 'v_233_jungle_large_plants',
  // ---- 以下为 def 尺寸与权威 frameSize 存量错配,经 atlas-lint ATL-06 裁决 ----
  // (tests/atlas-lint.test.ts 同步锁豁免内容;数据修正后必须同步删除)
  // 树苗 sheet 20:def fw1/fh1 vs frameSize[1,2]——待裁决
  // 'acorn_sapling',
  // 丛林高草 sheet 74:def fh2 vs frameSize[1,1]——待裁决
  // 'v_74_jungle_tall_plants',
  // 宝石树苗 sheet 590:def fw3(带宽 54px 标记,有意)vs frameSize[1,2]——待裁决
  // 'v_590_gem_saplings',
  // 灯笼 sheet 93:def w1/h6 vs fw1/fh3 vs frameSize[1,3] 三方不一致——待裁决
  // 'v_93_lamps',
]);
