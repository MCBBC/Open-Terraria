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
  // ---- atlas-lint ATL-06 裁决(2026-08-13,逐条对 TileObjectData.cs): ----
  // acorn_sapling(sheet 20):def fh1 → 已修 fh2(ObjectData Width1/Height2+frameSize[1,2]),不豁免。
  // 丛林高草 sheet 74:原版 Style1x1Plant_Height34——占格 1×1、贴图 34px 跨两格视觉;
  //   repo def fh:2 是放置便利(放置端按 2 格植),视觉等效。移除条件:放置端改 1×1。
  'v_74_jungle_tall_plants',
  // 宝石树苗 sheet 590:原版 Width1/Height2 × 3 style 横排(StyleMultiplier=3);
  //   repo def fw:3=有意"带宽 54px"标记(成长判定 frameX/54 取宝石序号,:72924)。
  //   移除条件:成长判定改按 style 求值。
  'v_590_gem_saplings',
  // 灯笼 sheet 93:原版 Width1/Height3(frameSize[1,3]);repo def w:1/h:6 是
  //   "占格 3 + 样式行 3"的内部双轴语义(亮灭档在 X 样式在 Y——2026-08 灯笼竖排轴
  //   教训),fw/fh=1×3 与渲染帧一致。移除条件:w/h 语义并入 vanilla.fw/fh。
  'v_93_lamps',
]);
