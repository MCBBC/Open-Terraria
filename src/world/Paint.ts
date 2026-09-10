// 油漆（Paint）系统——1.4.5.6 反编译源码 1:1 移植。
//
// 权威源码对照（行号 = /Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/）：
//   - PaintID 全表            Terraria.ID/PaintID.cs:5-69
//   - paintColor（id→RGB）    Terraria/WorldGen.cs:43948-44061
//   - coatingColor（涂层色）  Terraria/WorldGen.cs:44063-44071
//   - paintEffect（涂刷尘）   Terraria/WorldGen.cs:44091-44112
//   - paintTile/paintWall     Terraria/WorldGen.cs:44137-44159 / 44257-44279
//   - 涂刷交互三件套          Terraria/Player.cs:41152-41369
//   - 智能光标三策略          Terraria.GameContent/SmartCursorHelper.cs:668-807
//   - 史莱姆踩漆 lerp         Terraria/NPC.cs:60971-61087
//   - 存储位                  Terraria/Tile.cs:609-617（方块 sTileHeader&0x1F）/ :365-373（墙 bTileHeader&0x1F）
//   - 存档位                  Terraria.IO/WorldFile.cs:1474-1491（写）/:2571-2587（读）
//   - pass 序号映射           Terraria/Main.cs:58064-58083（ConvertPaintIdToTileShaderIndex）
//   - shader 参数装配         Terraria.GameContent/TilePaintSystemV2.cs:69-82（PrepareShader）
//   - 特判组设置             Terraria.GameContent/TreePaintSystemData.cs:5-24/:252-324/:399-402
//   - 像素公式真值           terraria-assets/TileShader.cso 反汇编（tools/disasm-fx.mjs）
//
// 【1.4.4+ 体系说明】荧光漆（PaintID 31 = IlluminantPaint）已废弃，改为"涂层(coating)"体系：
//   物品 4668 GlowPaint(paintCoating=1, 荧光) / 5344 EchoCoating(paintCoating=2, 隐形)，
//   走 Tile.fullbrightBlock/invisibleBlock 位（Tile.cs:558-607）而非 5bit 油漆域。
//   旧档迁移 ConvertIlluminantPaintToNewField（WorldFile.cs:2806-2825）。
//   本仓涂层链已建（2026-08-23）：存储 = TileStore.coat 四位通道（WF:1539-1552 位编码）；
//   涂刷 = paintCoatTile/paintCoatWall（本文件尾）+ Game.tryPainting ApplyCoating 分支；
//   渲染 = ChunkCache 隐形跳过 + 全亮叠层（pair.glow）+ Renderer 光照后合成；
//   光照 = TileLightScanner 隐形格不挡光（TileLightScanner.cs:154-166）。

/** PaintID（Terraria.ID/PaintID.cs:5-69）。深层漆 = 浅层 id+12（13-24）。 */
export const enum PAINT_ID {
  NONE = 0,
  RED = 1,
  ORANGE = 2,
  YELLOW = 3,
  LIME = 4,
  GREEN = 5,
  TEAL = 6,
  CYAN = 7,
  SKY_BLUE = 8,
  BLUE = 9,
  PURPLE = 10,
  VIOLET = 11,
  PINK = 12,
  DEEP_RED = 13,
  DEEP_ORANGE = 14,
  DEEP_YELLOW = 15,
  DEEP_LIME = 16,
  DEEP_GREEN = 17,
  DEEP_TEAL = 18,
  DEEP_CYAN = 19,
  DEEP_SKY_BLUE = 20,
  DEEP_BLUE = 21,
  DEEP_PURPLE = 22,
  DEEP_VIOLET = 23,
  DEEP_PINK = 24,
  BLACK = 25,
  WHITE = 26,
  GRAY = 27,
  BROWN = 28,
  SHADOW = 29,
  NEGATIVE = 30,
  /** 废弃：1.4.4 起转涂层体系（PaintID.cs:67-69，WorldFile.cs:2806-2825 迁移） */
  ILLUMINANT = 31,
}

/** 油漆有效上限（含 31 废弃位，byte 域完整 5bit） */
export const PAINT_MAX = 31;

/** paint id → RGB 预展开表（paintColor 的数组直查版，热循环用；下标 0-31） */
export const PAINT_RGB: ReadonlyArray<readonly [number, number, number]> = (() => {
  const t: Array<readonly [number, number, number]> = [];
  for (let i = 0; i <= PAINT_MAX; i++) {
    const [r, g, b] = paintColor(i);
    t.push([r, g, b]);
  }
  return t;
})();

/**
 * 油漆 id → RGBA（WorldGen.cs:43948-44061 paintColor 逐行 1:1）。
 * 注意：深层漆(13-24)与浅层(1-12)在此表同 RGB——深/浅差异在渲染端 shader pass
 * （TileShader.cso 深层档 Pass14-25 低槽 ×0.4，见 applyPaintTint），负相漆 30 带半透明 alpha。
 * 未命中分支（0 与废弃 31）返回 Color.White（C# 原文 white 初值未改）。
 */
export function paintColor(color: number): readonly [number, number, number, number] {
  let r = 255, g = 255, b = 255, a = 255; // Color white = Color.White
  switch (color) {
    case 1: case 13: r = 255; g = 0; b = 0; break;
    case 2: case 14: r = 255; g = 127; b = 0; break;
    case 3: case 15: r = 255; g = 255; b = 0; break;
    case 4: case 16: r = 127; g = 255; b = 0; break;
    case 5: case 17: r = 0; g = 255; b = 0; break;
    case 6: case 18: r = 0; g = 255; b = 127; break;
    case 7: case 19: r = 0; g = 255; b = 255; break;
    case 8: case 20: r = 0; g = 127; b = 255; break;
    case 9: case 21: r = 0; g = 0; b = 255; break;
    case 10: case 22: r = 127; g = 0; b = 255; break;
    case 11: case 23: r = 255; g = 0; b = 255; break;
    case 12: case 24: r = 255; g = 0; b = 127; break;
    case 25: r = 75; g = 75; b = 75; break;      // BlackPaint（原版黑漆即深灰 75）
    case 26: r = 255; g = 255; b = 255; break;   // WhitePaint
    case 27: r = 175; g = 175; b = 175; break;   // GrayPaint
    case 28: r = 255; g = 178; b = 125; break;   // BrownPaint
    case 29: r = 25; g = 25; b = 25; break;      // ShadowPaint
    case 30: r = 200; g = 200; b = 200; a = 150; break; // NegativePaint（半透明）
    default: break;                              // 0/31 → White（C# 初值）
  }
  return [r, g, b, a];
}

