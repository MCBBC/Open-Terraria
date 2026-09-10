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

/** 本刀排除：GetTileDrawData 动画 addFr/临时帧重写型（详见头注债） */
export const HIGHLIGHT_ANIM_EXCLUDED: ReadonlySet<number> = new Set([
  106, 377, 464, 499, 455, 247, 207, 410, 725, 468, 658,
]);

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
    case 14:                                                     // :5017-5024 与 21/411/467/469 同组
    case 21:
    case 411:
    case 467:
    case 469:
      if (fy === 18) h = 18;
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
    case 172: {                                                  // 172 带折块
      const n66 = Math.floor(fy / 2014);
      addFrY -= 2014 * n66;
      addFrX += 36 * n66;
      break;
    }
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
