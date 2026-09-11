// SW-BJ54（2026-09-10）智能交互 tile 高亮渲染 —— TileDrawing.GetTileOutlineInfo 链 1:1
//
// 【机制锚（1457）】
//   · 门：TileID.Sets.HasOutlines[type]（TileID.cs:277，TileDrawing.cs:902-904）
//   · 域：Main.InSmartCursorHighlightArea（Main.cs:4042-4052，hideUI/范围/coords 三门，
//     本仓 coords ⊆ 扫描域 + tileWon 胜出门等价）
//   · 效果：TextureAssets.HighlightMask[type]（AssetInitializer.cs:655-660
//     = Images/Misc/TileOutlines/Tiles_<type>，仅 HasOutlines 型装载——原版 Content
//     目录含 14/469 两张冗余文件不装载，本仓 97 张 1:1 在库）+
//     Colors.GetSelectionGlowColor（Colors.cs:127-130）；
//     avg=(tileLight.R+G+B)/3 整除（TileDrawing.cs:4522），avg>10 才画（:4523-4525）；
//     tileLight = Lighting.GetColor(x,y)（:886，GetFinalLight :1028 之前的原光照）。
//   · 源矩形（TileDrawing.cs:1422-1427）：(tileFrameX+addFrX, tileFrameY+addFrY,
//     tileWidth, tileHeight) = GetTileDrawData（:4567-6620）+ CacheSpecialDraws_Part2
//     （:1002→:4319 宝箱族）修正后的值；位置 (tileX*16-(tileWidth-16)/2, tileY*16+tileTop)。
//   · 色彩调制：XNA spriteBatch AlphaBlend = texel(255,255,255,a)×color → 本仓
//     scratch 'source-in' 乘色（白 texel 下 rgb 无损、α 相乘，逐值等价）。
//
// 【GetTileDrawData 修正表（候选∩HasOutlines 型，:4567-6620 逐块移植）】
//   动画/临时帧依赖型（addFrY=Main.tileFrame*38/54/72、GetTemporaryFrame 重写）
//   = 106/377/464/499/455/247/207/410/725/468/658 —— 本刀【排除】不画高亮（画则
//   mask 与本体动画帧错位），测试锁 RED 名单，债登记（补法：接 TileAnim.animFrameIdx）。
//
// 【SW-RB11a 审计落刀（2026-09-10）：GetTileDrawData 全 HasOutlines 型逐 case 复核】
//   · 静态修正缺块补齐（缺=mask 源矩形/落位错 2~18px）：
//       {16,17,26,77,487} tileHeight=18（:4954-4981）；{85,133,134,283} tileTop=2
//       （:4737-4751 组内 HasOutlines 成员）；132 top=2+h=18（:5047-5050）；
//       172 fy%38==18→h=18（:5031-5035,与 :6602 折带并存）；441 fy==18→h=18（:5423-5427）；
//       {470,475,597,621,622} tileTop=2（:5338-5354 组）；491 top=2+addFrX=54（:5405-5407）；
//       {480,509,657,720,721} tileTop=2（:6044-6056,fy≥54 另有 tileFrame*54 动画位——
//       动画态由 HIGHLIGHT_ANIM_WHEN_LIT 渲染门排除）。
//   · 动画排除集补员（Main.tileFrame 依赖,画则 mask 与本体动画帧错位）：
//       96（:5529 *36）/215 篝火（:6129 *36|252）/217,218（:5620 *36）/220（:5626 *54）/
//       228,243（:5588 *54）/300-308,354,355（:5381 *54）/463（:5400 *72）——旧 11 型
//       名单漏员；480/509/657/720/721 为【条件动画】（仅 lit 态 fy≥54）走 HIGHLIGHT_
//       ANIM_WHEN_LIT 保留静息态高亮。补法债同前（接 TileAnim.animFrameIdx 后可摘除）。

/** TileID.Sets.HasOutlines（TileID.cs:277，Factory.CreateBoolSet 缺省 false，
 *  表内 95 型 true）—— 原文数列照录 */
export const TILE_HAS_OUTLINES: ReadonlySet<number> = new Set([
  10, 11, 15, 21, 29, 55, 79, 85, 88, 89, 97, 102, 104, 125, 132, 136, 139, 144,
  207, 209, 212, 215, 216, 237, 287, 335, 338, 354, 356, 377, 386, 387, 388, 389,
  410, 411, 425, 441, 455, 463, 467, 468, 470, 475, 487, 480, 494, 497, 509, 510,
  511, 621, 464, 657, 658, 663, 699, 720, 721, 725, 733,
  16, 17, 18, 26, 77, 86, 94, 96, 101, 106, 114, 133, 134, 217, 218, 220, 228,
  243, 247, 283, 300, 301, 302, 303, 304, 305, 306, 307, 308, 412, 499, 622, 355, 172,
]);