/** 涂层 id → RGBA（WorldGen.cs:44063-44071 coatingColor）。1=荧光 2=隐形，其余透明。
 *  消费方 = 涂刷尘（paintCoatEffect :44114-44131 的 Dust 143 色） */
export function coatingColor(coating: number): readonly [number, number, number, number] {
  switch (coating) {
    case 1: return [235, 170, 255, 255];
    case 2: return [180, 245, 255, 255];
    default: return [0, 0, 0, 0]; // Color.Transparent
  }
}

/** 涂层 id（Item.paintCoating，Item.cs:120；SetDefaults :38471/:42387 赋值） */
export const enum PAINT_COAT {
  NONE = 0,
  /** 4668 夜明涂料（Illuminant Coating）→ fullbrightBlock/Wall 位 */
  ILLUMINANT = 1,
  /** 5344 回声涂料（Echo Coating）→ invisibleBlock/Wall 位 */
  ECHO = 2,
}

// ===================== 渲染消费（TileShader.cso SM2 字节码真值） =====================
//
// 原版油漆渲染管线：TilePaintSystemV2 把 tile/wall 贴图 bake 进 RenderTarget
// （PrepareTextureIfNecessary :31-56，SpriteBatch Immediate + PrepareShader），
// PrepareShader（TilePaintSystemV2.cs:69-82）置 leafHue* 参数后按
// ConvertPaintIdToTileShaderIndex（Main.cs:58064-58083）选 Main.tileShader
// （TileShader.cso，technique Technique1 共 45 pass）之一逐像素调制。
// bake 绘制恒 Color.White（:51）→ v0=(1,1,1,1)，各 pass 尾部 mul v0 为恒等，略。
// 反汇编：`node tools/disasm-fx.mjs ../terraria-assets/TileShader.cso <out>`
// （下述行号 = 反汇编文本 fxTile.txt 的行；反编译器约定：无后缀寄存器 = .x 复制，
//  cmp dst,s0,s1,s2 = s0>=0?s1:s2，目标通道与源 swizzle 按通道名配对）。
//
// 排序槽前导（Pass2-28/41-44 公共，fxTile :30-37）：
//   M=max(r,g) m=min(r,g)（:30-31）
//   hi  = M>=b ? M : b            = max3          （cmp r2.x :34）
//   midS= M>=b ? b : M            = min(max(r,g),b)（cmp r2.y :35）
//   lo  = min(midS, m)            = min3          （min r3.w :36）
//   ★ midS 是【部分排序】中位槽：只排 (r,g) 再与 b 一次 cmp——b 为严格最小通道时
//     midS=b=lo（非真中位）。黄 3/青 7/紫 11（及深层 15/19/23）的【第二满档通道】
//     吃此槽而非 hi（Pass4/8/12 :78/:160/:242 的 mov r0 取 r2.y），逐指令实证。
//
// ── paint id → pass 映射与公式（v0=1 归一域；L=0.4·lo）──────────────────────────
//   id     pass  fxTile        公式
//   0/31   0     Pass1 :13-22  恒等（31=废弃荧光漆归 0）
//   1-12   1-12  Pass2-13      槽位式（下表，浅层）：hi/avgS/midS/lo
//   13-24  13-24 Pass14-25     同槽位式（深层）：lo→L、avgS→avgD=(hi+L)/2
//   25     25    Pass26 :536-555  黑  = 0.15·(hi+lo) ×3
//   26     26    Pass27 :556-580  白  = (7hi+3lo)·0.1 × (2−0.5(hi+lo)) ×3
//   27     27    Pass28 :581-600  灰  = 0.5·(hi+lo) ×3
//   28     40    Pass41 :1321-1338 棕  = (hi, 0.7hi, 0.49hi)
//   29     41    Pass42 :1339-1358 暗影= 0.025·(hi+lo) ×3
//   30     42    Pass43 :1359-1377 负相= hi==0 ? c : 1−c（逐通道，共用 hi 门）
//   30墙   43    Pass44 :1378-1402 负相墙= max(hi==0 ? 2c : 1.5−2c, 0)（GetWallSettings
//                                   恒 UseWallShaderHacks，TreePaintSystemData.cs:399-402）
//   1-12*  28-39 Pass29-40      特判组：浅层槽位式 + 逐像素 hue/sat 门（applyPaintTintSpecial）
//   —      44    Pass45 :1403-1434 无消费方（ConvertPaintIdToTileShaderIndex 最大 43；
//                                   hue/sat 调试提取 pass，忽略）
//   浅层槽位（Pass2-13；深层同 id−12 槽位完全一致，Pass14-25 逐对核对）：
//     1红(hi,lo,lo)   2橙(hi,avgS,lo)   3黄(hi,midS,lo)   4青柠(avgS,hi,lo)
//     5绿(lo,hi,lo)   6蓝绿(lo,hi,avgS) 7青(lo,hi,midS)   8天蓝(lo,avgS,hi)
//     9蓝(lo,lo,hi)  10紫(avgS,lo,hi)  11紫罗兰(hi,lo,midS) 12粉(hi,lo,avgS)
//   （橙/青柠/蓝绿/天蓝/紫/粉的 0.5 档 = (hi+lo)/2，即油漆 RGB 的 127/255 槽；
//    深层 0.5 档 = (hi+0.4lo)/2，Pass15/17/19/21/23/25 的 mad+mul 分解逐指令核对）
//
// ★ 与旧自造乘色模型（c·p>>8，2026-08-20 前本函数）的差异：全部非恒等 pass 数值都变
//   （乘色 → min/max 排序槽调制）；白漆 26 从恒等变为提亮曲线；负相 30 黑像素守卫
//   （旧模型纯黑→纯白，原版保持黑）；深层 13-24 从"同浅层"变为低槽 ×0.4 增强饱和。
//
// ★ 等价边界（登记）：
//   1. 特判组 pass 28-39 的 per-tile-type 设置表已 1:1 落地（SPECIAL_PAINT_SETTINGS +
//      getTilePaintSettings，见下节），chunk 烘焙路径（ChunkCache.tintRegion）已按
//      tile type 分发特判组/普通组（2026-08-20 接线）。★SW-FX12（2026-09-10）：树冠/
//      树枝/棕榈冠（Tree_Tops/Branches，WindSway 摆动层+第四遍外扩遍，不进烘焙）的
//      getTreeFoliageSettings 特判组已在 VanillaTiler.drawTreeCell 接线——foliageIndex
//      = 冠贴图序号（crown），foliageStyle 恒 0（棕榈 = 沙型），绘制时源染色同真值。
//   2. 已接线：ChunkCache.tintRegion 以本函数逐像素替换旧 multiply 乘色合成
//      （ImageData 循环；fround 序与 UNORM 取整在函数内做，循环只搬运字节）。
//   3. 精度：逐指令按 f32 寄存器序模拟（Math.fround）；老 ATI fp24 硬件与 fp32 存在
//      LSB 级差；写回按 UNORM8 最近偶取整兜底。
//   4. 涂层（paintCoating 1/2 → fullbright/invisible 位）已建（文件头）；涂层渲染不走
//      本 shader 域（原版涂层在 tileLight/可见性门，TileDrawing.cs:6727-6731/:1434-1452）。

