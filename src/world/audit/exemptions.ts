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
  // 海燕麦 sheet 529:原版 PlantSeaOat【单格写入】(WorldGen.cs:58333-58338:
  //   仅写 (x,y),frameY=0 写死)+34px 高贴图下探视觉;frameSize[1,2] 是绘制口径。
  //   repo def fh:2 与单格存储形态差一格 → R1 报"缺下格"为形态差异非缺角。
  //   移除条件:def fh 改 1 且渲染链适配。
  'v_529_sea_oats',
  // ---- 以下为 2026-08-13 集成首跑(种子 9293480)暴露的【残片语义疑点】----
  // 放置端三处(placePot/placePotRow/HiveSpider)均完整四格 → 缺角来自后续 pass
  // 半拆(原版 KillTile 对多格物体整块清,repo 疑有单格清残留)。残片溯源=二期专项。
  // 移除条件:KillTile 多格整块清语义接通。
  'pot',
  // 恶魔祭坛 sheet 26:原版【不保护祭坛残片】(CanEvilReplace/22/204 三重门挖空
  // 留残角=原版风格,2026-08 memory:altar-fragment-fix)。缺角合法。
  // 移除条件:祭轮保护语义变化。
  'v_26_altars',
  // 装饰组 186/187 族:3×2 多带布局表(Tiles_187 带宽 35 样式×54px,VanillaTiler:996
  // 分带重算);组内格帧语义与 R2"互异"模型不符(R2 warn 32 处在案)。
  // 移除条件:187 族帧分片语义核对完成。
  'v_186_decos_3x2', 'v_187_decos_3x2_group_2',
  // 掘地龟/啮龙蛋 751/752:【单格存储】(frameX 状态机:非锚点帧整格跳过绘制,
  // VanillaTiler:817 特判 :1034-1048)。移除条件:多格化改造。
  'v_751_sleeping_digging_turtle', 'v_752_chillet_egg',
]);