/** 本刀排除：GetTileDrawData 动画 addFr/临时帧重写型（详见头注债）。
 *  ★SW-RB11a 补员 19 型：96/215/217/218/220/228/243/300-308/354/355/463（Main.tileFrame
 *  依赖,各自行号见头注）。 */
export const HIGHLIGHT_ANIM_EXCLUDED: ReadonlySet<number> = new Set([
  106, 377, 464, 499, 455, 247, 207, 410, 725, 468, 658,
  96, 215, 217, 218, 220, 228, 243, 300, 301, 302, 303, 304, 305, 306, 307,
  308, 354, 355, 463,
]);

/** ★SW-RB11a：条件动画型（GetTileDrawData :6044-6056——fy<54 静息 top=2 无动画位、
 *  fy≥54 点亮态 addFrY=Main.tileFrame*54）。静息态照画（top=2 修正）,点亮态渲染门
 *  排除（同排除集债,补 TileAnim 接线后可改画动画位）。 */
export const HIGHLIGHT_ANIM_WHEN_LIT: ReadonlySet<number> = new Set([480, 509, 657, 720, 721]);

/** TileID.Sets.BasicChest（TileID.cs:315 = CreateBoolSet(21, 467)）——
 *  CacheSpecialDraws_Part2（TileDrawing.cs:4319）开盖姿态带面 */
const BASIC_CHEST: ReadonlySet<number> = new Set([21, 467]);

/** Colors.GetSelectionGlowColor（Colors.cs:127-130）1:1。
 *  未选中 = 灰白 (avg/2,avg/2,avg/2,α=avg)；选中 = 黄调 (avg,avg,avg/3,α=avg)。
 *  返回 [r,g,b,a]。 */
export function getSelectionGlowColor(isTileSelected: boolean, avg: number): [number, number, number, number] {
  return isTileSelected
    ? [avg, avg, Math.floor(avg / 3), avg]
    : [Math.floor(avg / 2), Math.floor(avg / 2), Math.floor(avg / 2), avg];
}

export interface HighlightCellRect {
  /** 源矩形（mask 贴图像素） */
  sx: number; sy: number; sw: number; sh: number;
  /** 目标世界像素位（tileX*16-(tileWidth-16)/2, tileY*16+tileTop，TileDrawing.cs:1427） */
  dx: number; dy: number;
}

/**
 * 高亮源矩形/目标位 —— GetTileDrawData（TileDrawing.cs:4567-6620）候选∩HasOutlines
 * 非动画型修正表 + CacheSpecialDraws_Part2（:4319-4360 宝箱姿态带）1:1。
 * 参数 fx/fy = tile.frameX/frameY 原值；chestFrame = Main.chest[FindChest].frame
 * （宝箱 21/467 专用，0/1/2 → 姿态带 +0/38/76）。
 */