/** float32 一步舍入（SM2 寄存器精度——逐指令镜像字节码运算序） */
const fr32 = Math.fround;

/** UNORM 写回：clamp [0,1] → ×255 最近偶取整（渲染目标 8bit 量化；
 *  f32 运算噪声通常先破坏平手值，此为确定性兜底，与 GPU 至多差 1 LSB） */
function unorm8(x: number): number {
  const c = (x < 0 ? 0 : x > 1 ? 1 : x) * 255;
  const fl = Math.floor(c);
  const d = c - fl;
  return d < 0.5 ? fl : d > 0.5 ? fl + 1 : fl + (fl % 2 === 0 ? 0 : 1);
}

/** ConvertPaintIdToTileShaderIndex（Main.cs:58064-58083 逐行 1:1）：
 *  paint → TileShader.cso Technique1.Passes[] 序号（0 起，Pass1=0）。
 *  isUsedForPaintingGrass=特判组（TreePaintingSettings.UseSpecialGroups）；
 *  useWallShaderHacks=墙 bake 恒 true（TreePaintSystemData.cs:399-402）。 */
export function convertPaintIdToTileShaderIndex(
  paintIndexOnTile: number, isUsedForPaintingGrass: boolean, useWallShaderHacks: boolean,
): number {
  if (paintIndexOnTile === 31) return 0;                        // :58068-58071
  if (paintIndexOnTile === 30 && useWallShaderHacks) return 43; // :58072-58075
  if (paintIndexOnTile >= 28) return paintIndexOnTile + 12;     // :58076-58079 棕/暗影/负相
  if (isUsedForPaintingGrass && paintIndexOnTile >= 1 && paintIndexOnTile <= 12) {
    return paintIndexOnTile + 27;                               // :58080-58083 特判组
  }
  return paintIndexOnTile;                                      // 0-27 直映
}

/**
 * 油漆像素调制：把 tile 原色 (r,g,b) 按 paint id 调制，返回新的 [r,g,b]。
 * TileShader.cso SM2 字节码逐指令译出（公式总表与行号见本节头注释）。
 * isWall=true 走负相墙档 Pass44（GetWallShaderHacks；其余 paint 墙/瓦片同 pass）。
 * paint 0/31（废弃荧光）/越界 → 恒等（Pass1）。
 */
export function applyPaintTint(
  r: number, g: number, b: number, paint: number, isWall = false,
): readonly [number, number, number] {
  if (paint <= 0 || paint > 30) return [r, g, b]; // Pass1 :13-22（texld×v0 恒等）
  const rf = fr32(r / 255), gf = fr32(g / 255), bf = fr32(b / 255); // texld r0（UNORM→f32）
  // 排序槽前导（Pass41/43/44 用两条 max 求 hi，值同；midS/lo 仅 2-28 消费）
  const mMax = Math.max(rf, gf);            // max r1.x :30
  const mMin = Math.min(gf, rf);            // min r1.y :31
  const hi = mMax >= bf ? mMax : bf;        // cmp r2.x :34 = max3
  const midS = mMax >= bf ? bf : mMax;      // cmp r2.y :35 = min(max(r,g),b)
  const lo = Math.min(midS, mMin);          // min r3.w :36 = min3
  const sum = fr32(hi + lo);                // add r1.x :551/:573/:596（黑/白/灰/暗影分子）
  const avgS = fr32(sum * fr32(0.5));       // mul c0 0.5（浅层 0.5 档）
  const lowD = fr32(lo * fr32(0.4));        // mul c0 0.4（深层低槽，def c0 :272 等）
  const sumD = fr32(lowD + hi);             // mad r1.x, r2.w, c0, r0（mul-then-add 序）
  const avgD = fr32(sumD * fr32(0.5));      // 深层 0.5 档
  switch (paint) {
    case 1: return [unorm8(hi), unorm8(lo), unorm8(lo)];        // Pass2 :23-40 红
    case 2: return [unorm8(hi), unorm8(avgS), unorm8(lo)];      // Pass3 :41-63 橙
    case 3: return [unorm8(hi), unorm8(midS), unorm8(lo)];      // Pass4 :64-81 黄（g=midS）
    case 4: return [unorm8(avgS), unorm8(hi), unorm8(lo)];      // Pass5 :82-104 青柠
    case 5: return [unorm8(lo), unorm8(hi), unorm8(lo)];        // Pass6 :105-122 绿
    case 6: return [unorm8(lo), unorm8(hi), unorm8(avgS)];      // Pass7 :123-145 蓝绿
    case 7: return [unorm8(lo), unorm8(hi), unorm8(midS)];      // Pass8 :146-163 青（b=midS）
    case 8: return [unorm8(lo), unorm8(avgS), unorm8(hi)];      // Pass9 :164-186 天蓝
    case 9: return [unorm8(lo), unorm8(lo), unorm8(hi)];        // Pass10 :187-204 蓝
    case 10: return [unorm8(avgS), unorm8(lo), unorm8(hi)];     // Pass11 :205-227 紫
    case 11: return [unorm8(hi), unorm8(lo), unorm8(midS)];     // Pass12 :228-245 紫罗兰（b=midS）
    case 12: return [unorm8(hi), unorm8(lo), unorm8(avgS)];     // Pass13 :246-268 粉
    case 13: return [unorm8(hi), unorm8(lowD), unorm8(lowD)];   // Pass14 :269-287 深红
    case 14: return [unorm8(hi), unorm8(avgD), unorm8(lowD)];   // Pass15 :288-310 深橙
    case 15: return [unorm8(hi), unorm8(midS), unorm8(lowD)];   // Pass16 :311-332 深黄（g=midS）
    case 16: return [unorm8(avgD), unorm8(hi), unorm8(lowD)];   // Pass17 :333-356 深青柠
    case 17: return [unorm8(lowD), unorm8(hi), unorm8(lowD)];   // Pass18 :357-376 深绿
    case 18: return [unorm8(lowD), unorm8(hi), unorm8(avgD)];   // Pass19 :377-400 深蓝绿
    case 19: return [unorm8(lowD), unorm8(hi), unorm8(midS)];   // Pass20 :401-422 深青（b=midS）
    case 20: return [unorm8(lowD), unorm8(avgD), unorm8(hi)];   // Pass21 :423-446 深天蓝
    case 21: return [unorm8(lowD), unorm8(lowD), unorm8(hi)];   // Pass22 :447-466 深蓝
    case 22: return [unorm8(avgD), unorm8(lowD), unorm8(hi)];   // Pass23 :467-490 深紫
    case 23: return [unorm8(hi), unorm8(lowD), unorm8(midS)];   // Pass24 :491-512 深紫罗兰（b=midS）
    case 24: return [unorm8(hi), unorm8(lowD), unorm8(avgD)];   // Pass25 :513-535 深粉
    case 25: { // Pass26 :536-555 黑：0.15(hi+lo)
      const v = unorm8(fr32(sum * fr32(0.15)));
      return [v, v, v];
    }
    case 26: { // Pass27 :556-580 白：(7hi+3lo)·0.1 × (2−0.5(hi+lo))——提亮曲线非恒等!
      const A = fr32(fr32(fr32(hi * 7) + fr32(lo * 3)) * fr32(0.1)); // c1=(3,7,0.1) :572-575
      const B = fr32(fr32(sum * -0.5) + 2);                          // c0=(0.5,2) :576
      const v = unorm8(fr32(A * B));
      return [v, v, v];
    }
    case 27: { // Pass28 :581-600 灰：0.5(hi+lo)（= avgS 同式）
      const v = unorm8(avgS);
      return [v, v, v];
    }
    case 28: // Pass41 :1321-1338 棕：(hi, 0.7hi, 0.49hi)（c0=(0,0.7,0.49)，只吃 hi 不吃 lo）
      return [unorm8(hi), unorm8(fr32(hi * fr32(0.7))), unorm8(fr32(hi * fr32(0.49)))];
    case 29: { // Pass42 :1339-1358 暗影：0.025(hi+lo)
      const v = unorm8(fr32(sum * fr32(0.025)));
      return [v, v, v];
    }
    case 30: { // Pass43 :1359-1377 / Pass44 :1378-1402
      if (isWall) { // 墙档：max(hi==0 ? 2c : 1.5−2c, 0)
        const w = (c: number) => unorm8(Math.max(
          hi === 0 ? fr32(c + c) : fr32(fr32(0.75) + fr32(c * -2)), 0));
        return [w(rf), w(gf), w(bf)];
      }
      // 瓦片档：hi==0（纯黑）守卫——黑像素保持黑（透明边/描线不反白）
      return [
        hi === 0 ? r : unorm8(fr32(1 - rf)),
        hi === 0 ? g : unorm8(fr32(1 - gf)),
        hi === 0 ? b : unorm8(fr32(1 - bf)),
      ];
    }
    default:
      return [r, g, b]; // 不可达（顶部门 1-30；TS 穷尽性兜底）
  }
}

/** 特判组（叶色相）pass 参数——TreePaintingSettings 字段映射
 *  （TilePaintSystemV2.cs:72-77 置 leafHue* 五参；每 type/style 取值见
 *  TreePaintSystemData.cs:16-243，墙恒 DefaultNoSpecialGroups_ForWalls :10-14）。 */
export interface LeafPaintSettings {
  /** leafHueTestOffset（HueTestOffset；CullMud/PalmTreeCrimson = 0.5） */
  hueTestOffset: number;
  /** leafMinHue / leafMaxHue（SpecialGroupMinimal/MaximumHueValue） */
  minHue: number;
  maxHue: number;
  /** leafMinSat / leafMaxSat（SpecialGroupMinimum/MaximumSaturationValue） */
  minSat: number;
  maxSat: number;
  /** invertSpecialGroupResult（InvertSpecialGroupResult） */
  invert: boolean;
}

/**
 * 特判组油漆调制（Pass29-40 = 浅层槽位式 + 逐像素 hue/sat 门，fxTile :601-1320）。
 * ConvertPaintIdToTileShaderIndex 特判支仅覆盖 paint 1-12（:58080-58083）——
 * 其余 id 直接回落普通 applyPaintTint（含深层 13-24：特判组不吃深层，原版语义）。
 * 门为假 → 返回原色（cmp r0.xyz, -r1, r0, r4 :655 选中支）。
 */