export function highlightCellRect(
  type: number, fx: number, fy: number, tileX: number, tileY: number, chestFrame = 0,
): HighlightCellRect {
  let addFrX = 0;
  let addFrY = 0;
  let w = 16;
  let h = 16;
  let top = 0;
  switch (type) {
    case 14:                                                     // :5016-5023 与 21/411/467/469 同组
    case 21:
    case 411:
    case 467:
    case 469:
      if (fy === 18) h = 18;
      break;
    case 16:                                                     // ★SW-RB11a :4954-4981 组
    case 17:                                                     // （16/17/26/32/69/72/77/124/
    case 26:                                                     //   137/138/352/462/487/488/
    case 77:                                                     //   574-578/664/695/704/712-716
    case 487:                                                    //   tileHeight=18——组内 HasOutlines
      h = 18;                                                    //   成员仅此五型）
      break;
    case 85:                                                     // ★SW-RB11a :4737-4751 组
    case 133:                                                    // （78/85/133/134/173/210/233/254/
    case 134:                                                    //   283/378/457/466/520/651/652
    case 283:                                                    //   tileTop=2——组内 HasOutlines 成员
      top = 2;                                                   //   仅此四型）
      break;
    case 132:                                                    // ★SW-RB11a :5047-5050（135 同组）
      top = 2;
      h = 18;
      break;
    case 15:                                                     // :5025-5029（与 497 同组）
    case 497:
      if (fy % 40 === 18) h = 18;
      {                                                           // :6348-6352 带折（497 块内、if 外——15 同吃）
        const n65 = Math.floor(fy / 40);
        const n72 = Math.floor(n65 / 51);
        addFrY -= 2040 * n72;
        addFrX += 36 * n72;
      }
      break;
    case 79: {                                                   // :4709-4715
      h = 18;
      const n33 = Math.floor(fy / 2016);
      addFrY -= 2016 * n33;
      addFrX += 144 * n33;
      break;
    }
    case 18: {                                                   // :4717-4722
      const n31 = Math.floor(fx / 2016);
      addFrX -= 2016 * n31;
      addFrY += 20 * n31;
      break;
    }
    case 136:                                                    // :4723-4728
      if (fx === 0) top = 2;
      break;
    case 494:                                                    // :4729
      top = 2;
      break;
    case 139: {                                                  // :4731-4737
      top = 2;
      const n5 = Math.floor(fy / 2016);
      addFrY -= 2016 * n5;
      addFrX += 72 * n5;
      break;
    }
    case 389: {                                                  // :4738-4750
      const num59 = 94;
      top = -2;
      if (fy === num59 - 20 || fy === num59 * 2 - 20 || fy === 0 || fy === num59) h = 18;
      if (fy !== 0 && fy !== num59) top = 0;
      break;
    }
    case 699:                                                    // :4751
      top = 2;
      break;
    case 412:                                                    // :5240 区段
      addFrY = 0;
      top = 2;
      break;
    case 89: {                                                   // 89 带折块
      top = 2;
      const n68 = Math.floor(fx / 1998);
      addFrX -= 1998 * n68;
      addFrY += 36 * n68;
      break;
    }
    case 102:                                                    // top=2 块
      top = 2;
      break;
    case 88: {                                                   // 88 带折块
      const n74 = Math.floor(fx / 1998);
      addFrX -= 1998 * n74;
      addFrY += 36 * n74;
      break;
    }
    case 101: {                                                  // 101 带折块
      const n69 = Math.floor(fx / 1998);
      addFrX -= 1998 * n69;
      addFrY += 72 * n69;
      break;
    }
    case 104: {                                                  // 104 带折块
      const n67 = Math.floor(fx / 2016);
      addFrX -= 2016 * n67;
      addFrY += 90 * n67;
      top = 2;
      break;
    }
    case 470:                                                    // ★SW-RB11a :5338-5354 组
    case 475:                                                    // （28/105/470/475/506/547/548/
    case 597:                                                    //   552/560/597/613/621/622/623/
    case 621:                                                    //   653/699 tileTop=2——组内
    case 622:                                                    //   HasOutlines 成员 470/475/597/
      top = 2;                                                   //   621/622;699 原已单列）
      break;
    case 491:                                                    // ★SW-RB11a :5405-5407
      top = 2;
      addFrX += 54;
      break;
    case 480:                                                    // ★SW-RB11a :6044-6056（509/657/
    case 509:                                                    //   720/721/725 同组——fy≥54 另有
    case 657:                                                    //   tileFrame*54 动画位,点亮态由
    case 720:                                                    //   HIGHLIGHT_ANIM_WHEN_LIT 渲染门
    case 721:                                                    //   排除;725 已在排除集）
      top = 2;
      break;
    case 172: {                                                  // 172 带折块（:6602-6604）
      const n66 = Math.floor(fy / 2014);
      addFrY -= 2014 * n66;
      addFrX += 36 * n66;
      if (fy % 38 === 18) h = 18;                                // ★SW-RB11a :5031-5035（376 同组）
      break;
    }
    case 441:                                                    // ★SW-RB11a :5423-5427（468 同组
      if (fy === 18) h = 18;                                     //   动画型已排除;441 静态半边）
      break;
    case 733: {                                                  // 733 块
      top = 2;
      if (fy < 54) addFrX += 54;
      fx %= 54;
      fy %= 54;
      break;
    }
    default:
      break;
  }
  // CacheSpecialDraws_Part2（:4319-4360）宝箱族叠加：addFrX=18 对齐（恒 0）、
  // addFrY=底行折算+开盖姿态带（frame∈{0,1,2}→+0/38/76）、底行 tileHeight=18
  if (BASIC_CHEST.has(type)) {
    const num2 = Math.floor(fy / 18);
    addFrX += Math.floor(fx / 18) * 18 - fx;
    let num5 = num2 * 18;
    if (chestFrame === 1) num5 += 38;
    else if (chestFrame === 2) num5 += 76;
    addFrY += num5 - fy;
    if (num2 !== 0) h = 18;
  }
  return {
    sx: fx + addFrX,
    sy: fy + addFrY,
    sw: w,
    sh: h,
    dx: tileX * 16 - (w - 16) / 2,
    dy: tileY * 16 + top,
  };
}