export function applyPaintTintSpecial(
  r: number, g: number, b: number, paint: number, s: LeafPaintSettings,
): readonly [number, number, number] {
  if (paint < 1 || paint > 12) return applyPaintTint(r, g, b, paint);
  const rf = fr32(r / 255), gf = fr32(g / 255), bf = fr32(b / 255);
  const lo = Math.min(rf, gf, bf);   // min r1.w/r2.w :610-611
  const hi = Math.max(rf, gf, bf);   // max r1.x/r2.x :612-613
  const delta = fr32(hi - lo);       // add r1.x, -r2.w, r2 :614
  let hue = 0, sat = 0;              // cmp -r1（−Δ²≥0 ⟺ Δ==0）:625/:632 → 灰度像素归零
  if (delta !== 0) {
    const invD = fr32(1 / delta);    // rcp r1.y :615
    // 三扇区色相（HSV 基数 R:+6(≡0,负值归一) G:+2 B:+4；:616-621 通道配对后 r1.w/z/y）
    const secR = fr32(fr32(fr32(gf - bf) * invD) + 6); // (g−b)/Δ
    const secG = fr32(fr32(fr32(bf - rf) * invD) + 2); // (b−r)/Δ
    const secB = fr32(fr32(fr32(rf - gf) * invD) + 4); // (r−g)/Δ
    // 达标指示（c−hi ≥ 0 ⟺ c==max，并列取大 hue；:622 add + :626 cmp）→ 三选一（:628-629 max 链）
    const hue6 = Math.max(
      bf >= hi ? secB : 0,
      Math.max(gf >= hi ? secG : 0, rf >= hi ? secR : 0),
    );
    const t = fr32(hue6 * fr32(1 / 6)); // mul c6.w=1/6 :630
    hue = fr32(t - Math.floor(t));      // frc :631
    sat = fr32(delta * fr32(1 / hi));   // rcp r2 :623 + mul :624 = Δ/hi（HSV 饱和度）
  }
  // hue + hueTestOffset 的【带符号回绕】（:636-640）：≥0 取 frc(x)，<0 取 −frc(|x|)
  // （≠数学 frc：负侧映射到 (−1,0)，使窗比较可跨 0 环两侧取值）
  const off = fr32(hue + s.hueTestOffset);
  const huep = off >= 0
    ? fr32(off - Math.floor(off))
    : -fr32(Math.abs(off) - Math.floor(Math.abs(off)));
  // 四门全闭区间（:633-644 均为 ≥0 判据）：hue∈[min,max] ∧ sat∈[min,max]
  const match = fr32(huep - s.minHue) >= 0 && fr32(s.maxHue - huep) >= 0
    && fr32(sat - s.minSat) >= 0 && fr32(s.maxSat - sat) >= 0;
  const flag = s.invert ? !match : match; // cmp −c5 :645-646
  return flag ? applyPaintTint(r, g, b, paint) : [r, g, b];
}

// ===================== 特判组 per-type 设置表（TreePaintSystemData.cs 1:1） =====================
//
// TreePaintingSettings 字段（TreePaintingSettings.cs:7-21）：C# 数值字段缺省 0 / bool 缺省
// false——表内未写字段即 0/false。常量一律 f32 化（C# f 后缀单精度，与 shader 常量同域；
// applyPaintTintSpecial 的门比较在 f32 域逐指令镜像，表值预 f32 保证减法双操作数精确）。
//
// 渲染侧分发判据（ConvertPaintIdToTileShaderIndex Main.cs:58064-58083，已核实）：
//   走特判 pass(28-39) ⟺ paint∈[1,12] ∧ 该 tile 在 GetTileSettings 表内
//   （isUsedForPaintingGrass=settings.UseSpecialGroups）【两条件都成立】。
//   深层 13-24 / 25-30 一律普通组（:58076-58079 先行拦截 >=28；13-24 不入 :58080 窗）；
//   墙恒 GetWallSettings → DefaultNoSpecialGroups_ForWalls（无特判组 + 墙 hack）。

/** 表项完整形状 = LeafPaintSettings 五参 + UseSpecialGroups/UseWallShaderHacks 两开关 */
export interface TreePaintingSettings extends LeafPaintSettings {
  /** UseSpecialGroups：true 才有特判组行为（DefaultNoSpecialGroups = false → 普通组） */
  useSpecialGroups: boolean;
  /** UseWallShaderHacks：仅墙档为 true（paint30 → Pass44）；tile/foliage 恒 false */
  useWallShaderHacks: boolean;
}

/** 表项构造：特判组成员 UseSpecialGroups 恒 true、UseWallShaderHacks 恒 false（两 C# 缺省） */
const leaf = (hueMin: number, hueMax: number, satMin: number, satMax: number, invert = false, off = 0): TreePaintingSettings => ({
  useSpecialGroups: true, useWallShaderHacks: false,
  hueTestOffset: fr32(off), minHue: fr32(hueMin), maxHue: fr32(hueMax),
  minSat: fr32(satMin), maxSat: fr32(satMax), invert,
});

/** 特判组具名设置 24 项（TreePaintSystemData.cs:16-245 逐字段 1:1；行号锚见各条。
 *  全类 26 项 = 本 24 + DefaultNoSpecialGroups(:5-8,null 哨兵) + ForWalls(:10-14,WALL_PAINT_SETTINGS)） */
export const SPECIAL_PAINT_SETTINGS = {
  DefaultDirt: leaf(0.03, 0.08, 0.38, 0.53, true),                     // :16-24
  CullMud: leaf(0.42, 0.55, 0.2, 0.27, true, 0.5),                     // :26-35
  WoodPurity: leaf(1 / 6, 5 / 6, 0, 1),                                // :37-44
  WoodCorruption: leaf(0.5, 1, 0.27, 1),                               // :46-53
  WoodJungle: leaf(1 / 6, 5 / 6, 0, 1),                                // :55-62
  WoodHallow: leaf(0, 1, 0, 0.34, true),                               // :64-72
  WoodSnow: leaf(0, 5 / 72, 0, 1),                                     // :74-81
  WoodCrimson: leaf(1 / 3, 2 / 3, 0, 1, true),                         // :83-91
  WoodJungleUnderground: leaf(1 / 6, 5 / 6, 0, 1),                     // :93-100
  WoodGlowingMushroom: leaf(0.5, 5 / 6, 0, 1),                         // :102-109
  VanityCherry: leaf(5 / 6, 1, 0, 1),                                  // :111-118
  VanityYellowWillow: leaf(0, 0.025, 0, 1, true),                      // :120-128
  TreeAsh: leaf(0, 0.025, 0, 1, true),                                 // :130-138
  GemTreeRuby: leaf(0, 1, 0, 0.0027777778, true),                      // :140-148
  GemTreeAmber: leaf(0, 1, 0, 0.0027777778, true),                     // :150-158
  GemTreeSapphire: leaf(0, 1, 0, 0.0027777778, true),                  // :160-168
  GemTreeEmerald: leaf(0, 1, 0, 0.0027777778, true),                   // :170-178
  GemTreeAmethyst: leaf(0, 1, 0, 0.0027777778, true),                  // :180-188
  GemTreeTopaz: leaf(0, 1, 0, 0.0027777778, true),                     // :190-198
  GemTreeDiamond: leaf(0, 1, 0, 0.0027777778, true),                   // :200-208
  PalmTreePurity: leaf(11 / 72, 0.25, 0.88, 1),                        // :210-217
  PalmTreeCorruption: leaf(0, 1, 0.4, 1),                              // :219-226
  PalmTreeCrimson: leaf(1 / 3, 19 / 36, 0, 1, false, 0.5),             // :228-236
  PalmTreeHallow: leaf(0.5, 11 / 18, 0, 1),                            // :238-245
} as const;