// ---- HighlightMask 贴图懒加载（Renderer Extra_N 懒加载同款：Image→ImageBitmap）----

const maskCache = new Map<number, ImageBitmap | HTMLImageElement | null>();
const maskPending = new Set<number>();

// ═══ ★SW-BJ61（2026-09-11）智能光标可视面光照采样 —— 用户明令分歧【已按用户确认回滚】═══
// 反编译证据（1457 终值;1458 同域逐字同;1456 同）：原版黄框色 =
//   Lighting.GetColor(scX,scY) × buffColor(1,0.9,0.1,1)（Main.cs:47406,buffColor
//   :38728-38735 纯乘;DrawSmartCursor :47385-47442）、tile 高亮 avg=(R+G+B)/3 且
//   avg>10 才画（TileDrawing.cs:4522-4526;GetSelectionGlowColor Colors.cs:127-130）
//   ——即原版高亮随格光照线性压暗,光照=0 时黄框为黑（不可见）、高亮不画;恒亮面仅
//   光标图标本体（Main.cs:48783 + CursorColor :53271-53294,屏空间）与方向锁箭头
//   （:47437 Color.White）。光照引擎零下限（LightingEngine.GetColor :65-73 →
//   LightMap 索引器裸值;TileLightScannerOptions 仅 DrawInvisibleWalls）。
// 曾按用户 2026-09-11 首报注册「恒全亮」分歧（先例:keybinds Esc 链）；同日用户
//   实机复核确认「暗处衰减=反编译语义成立」→ 分歧撤销,采样恢复读格光（恒等直通=
//   回滚后本函数仅作单点标记,几何/源矩形/姿态带/GetSelectionGlowColor 保持 BJ54 1:1）。
// 预修探针留档（/tmp/probe-out/_bj61）：仓库改动前=反编译语义逐值成立
//   （光 0/51/144 → 边框 r 0/56/158 线性,蓝分量=light.b×0.3 精确）。
/** 智能光标可视面（黄框/tile 高亮）光照采样 —— 分歧已回滚:恒等直通格光（见上注） */
export function smartHighlightSampleLight(light: readonly [number, number, number]): [number, number, number] {
  return [light[0], light[1], light[2]];
}

/** 方向锁箭头色 —— 原版 Color.White 恒亮（Main.cs:47432-47437 smartCursorArrow
 *  Draw 不读格光;与黄框/高亮不同,此项是【真实原版 1:1】非用户分歧,分歧回滚中保留）。
 *  ★SW-BJ61 修复:本仓 Renderer 曾误乘格光=对原版偏离。 */
export const SMART_CURSOR_ARROW_COLOR: readonly [number, number, number] = [255, 255, 255];

/** TextureAssets.HighlightMask[type] 等价懒加载（Assets/Content 路径映
 *  sprites/vanilla/Misc_TileOutlines_Tiles_<type>.png）。null=尚未就绪/不存在。
 *  404 → 永久负缓存（防每帧重发）；HasOutlines 全 95 型素材实测在库（97 张，
 *  含原版冗余 14/469），负缓存仅作容错。 */
export function loadHighlightMask(type: number): ImageBitmap | HTMLImageElement | null {
  const hit = maskCache.get(type);
  if (hit !== undefined) return hit;
  if (maskPending.has(type)) return null;
  maskPending.add(type);
  const img = new Image();
  img.onload = () => {
    const settle = (v: ImageBitmap | HTMLImageElement) => {
      maskCache.set(type, v);
      maskPending.delete(type);
    };
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(img).then(settle).catch(() => settle(img));
    } else {
      settle(img);
    }
  };
  img.onerror = () => {
    maskCache.set(type, null);
    maskPending.delete(type);
  };
  img.src = `sprites/vanilla/Misc_TileOutlines_Tiles_${type}.png`;
  return null;
}