/** 墙档（GetWallSettings :399-402 恒 DefaultNoSpecialGroups_ForWalls :10-14）：
 *  无特判组 + UseWallShaderHacks=true（paint30 → Pass44 墙档陡化反转）。
 *  本仓以 tintRegion 的 isWall 参数实现该唯一行为差异（applyPaintTint :271-275），
 *  表对象仅作 1:1 存档。GetCageTopSettings（:247-250）= DefaultNoSpecialGroups → 普通组。 */
export const WALL_PAINT_SETTINGS: TreePaintingSettings = {
  useSpecialGroups: false, useWallShaderHacks: true,
  hueTestOffset: 0, minHue: 0, maxHue: 0, minSat: 0, maxSat: 0, invert: false,
};

/** GetTileSettings（TreePaintSystemData.cs:252-324 逐分支 1:1）。
 *  tileType = 原版 tile id（本仓 TILE_DEFS[type].vanilla.sheet 同值）；
 *  tileStyle 仅 5/323 消费（原版 GetTileDrawTexture 装配 TileDrawing.cs:1460-1478，
 *  其余类型恒 0）。返回 null = default 分支 DefaultNoSpecialGroups（:256-257）→ 普通组。 */
export function getTilePaintSettings(tileType: number, tileStyle = 0): TreePaintingSettings | null {
  switch (tileType) {
    case 0: case 2: case 23: case 109: case 199: case 477: case 492: case 633:
      return SPECIAL_PAINT_SETTINGS.DefaultDirt;                    // :258-266 泥面八型
    case 59: case 60: case 70:
      return SPECIAL_PAINT_SETTINGS.CullMud;                        // :267-269
    case 5:
      switch (tileStyle) {
        case 0: return SPECIAL_PAINT_SETTINGS.WoodCorruption;       // :274
        case 1: return SPECIAL_PAINT_SETTINGS.WoodJungle;           // :275
        case 2: return SPECIAL_PAINT_SETTINGS.WoodHallow;           // :276
        case 3: return SPECIAL_PAINT_SETTINGS.WoodSnow;             // :277
        case 4: return SPECIAL_PAINT_SETTINGS.WoodCrimson;          // :278
        case 5: return SPECIAL_PAINT_SETTINGS.WoodJungleUnderground; // :279
        case 6: return SPECIAL_PAINT_SETTINGS.WoodGlowingMushroom;  // :280
        default: return SPECIAL_PAINT_SETTINGS.WoodPurity;          // :281（含 -1）
      }
    case 323:
      switch (tileStyle) {
        case 0: case 4: return SPECIAL_PAINT_SETTINGS.PalmTreePurity;    // :288-290
        case 1: case 5: return SPECIAL_PAINT_SETTINGS.PalmTreeCrimson;   // :291-293
        case 2: case 6: return SPECIAL_PAINT_SETTINGS.PalmTreeHallow;    // :294-296
        case 3: case 7: return SPECIAL_PAINT_SETTINGS.PalmTreeCorruption; // :297-299
        default: return SPECIAL_PAINT_SETTINGS.WoodPurity;               // :286-287
      }
    case 587: return SPECIAL_PAINT_SETTINGS.GemTreeRuby;      // :301-302
    case 588: return SPECIAL_PAINT_SETTINGS.GemTreeDiamond;   // :303-304
    case 584: return SPECIAL_PAINT_SETTINGS.GemTreeAmethyst;  // :305-306
    case 583: return SPECIAL_PAINT_SETTINGS.GemTreeTopaz;     // :307-308
    case 585: return SPECIAL_PAINT_SETTINGS.GemTreeSapphire;  // :309-310
    case 586: return SPECIAL_PAINT_SETTINGS.GemTreeEmerald;   // :311-312
    case 589: return SPECIAL_PAINT_SETTINGS.GemTreeAmber;     // :313-314
    case 595: case 596: return SPECIAL_PAINT_SETTINGS.VanityCherry;       // :315-317
    case 615: case 616: return SPECIAL_PAINT_SETTINGS.VanityYellowWillow; // :318-320
    case 634: return SPECIAL_PAINT_SETTINGS.TreeAsh;                      // :321-322
    default: return null;                                     // :256-257 DefaultNoSpecialGroups
  }
}

/** GetTreeFoliageSettings（TreePaintSystemData.cs:326-397 逐分支 1:1）——树冠/树枝
 *  （Tree_Tops/Tree_Branches 贴图）专用；★default 分支 = DefaultDirt（:330-331，非
 *  普通组！）。本仓树冠不进 chunk 烘焙（Renderer/WindSway overlay 逐帧画），此表
 *  消费点 = VanillaTiler.drawTreeCell 冠/枝 blit（SW-FX12 2026-09-10 接线）。foliageStyle 仅 15/21（棕榈）消费。 */
export function getTreeFoliageSettings(foliageIndex: number, foliageStyle: number): TreePaintingSettings {
  const palm = (style: number): TreePaintingSettings => {
    switch (style) {
      case 0: case 4: return SPECIAL_PAINT_SETTINGS.PalmTreePurity;    // :347-348
      case 1: case 5: return SPECIAL_PAINT_SETTINGS.PalmTreeCrimson;   // :349-350
      case 2: case 6: return SPECIAL_PAINT_SETTINGS.PalmTreeHallow;    // :351-352
      case 3: case 7: return SPECIAL_PAINT_SETTINGS.PalmTreeCorruption; // :353-354
      default: return SPECIAL_PAINT_SETTINGS.WoodPurity;               // :345-346
    }
  };
  switch (foliageIndex) {
    case 0: case 6: case 7: case 8: case 9: case 10:
      return SPECIAL_PAINT_SETTINGS.WoodPurity;             // :333-338
    case 15: case 21: return palm(foliageStyle);            // :339-357
    case 2: case 11: case 13:
      return SPECIAL_PAINT_SETTINGS.WoodJungle;             // :358-361
    case 1: return SPECIAL_PAINT_SETTINGS.WoodCorruption;   // :362-363
    case 3: case 19: case 20:
      return SPECIAL_PAINT_SETTINGS.WoodHallow;             // :364-367
    case 4: case 12: case 16: case 17: case 18:
      return SPECIAL_PAINT_SETTINGS.WoodSnow;               // :368-373
    case 5: return SPECIAL_PAINT_SETTINGS.WoodCrimson;      // :374-375
    case 14: return SPECIAL_PAINT_SETTINGS.WoodGlowingMushroom; // :376-377
    case 22: return SPECIAL_PAINT_SETTINGS.GemTreeTopaz;    // :378-379
    case 23: return SPECIAL_PAINT_SETTINGS.GemTreeAmethyst; // :380-381
    case 24: return SPECIAL_PAINT_SETTINGS.GemTreeSapphire; // :382-383
    case 25: return SPECIAL_PAINT_SETTINGS.GemTreeEmerald;  // :384-385
    case 26: return SPECIAL_PAINT_SETTINGS.GemTreeRuby;     // :386-387
    case 27: return SPECIAL_PAINT_SETTINGS.GemTreeDiamond;  // :388-389
    case 28: return SPECIAL_PAINT_SETTINGS.GemTreeAmber;    // :390-391
    case 29: return SPECIAL_PAINT_SETTINGS.VanityCherry;    // :392-393
    case 30: return SPECIAL_PAINT_SETTINGS.VanityYellowWillow; // :394-395
    default: return SPECIAL_PAINT_SETTINGS.DefaultDirt;     // :330-331
  }
}

/**
 * 小地图油漆换色（Terraria.Map/MapHelper.cs:1812-1863 MapColor 逐行 1:1）。
 * isWall = 该 map 条目是墙（原版以 type ∈ [wallRangeStart, wallRangeEnd] 判定，:1841）。
 * 注意 num3 经两次交换后是【中间通道】而非最小（:1818-1829 交换序）。
 */
export function mapPaintColor(
  isWall: boolean, rgb: readonly [number, number, number], colorType: number,
): readonly [number, number, number] {
  const color = paintColor(colorType); // :1814
  let num = rgb[0] / 255, num2 = rgb[1] / 255, num3 = rgb[2] / 255; // :1815-1817
  if (num2 > num) { const t = num; num = num2; num2 = t; } // :1818-1823
  if (num3 > num) { const t = num; num = num3; num3 = t; } // :1824-1829
  let or_ = rgb[0], og = rgb[1], ob = rgb[2];
  switch (colorType) {
    case 29: { // ShadowPaint :1832-1839
      const num7 = num3 * 0.3;
      or_ = (color[0] * num7) | 0; og = (color[1] * num7) | 0; ob = (color[2] * num7) | 0;
      break;
    }
    case 30: // NegativePaint :1840-1853
      if (isWall) {
        or_ = ((255 - rgb[0]) * 0.5) | 0; og = ((255 - rgb[1]) * 0.5) | 0; ob = ((255 - rgb[2]) * 0.5) | 0;
      } else {
        or_ = 255 - rgb[0]; og = 255 - rgb[1]; ob = 255 - rgb[2];
      }
      break;
    default: { // 普通漆/深层/黑白灰棕 :1854-1861——按最大通道缩放油漆色
      const num6 = num;
      or_ = (color[0] * num6) | 0; og = (color[1] * num6) | 0; ob = (color[2] * num6) | 0;
      break;
    }
  }
  return [or_, og, ob];
}

/** paint id → css 颜色（小地图 LUT / 调试用） */
export function paintCss(paint: number): string {
  const [r, g, b] = paintColor(paint);
  return `rgb(${r},${g},${b})`;
}

// ===================== 涂刷原语（WorldGen.cs 1:1） =====================

/** paintEffect（WorldGen.cs:44091-44112）的尘效钩子：newPaint==0 时用 oldColor 取色。
 *  实现：10 颗尘（DustID 143），一半 noGravity scale*1.2、一半 scale*0.5。
 *  Game 侧接 spawnParticles；null = 无尘（测试/生成期） */
export type PaintDustHook = (x: number, y: number, newPaint: number, oldPaint: number) => void;

export interface PaintableStore {
  paint: Uint8Array;
  paintWall: Uint8Array;
  wall: Uint16Array;
  flags: Uint8Array;
  setPaint(x: number, y: number, v: number): void;
  setPaintWall(x: number, y: number, v: number): void;
  inBounds(x: number, y: number): boolean;
  idx(x: number, y: number): number;
}

/** 涂层读写视图（TileStore 满足；coat 位编码 = WF:1539-1552，掩码见 TileStore.COAT_*） */
export interface CoatableStore extends PaintableStore {
  coat: Uint8Array;
  setCoat(x: number, y: number, mask: number, bits: number): void;
}

/**
 * WorldGen.paintTile（WorldGen.cs:44137-44159）逐行 1:1：
 * 非活性格 / 已同色 → false（不消耗油漆，Player.ApplyPaint :41357 同守卫）；
 * 尘效先于写入（:44149-44152），写 color 后广播（单机无 netMode）。
 */
export function paintTile(
  st: PaintableStore, x: number, y: number, color: number, dust: PaintDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false; // Main.tile[x,y] 越界等价（C# null 检查）
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;                 // :44140 !tile.active()
  const b = st.paint[i];                          // :44144 tile.color()
  if (b === color) return false;                  // :44145-44148
  if (dust) dust(x, y, color, b);                 // :44149-44152 paintEffect
  st.setPaint(x, y, color);                       // :44153 tile.color(color)
  return true;
}

/** WorldGen.paintWall（WorldGen.cs:44257-44279）逐行 1:1（写入先于尘效，与 paintTile 反序） */
export function paintWall(
  st: PaintableStore, x: number, y: number, color: number, dust: PaintDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (st.wall[i] === 0) return false;             // :44260 tile.wall == 0
  const b = st.paintWall[i];                      // :44264 tile.wallColor()
  if (b === color) return false;                  // :44265-44268
  st.setPaintWall(x, y, color);                   // :44269 tile.wallColor(color)
  if (dust) dust(x, y, color, b);                 // :44274-44277 paintEffect
  return true;
}

/** paintEffect（WorldGen.cs:44091-44112）：色 0 时回退旧色取 dust 色 */
export function paintDustColor(newPaint: number, oldPaint: number): readonly [number, number, number, number] {
  return paintColor(newPaint === 0 ? oldPaint : newPaint); // :44093-44097
}

// ===================== 涂层涂刷原语（WorldGen.cs 1:1） =====================

/** coatingColors（WorldGen.cs:44073-44089）：取该格既有涂层色列表（尘效回退用）。
 *  block=true 方块侧（fullbrightBlock/invisibleBlock），false 墙侧。顺序 = 先荧光后隐形 */
export function coatingColorsOf(coatBits: number, block: boolean): Array<readonly [number, number, number, number]> {
  const out: Array<readonly [number, number, number, number]> = [];
  const fullbright = block ? TileStoreCoat.BLOCK_FULLBRIGHT : TileStoreCoat.WALL_FULLBRIGHT;
  const invisible = block ? TileStoreCoat.BLOCK_INVISIBLE : TileStoreCoat.WALL_INVISIBLE;
  if (coatBits & fullbright) out.push(coatingColor(1));   // :44081-44083
  if (coatBits & invisible) out.push(coatingColor(2));    // :44085-44087
  return out;
}

/** TileStore.COAT_* 的本地镜像（避免 world/Paint ← → world/TileStore 循环 import；
 *  位值与 WorldFile.cs:1539-1552 存档位一致，TileStore 侧有断言测试锁定） */
const TileStoreCoat = {
  BLOCK_INVISIBLE: 2,
  WALL_INVISIBLE: 4,
  BLOCK_FULLBRIGHT: 8,
  WALL_FULLBRIGHT: 16,
} as const;

/**
 * WorldGen.paintCoatTile（WorldGen.cs:44161-44207）逐行 1:1：
 *   非活性格 → false（:44163-44166）；paintCoatId 0=双位清除（两位全空 → false :44169-44173，
 *   清后 SquareTileFrame :44174）；1=置荧光位（已置 → false :44176-44180）；
 *   2=置隐形位（已置 → false :44181-44186，置后 SquareTileFrame :44187）；
 *   其余 id → false（:44168 default）。原版 SquareTileFrame(resetFrame:false) 触发邻帧
 *   重算——涂层不改 framing，仓内等价 = store listeners（chunk 重烘）已由 setCoat 发出。
 *   broadcast（NetMessage 63 :44192-44194）单机无操作，仓内多人走 TileOp 通道（登记：
 *   paint 通道本就未接 netReporter，同域不扩）。
 *   尘效（:44197-44200 paintCoatEffect）经 coatDust 钩子（取色见 paintCoatDustColor）。
 */
export function paintCoatTile(
  st: CoatableStore, x: number, y: number, paintCoatId: number,
  coatDust: CoatDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false;           // Main.tile[x,y] null 检查等价
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;                 // :44163-44166 !tile.active()
  const coat = st.coat[i];
  const oldColors = coatingColorsOf(coat, true);  // :44167 尘效回退色（写入前取）
  const FB = TileStoreCoat.BLOCK_FULLBRIGHT, INV = TileStoreCoat.BLOCK_INVISIBLE;
  switch (paintCoatId) {
    case 0: { // :44169-44175
      if (!(coat & FB) && !(coat & INV)) return false;
      st.setCoat(x, y, FB | INV, 0);
      break;
    }
    case 1: // :44176-44180
      if (coat & FB) return false;
      st.setCoat(x, y, FB, FB);
      break;
    case 2: { // :44181-44187
      if (coat & INV) return false;
      st.setCoat(x, y, INV, INV);
      break;
    }
    default:
      return false;                               // :44168
  }
  if (coatDust) coatDust(x, y, paintCoatDustColor(paintCoatId, oldColors)); // :44197-44200
  return true;
}

/**
 * WorldGen.paintCoatWall（WorldGen.cs:44209-44255）逐行 1:1（墙版）：
 *   wall==0 → false（:44211-44214）；位域换 fullbrightWall/invisibleWall，其余同构。
 */
export function paintCoatWall(
  st: CoatableStore, x: number, y: number, paintCoatId: number,
  coatDust: CoatDustHook | null = null,
): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (st.wall[i] === 0) return false;             // :44211-44214 tile.wall == 0
  const coat = st.coat[i];
  const oldColors = coatingColorsOf(coat, false); // :44215
  const FB = TileStoreCoat.WALL_FULLBRIGHT, INV = TileStoreCoat.WALL_INVISIBLE;
  switch (paintCoatId) {
    case 0: { // :44217-44223
      if (!(coat & FB) && !(coat & INV)) return false;
      st.setCoat(x, y, FB | INV, 0);
      break;
    }
    case 1: // :44224-44228
      if (coat & FB) return false;
      st.setCoat(x, y, FB, FB);
      break;
    case 2: { // :44229-44235
      if (coat & INV) return false;
      st.setCoat(x, y, INV, INV);
      break;
    }
    default:
      return false;                               // :44216
  }
  if (coatDust) coatDust(x, y, paintCoatDustColor(paintCoatId, oldColors)); // :44245-44248
  return true;
}

/** paintCoatEffect（WorldGen.cs:44114-44131）取色侧：id 0（刮除）时随机回退旧涂层色，
 *  否则恒新涂层色（coatingColor）。仓内尘钩子按 rgba 取色，此处返回 RGBA。 */
export function paintCoatDustColor(
  paintCoatId: number, oldColors: Array<readonly [number, number, number, number]>,
): readonly [number, number, number, number] {
  if (paintCoatId === 0 && oldColors.length > 0) {   // :44120-44122
    return oldColors[Math.floor(Math.random() * oldColors.length)];
  }
  return coatingColor(paintCoatId);                  // :44119
}

/** paintCoatEffect 尘效钩子：坐标 + 已定尘色（RGBA）——Game 侧接 spawnParticles */
export type CoatDustHook = (x: number, y: number, color: readonly [number, number, number, number]) => void;
