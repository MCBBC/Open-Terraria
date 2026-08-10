// 原版图块通用渲染器：TEdit TileFraming.SelfFrame8Way 移植（8 向 47 项查找表）
// 用于 TileDef.vanilla.frame === 'auto' 的 1x1 实心块（泥土/矿石/冰雪等同表系）。
// 位序（与游戏 neighborMask 不同！）：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128
// 变体选择 (x*7 + y*11) % 3；无条目/越界回退默认帧 (1,1)
import type { SpriteAtlas, DrawRect } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_BY_KEY, TILE_DEFS } from '../data/tiles';
import { getUVForMasks } from './BlendFraming';

type Frame = [number, number];

// 47 项查找表（源：TEdit Render/TileFraming.cs BuildSelfFrame8WayLookup）
const LOOKUP: Record<number, Frame[]> = {
  0: [[9, 3], [10, 3], [11, 3]],
  1: [[6, 3], [7, 3], [8, 3]],
  2: [[12, 0], [12, 1], [12, 2]],
  3: [[15, 2]],
  4: [[9, 0], [9, 1], [9, 2]],
  5: [[13, 2]],
  6: [[6, 4], [7, 4], [8, 4]],
  7: [[14, 2]],
  8: [[6, 0], [7, 0], [8, 0]],
  9: [[5, 0], [5, 1], [5, 2]],
  10: [[15, 0]],
  11: [[15, 1]],
  12: [[13, 0]],
  13: [[13, 1]],
  14: [[14, 0]],
  15: [[14, 1]],
  19: [[1, 4], [3, 4], [5, 4]],
  23: [[16, 3]],
  27: [[17, 0]],
  31: [[13, 4]],
  37: [[0, 4], [2, 4], [4, 4]],
  39: [[17, 3]],
  45: [[16, 0]],
  47: [[12, 4]],
  55: [[1, 2], [2, 2], [3, 2]],
  63: [[6, 2], [7, 2], [8, 2]],
  74: [[1, 3], [3, 3], [5, 3]],
  75: [[17, 1]],
  78: [[16, 2]],
  79: [[13, 3]],
  91: [[4, 0], [4, 1], [4, 2]],
  95: [[11, 0], [11, 1], [11, 2]],
  111: [[17, 4]],
  127: [[14, 3]],
  140: [[0, 3], [2, 3], [4, 3]],
  141: [[16, 1]],
  142: [[17, 2]],
  143: [[12, 3]],
  159: [[16, 4]],
  173: [[0, 0], [0, 1], [0, 2]],
  175: [[10, 0], [10, 1], [10, 2]],
  191: [[15, 3]],
  206: [[1, 0], [2, 0], [3, 0]],
  207: [[6, 1], [7, 1], [8, 1]],
  223: [[14, 4]],
  239: [[15, 4]],
  255: [[1, 1], [2, 1], [3, 1]],
};

const DEFAULT_FRAME: Frame = [1, 1];

/** 8 向邻居掩码（vanilla 位序：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128） */
export function mask8(st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): number {
  const at = (ax: number, ay: number) => st.inBounds(ax, ay) && same(st.type[st.idx(ax, ay)]);
  let m = 0;
  if (at(x, y - 1)) m |= 1;    // U
  if (at(x - 1, y)) m |= 2;    // L
  if (at(x + 1, y)) m |= 4;    // R
  if (at(x, y + 1)) m |= 8;    // D
  // 角：两相邻正交邻也在时角才计入（vanilla BlockStyle 语义的简化）
  if ((m & 3) === 3 && at(x - 1, y - 1)) m |= 16;    // UL
  if ((m & 5) === 5 && at(x + 1, y - 1)) m |= 32;    // UR
  if ((m & 10) === 10 && at(x - 1, y + 1)) m |= 64;  // DL
  if ((m & 12) === 12 && at(x + 1, y + 1)) m |= 128; // DR
  return m;
}

/** auto 帧格的实际渲染帧（col,row）——与渲染端同一查找表，供纠错面板定位 */
export function autoFrameAt(st: TileStore, x: number, y: number, type: number): { col: number; row: number } {
  const entry = LOOKUP[mask8(st, x, y, type, (t) => t === type)];
  if (!entry) return { col: DEFAULT_FRAME[0], row: DEFAULT_FRAME[1] };
  const v = ((x * 7) + (y * 11)) % 3 % entry.length;
  return { col: entry[v][0], row: entry[v][1] };
}

/** 'auto' 帧：查表 + 变体。返回 (col,row) 或 null（回退默认帧由调用方处理） */
export function frameFor(atlas: SpriteAtlas, sheet: number, st: TileStore, x: number, y: number, type: number, same: (t: number) => boolean): DrawRect | null {
  const entry = LOOKUP[mask8(st, x, y, type, same)];
  let r: DrawRect | null = null;
  if (entry) {
    const v = entry[((x * 7) + (y * 11)) % 3 % entry.length];
    r = atlas.vframe(sheet, v[0], v[1]);
    if (r && !frameHasContent(r)) r = null; // 空帧（如草皮表缺 13-17 列的边缘帧）→ 回退
  }
  if (!r) r = atlas.vframe(sheet, DEFAULT_FRAME[0], DEFAULT_FRAME[1]);
  return r;
}

/** auto 帧内容检测缓存：key = 图像:像素偏移。查找表引用的帧在部分表（草皮族等
 *  窄表）上是空像素，直画会整格空白 → 检出后回退默认帧 */
const frameContentCache = new Map<string, boolean>();
function frameHasContent(r: DrawRect): boolean {
  const key = `${r.img.width}x${r.img.height}:${r.sx},${r.sy}`;
  const hit = frameContentCache.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const c = document.createElement('canvas');
    c.width = r.sw; c.height = r.sh;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
    const d = cx.getImageData(0, 0, r.sw, r.sh).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 16) { if (d[i] > 40 && ++n >= 4) { ok = true; break; } }
  } catch { ok = true; /* 采样失败按有内容处理 */ }
  frameContentCache.set(key, ok);
  return ok;
}

/** 树木专用渲染（tile 5，移植 TEdit WorldRenderXna 树逻辑）：
 *  - 树干帧（frameY < 198）：按树下草地生物群系选 Tiles_5_0..6 变体，取 (U,V,20,20) 压入 16px 格
 *  - 标记帧（frameX >= 22 且 frameY >= 198）：不采样 Tiles_5——
 *    U=22 树顶（Tree_Tops_style 80×80 底部锚定）、U=44 左枝（Tree_Branches 40×40 右锚定）、
 *    U=66 右枝（左锚定）；变体 x%3
 *  treeStyle 固定 0（wld 树样式段未解析，默认森林） */
// 树类 tile → Tree_Tops/Branches 样式（TEdit：5 森林 0 / 宝石树 583-589 → 22-28 /
// 装饰树 596 樱花→29、616 柳→30 / 灰烬树 634 → 31）
const TREE_SHEET_STYLES: Record<number, number> = { 5: 0, 596: 29, 616: 30, 634: 31 };
for (let i = 583; i <= 589; i++) TREE_SHEET_STYLES[i] = 22 + (i - 583);
/** 树冠帧尺寸按 PNG 实际宽度推导（3 变体等分 + 2px 间隔；高度 -2）：
 *  自动覆盖全部样式（森林 80×80 / 丛林·宝石 114-116×96 / 装饰 118×96 / 神圣 80-114×140） */
function treeTopSize(img: HTMLImageElement): [number, number] {
  return [Math.floor(img.width / 3) - 2, img.height - 2];
}
// 树下草地 → 生物群系树干变体（TEdit treeType；-1 = 基础 Tiles_5）
const TREE_GROUND: Array<[string, number]> = [
  ['v_23_corrupt_grass_block', 0],
  ['v_60_jungle_grass_block', 1],
  ['v_109_hallowed_grass_block', 2],
  ['snow', 3],
  ['v_199_crimson_grass_block', 4],
  ['v_70_mushroom_grass_block', 6],
];
/** 原版 WorldGen.GetCommonTreeFoliageData 样式选择移植（WorldGen.cs:37381-37496）。
 *  trees = { treeX, treeStyle(header), treeTops(v≥211 权威 13 变体), worldSurface, worldW }
 *  变体来源优先 treeTops（GetTreeStyle(areaId)），空表回退 header treeStyle[0..3] */
function areaStyle(trees: TreeStyleData, areaId: number): number {
  if (trees.treeTops?.length) return trees.treeTops[areaId] ?? 0;
  return trees.treeStyle?.[areaId] ?? 0;
}

export function crownStyleFor(x: number, treeType: number, floorY: number, trees: TreeStyleData): number {
  const gs = (id: number) => areaStyle(trees, id);
  switch (treeType) {
    case 0: return 1;   // 23 腐化草
    case 1: {           // 60 丛林草：v[5]==1 → 11；深处 → 13（覆盖）；否则 2
      let st = gs(5) === 1 ? 11 : 2;
      if (floorY > (trees.worldSurface ?? 0)) st = 13;
      return st;
    }
    case 2: {           // 109/492 神圣草：hallowBG 未解析 → 固定 3
      return 3;
    }
    case 3: {           // 147 雪原：完整 case-147 逻辑
      let st = 4;
      const v6 = gs(6);
      if (v6 === 0) { st = 12; if (x % 10 === 0) st = 18; }
      if (v6 === 2 || v6 === 3 || v6 === 32 || v6 === 4 || v6 === 42 || v6 === 5 || v6 === 7) {
        st = v6 % 2 !== 0
          ? (x <= (trees.worldW ?? 0) / 2 ? 17 : 16)
          : (x >= (trees.worldW ?? 0) / 2 ? 17 : 16);
      }
      return st;
    }
    case 4: return 5;   // 199 猩红草
    case 6: return 14;  // 70 蘑菇草
    default: {          // 2/477 普通草：四区 + 0→0/5→10/其余 5+s
      const num = x > (trees.treeX?.[0] ?? 0) ? (x > (trees.treeX?.[1] ?? 0) ? (x > (trees.treeX?.[2] ?? 0) ? gs(3) : gs(2)) : gs(1)) : gs(0);
      if (num === 0) return 0;
      return num === 5 ? 10 : 5 + num;
    }
  }
}

/** 向下扫描树下的草地定生物群系树型（原版 GetCommonTreeFoliageData 扫描）。
 *  返回 treeType（-1 普通草/森林）与发现草地的深度 floorY（丛林深处判定用） */
export function scanTreeType(st: TileStore, x: number, y: number): { type: number; floorY: number } {
  let type = -1;
  let floorY = y;
  for (let i = 0; i < 100; i++) {
    const ty = y + i;
    if (ty >= st.h) break;
    floorY = ty;
    const t = st.type[st.idx(x, ty)];
    if (t === 0) continue;
    if (t === TILE_BY_KEY['grass']) { type = -1; break; }
    const hit = TREE_GROUND.find(([k]) => TILE_BY_KEY[k] === t);
    if (hit) { type = hit[1]; break; }
  }
  return { type, floorY };
}

export interface TreeStyleData {
  treeX: number[];
  treeStyle: number[];
  treeTops?: number[];
  worldSurface?: number;
  worldW?: number;
}

export function drawTreeCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, fx: number, fy: number, px: number, py: number,
  sheet = 5,
  foliageOnly = false,
  trees?: TreeStyleData,
): void {
  const style = TREE_SHEET_STYLES[sheet] ?? 0;
  // 棕榈树（tile 323）：树冠帧藏在树干列内（frameX 88-132，无独立标记格）。
  //  TEdit：Tree_Tops_15（80×80、82px 步长），srcX = 变体×82、srcY = 沙型×82，
  //  底部锚定 + X 偏移 frameY/16 格；沙型 = 下方沙块种类（普通0/猩红1/珍珠2/腐化3）
  if (sheet === 323) {
    if (fx >= 88 && fx <= 132) {
      if (!foliageOnly) return; // 树冠/干身全部由外扩遍绘制（倾斜跨列/跨 chunk 防裁剪）
      const img15 = atlas.ensureVImage('vanilla/Tree_Tops_15.png');
      if (!img15) return;
      // 沙型：向下扫沙块
      let palmType = 0;
      for (let i = 0; i < 100; i++) {
        const ty = y + i;
        if (ty >= st.h) break;
        const t = st.type[st.idx(x, ty)];
        if (t === 0) continue;
        const tk = TILE_DEFS[t]?.key;
        palmType = tk === 'v_234_crimsand_block' ? 1 : tk === 'v_116_pearlsand_block' ? 2
          : tk === 'v_112_ebonsand_block' ? 3 : 0;
        break;
      }
      const v323 = Math.floor((fx - 88) / 22); // 0/1/2 变体
      const sx15 = v323 * 82, sy15 = palmType * 82;
      if (sx15 + 80 > img15.width || sy15 + 80 > img15.height) return;
      // 底部锚定居中 + X 偏移 = frameY【像素·有符号】（原版 dest.X += V*zoom/16，
      // zoom=16 即 V 像素；65534 = -2 的 u16 回绕）
      const leanCrown = fy >= 32768 ? fy - 65536 : fy;
      ctx.drawImage(img15, sx15, sy15, 80, 80,
        px + (TILE - 80) / 2 + leanCrown, py + TILE - 80, 80, 80);
      return;
    }
    // 干身（原版 TileDrawing case 323：20×20 帧 22px 步长，底部对齐；
    // frameY 是**有符号像素偏移**——棕榈树干随高度倾斜，65534 = -2 的 u16 回绕）
    const img323 = atlas.ensureVImage('vanilla/Tiles_323.png');
    if (!img323 || fx + 20 > img323.width) return;
    const lean = fy >= 32768 ? fy - 65536 : fy; // 原版 vector2.X += frameY
    const pad323 = treeFrameBottomPad(img323, fx, 0);
    const artH323 = 20 - pad323;
    ctx.drawImage(img323, fx, 0, 20, 20, px - 2 + lean, py + TILE - artH323, 20, 20);
    return;
  }
  // 蘑菇树（tile 72）：独立渲染路径——U≥36 标记帧 = 巨蘑菇顶（Shroom_Tops，60×42、62px 步长、底部锚定）
  if (sheet === 72) {
    if (foliageOnly === false && fx >= 36) return; // 顶格由外扩遍画
    if (fx >= 36) {
      const img72 = atlas.ensureVImage('vanilla/Shroom_Tops.png');
      if (img72 && fx + 60 <= img72.width && fy + 42 <= img72.height) {
        // TEdit：source.X = (V/18)*62；60×42 底部锚定居中
        const sx72 = Math.floor(fy / 18) * 62;
        if (sx72 + 60 <= img72.width) {
          ctx.drawImage(img72, sx72, 0, 60, 42, px + (TILE - 60) / 2, py + TILE - 42, 60, 42);
        }
      }
      return;
    }
    // 干身：Tiles_72 直取（54×54 表，2×2 帧 18px 网格）
    const img72 = atlas.ensureVImage('vanilla/Tiles_72.png');
    if (img72 && fx + 16 <= img72.width && fy + 16 <= img72.height) {
      ctx.drawImage(img72, fx, fy, 16, 16, px, py, TILE, TILE);
    }
    return;
  }
  if (fy >= 198) {   // 冠/枝标记帧（原版只看 frameY；fx 0/22=顶 44/66=枝）
    // 树冠/树枝标记帧（仅由 ChunkCache 的外扩遍绘制，防跨 chunk 裁剪）
    if (foliageOnly === false) return;
    // 变体来源 = 标记帧自身 frameY（原版 WorldGen.GetTreeFrame：198→0/220→1/242→2）
    const frame = fy >= 242 ? 2 : fy >= 220 ? 1 : 0;
    // 样式选择（原版 GetCommonTreeFoliageData；树族 tile 用固定样式映射）
    // 树型扫描列：左枝在右侧树干列找地 / 右枝在左侧（原版 xoffset）
    const scanX = x + (fx === 44 ? 1 : fx === 66 ? -1 : 0);
    const scan = scanTreeType(st, scanX, y);
    const crown = sheet === 5 && trees
      ? crownStyleFor(scanX, scan.type, scan.floorY, trees)
      : style;
    let img: HTMLImageElement | null;
    let sx = 0, sy = 0, sw = 0, sh = 0, anchor = 0; // 0=底中(顶) 1=右中(左枝) 2=左中(右枝)
    if (fx === 22 || fx === 0) {   // fx=0：1/13 概率的顶冠变体（TreePass 与原版一致）
      img = atlas.ensureVImage(`vanilla/Tree_Tops_${crown}.png`)
        ?? atlas.ensureVImage(`vanilla/Tree_Tops_${style}.png`) ?? null;
      if (!img) return;
      // 帧尺寸按 PNG 实宽推导（3 变体 + 2px 间隔），自动覆盖全部样式（含神圣 140 高）
      [sw, sh] = treeTopSize(img);
      sx = frame * (sw + 2); anchor = 0;
    } else {
      // 分叉枝（原版固定 40×40 帧、42px 步长；左枝 X=0 / 右枝 X=42；Y = frame*42）
      img = atlas.ensureVImage(`vanilla/Tree_Branches_${crown}.png`)
        ?? atlas.ensureVImage(`vanilla/Tree_Branches_${style}.png`) ?? null;
      if (!img) return;
      sw = 40; sh = 40;
      sx = fx === 44 ? 0 : 42;
      sy = frame * 42; anchor = fx === 44 ? 1 : 2;
    }
    if (sx + sw > img.width || sy + sh > img.height) return;
    let dx = px, dy = py;
    if (anchor === 0) { dx = px + (TILE - sw) / 2; dy = py + TILE - sh; }
    else if (anchor === 1) { dx = px + TILE - sw; dy = py + (TILE - sh) / 2; }
    else { dy = py + (TILE - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
    return;
  }
  if (foliageOnly) return; // 外扩遍只画树冠/树枝
  // 树干：TEdit baseX 奇偶修正（特殊帧横向偏一列扫草地）+ 100 格深扫描
  let baseX = 0;
  if (fx === 66 && fy <= 45) baseX++;
  if (fx === 88 && fy >= 66 && fy <= 110) baseX--;
  if (fx === 22 && fy >= 132 && fy < 198) baseX--;
  if (fx === 44 && fy >= 132 && fy < 198) baseX++;
  const type = scanTreeType(st, x + baseX, y).type;
  const img = type >= 0
    ? atlas.ensureVImage(`vanilla/Tiles_5_${type}.png`) ?? atlas.ensureVImage('vanilla/Tiles_5.png')
    : atlas.ensureVImage('vanilla/Tiles_5.png');
  if (!img) return;
  if (fx + 20 <= img.width && fy + 20 <= img.height) {
    // 水平：帧内美术像素占中间 16px（两侧 2px 透明边距），整体 -2 后精确落满本格
    // 垂直：各帧美术高度不一（满高 20 行 / 短帧仅顶部 16 行）——按实际美术高度
    // 底部对齐：满高帧向上溢出 4px 与上格交叠，短帧贴齐格底，任何上下组合都无缝
    const pad = treeFrameBottomPad(img, fx, fy);
    const artH = 20 - pad;
    ctx.drawImage(img, fx, fy, 20, 20, px - 2, py + TILE - artH, 20, 20);
  }
}

/** 树干帧底部透明行数（缓存）：扫描 20×20 区域最下方不透明行 */
const treePadCache = new Map<string, number>();
function treeFrameBottomPad(img: HTMLImageElement, fx: number, fy: number): number {
  const key = `${img.width}:${fx},${fy}`;
  const hit = treePadCache.get(key);
  if (hit !== undefined) return hit;
  let pad = 20;
  try {
    const c = document.createElement('canvas');
    c.width = 20; c.height = 20;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.drawImage(img, fx, fy, 20, 20, 0, 0, 20, 20);
    const d = cx.getImageData(0, 0, 20, 20).data;
    outer: for (let y = 19; y >= 0; y--) {
      for (let x = 0; x < 20; x++) {
        if (d[(y * 20 + x) * 4 + 3] > 40) { pad = 19 - y; break outer; }
      }
    }
  } catch { /* 跨域等异常时按满高处理 */ }
  treePadCache.set(key, pad);
  return pad;
}

/** 仙人掌渲染（tile 80，移植 TEdit WorldRenderXna 5467-5706）：
 *  wld 不存仙人掌帧——按邻接关系现场判定角色并取 Tiles_80（18px 网格）对应帧：
 *  - 列高比较：相邻列更高 → 本列是手臂（左臂 X=3 / 右臂 X=2；顶端 X=6）
 *  - 主干：顶格 Y=0（含手臂连接位 X=1/4/5），身格 (0,1)
 *  - 生物群系变体：向下扫 100 格沙类 → Evil/Good/Crimson_Cactus 独立贴图 */
/** 仙人掌生物群系贴图（向下扫沙类：腐化/猩红/神圣 → 独立变体贴图）。
 *  扫描带 baseX 偏移（TEdit 同款）：手臂格朝主干列方向扫——手臂列自身下方
 *  可能没有沙（如浮空装饰/黑檀石地基），直下扫会漏判 */
export function cactusTextureFor(atlas: SpriteAtlas, st: TileStore, x: number, y: number): HTMLImageElement | null {
  let img = atlas.ensureVImage('vanilla/Tiles_80.png');
  // 角色判定：与 cactusFrameAt 同一列高比较 → 决定扫描列偏移
  const isC = (ax: number, ay: number) => st.inBounds(ax, ay) && st.type[st.idx(ax, ay)] === TILE_BY_KEY['v_80_cactus'];
  let top = y;
  while (isC(x, top - 1)) top--;
  const colH = (ax: number) => { let n = 0; while (isC(ax, top + n)) n++; return n; };
  const hSelf = colH(x), hR = colH(x + 1), hL = colH(x - 1);
  const baseX = hR > hSelf ? 1 : hL > hSelf ? -1 : 0; // 左臂扫 x+1 / 右臂扫 x-1 / 主干扫 x
  const ebonsand = TILE_BY_KEY['v_112_ebonsand_block'] ?? -1;
  const crimsand = TILE_BY_KEY['v_234_crimsand_block'] ?? -1;
  const pearlsand = TILE_BY_KEY['v_116_pearlsand_block'] ?? -1;
  for (let i = 0; i < 100 && y + i < st.h; i++) {
    const t = st.type[st.idx(x + baseX, y + i)];
    if (t === 0) continue;
    if (t === ebonsand) { img = atlas.ensureVImage('vanilla/Evil_Cactus.png') ?? img; break; }
    if (t === crimsand) { img = atlas.ensureVImage('vanilla/Crimson_Cactus.png') ?? img; break; }
    if (t === pearlsand) { img = atlas.ensureVImage('vanilla/Good_Cactus.png') ?? img; break; }
  }
  return img ?? null;
}

/** 仙人掌实际渲染帧（列角色判定，与 drawCactusCell 共用）——供渲染与纠错面板定位 */
export function cactusFrameAt(st: TileStore, x: number, y: number, type: number): { col: number; row: number } {
  const isC = (ax: number, ay: number) => st.inBounds(ax, ay) && st.type[st.idx(ax, ay)] === type;
  // 本列顶部与各列下行高度（同一行起算，对齐 TEdit 的 length1/length2 比较）
  let top = y;
  while (isC(x, top - 1)) top--;
  const colH = (ax: number) => { let n = 0; while (isC(ax, top + n)) n++; return n; };
  const hSelf = colH(x), hR = colH(x + 1), hL = colH(x - 1);
  const hasN = isC(x, y - 1), hasS = isC(x, y + 1);
  let ux = 0, uy = 0;
  if (hR > hSelf) {
    // 左臂（西侧手臂，贴图靠右桥接主干）：顶格 (3,0) / 身格 (3,1) /
    // 底格 (3,2) / 单格孤立手臂才是尖帽 (6,2)
    if (!hasN && !hasS) { ux = 6; uy = 2; }
    else { ux = 3; uy = !hasN ? 0 : hasS ? 1 : 2; }
  } else if (hL > hSelf) {
    // 右臂（东侧手臂，贴图靠左桥接主干）：(2,0)/(2,1)/(2,2)，单格尖帽 (6,1)
    if (!hasN && !hasS) { ux = 6; uy = 1; }
    else { ux = 2; uy = !hasN ? 0 : hasS ? 1 : 2; }
  } else {
    // 主干：顶格 Y=0 / 身格 Y=2，两者都做手臂连接位判定（w/e/sw/se）
    uy = hasN ? 2 : 0;
    const w = isC(x - 1, y), sw = isC(x - 1, y + 1), e = isC(x + 1, y), se = isC(x + 1, y + 1);
    if (w && !sw && (!e || se)) ux = 4;
    else if (e && !se && (!w || sw)) ux = 1;
    else if (w && !sw && e && !se) ux = 5;
    else ux = 0;
  }
  return { col: ux, row: uy };
}

export function drawCactusCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, type: number, px: number, py: number,
): void {
  const { col: ux, row: uy } = cactusFrameAt(st, x, y, type);
  // 生物群系变体：向下扫沙类（腐化/猩红/神圣）
  const img = cactusTextureFor(atlas, st, x, y);
  if (!img) return;
  if (ux * 18 + 16 <= img.width && uy * 18 + 16 <= img.height) {
    ctx.drawImage(img, ux * 18, uy * 18, 16, 16, px, py, TILE, TILE);
  }
}

/** 绘制一格原版图块。
 *  auto：现场算帧；style：显式 18px 帧偏移。
 *  重要修正：wld 里多格家具每格 frameX 往往全 0（不是 0/18 交错），
 *  直接用存储帧会让 2 格宽家具两格都画锚点帧（重复左侧贴图）。
 *  style 模式改为：若本格帧偏移为 0，向左/上扫描同类同物体格子，
 *  按到锚点的格距重算帧偏移（锚点=左侧或上方最近格） */
export function drawVanillaCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  sheet: number, frame: 'auto' | 'style' | 'blend', fw: number, fh: number,
  st: TileStore, x: number, y: number, type: number,
  same: (t: number) => boolean, px: number, py: number, fx: number, fy: number,
  trees?: TreeStyleData,
): void {
  // 树木族（tile 5 + 宝石树 583-589 + 装饰树 596/616 + 灰烬树 634 + 棕榈 323 + 蘑菇树 72）：
  // 树冠/树枝标记帧 + 生物群系树干（TEdit 同一套逻辑）。
  // 棕榈干身 frameY 是倾斜偏移（跨列）——主遍跳过，整棵由树族外扩遍绘制防裁剪
  if (frame === 'style' && (TREE_SHEET_STYLES[sheet] !== undefined || sheet === 323)) {
    if (sheet !== 323) drawTreeCell(ctx, atlas, st, x, y, fx, fy, px, py, sheet, false, trees);
    return;
  }
  // 仙人掌（tile 80）：wld 无帧，按邻接现场分帧 + 生物群系变体
  if (sheet === 80 && frame === 'style') {
    drawCactusCell(ctx, atlas, st, x, y, type, px, py);
    return;
  }
  // blend 类（泥土/石族/草族/沙/泥/雪）：TEdit BlendRules 移植
  // （掩码位序：E=0x1 N=0x10 W=0x100 S=0x1000；角 TR/TL/BL/BR <<16）
  if (frame === 'blend') {
    const myMeta = atlas.vmeta(sheet);
    const myMerge = myMeta?.mergeWith ?? null;
    const myStone = !!myMeta?.isStone;
    const nMeta = (t: number) => {
      const d = TILE_DEFS[t];
      return d?.vanilla ? atlas.vmeta(d.vanilla.sheet) : null;
    };
    // Merges() 链（TEdit TileProperty.Merges）：对方 mergeWith 指向我 / 我指向对方 / 双方同指
    const merges = (ot: number) => {
      if (ot === type) return true;
      const om = nMeta(ot);
      if (!om) return false;
      const oid = TILE_DEFS[ot]?.vanilla?.sheet ?? -1;
      if (om.mergeWith != null && om.mergeWith === sheet) return true;
      if (myMerge != null && myMerge === oid) return true;
      if (myMerge != null && om.mergeWith != null && myMerge === om.mergeWith) return true;
      return false;
    };
    const dirs: Array<[number, number, number]> = [
      [1, 0, 0x1], [0, -1, 0x10], [-1, 0, 0x100], [0, 1, 0x1000],          // E N W S
      [1, -1, 0x10000], [-1, -1, 0x100000], [-1, 1, 0x1000000], [1, 1, 0x10000000], // NE NW SW SE
    ];
    let same = 0, mergeMask = 0;
    for (const [dx, dy, bit] of dirs) {
      const ax = x + dx, ay = y + dy;
      if (!st.inBounds(ax, ay)) continue;
      const oi = st.idx(ax, ay);
      const ot = st.type[oi];
      if (ot === 0) continue;
      const om = nMeta(ot);
      // 同型：石族按 isStone 互认，其余走 Merges 链
      if (myStone ? !!om?.isStone : merges(ot)) same |= bit;
      // 合并位：邻居是 mergeWith 目标
      if (myMerge != null && (TILE_DEFS[ot]?.vanilla?.sheet ?? -1) === myMerge) mergeMask |= bit;
    }
    const strictness = myMeta?.isGrass ? 2 : myMerge != null ? 1 : 0;
    const uv = getUVForMasks(same, mergeMask, strictness, ((x * 7) + (y * 11)) % 3);
    const r = atlas.vframe(sheet, uv.col, uv.row);
    if (r) {
      ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, py, TILE, TILE);
      return;
    }
    const fb = atlas.vframe(sheet, 1, 1);
    if (fb) ctx.drawImage(fb.img, fb.sx, fb.sy, fb.sw, fb.sh, px, py, TILE, TILE);
    return;
  }
  let r: DrawRect | null = null;
  if (frame === 'auto') {
    r = frameFor(atlas, sheet, st, x, y, type, same);
  } else {
    // 重建帧偏移：只针对帧数据全 0 的残缺物体（wld 部分家具）。
    // 邻居必须同样存 (0,0) 才视为同物体的待重建格——已带 18px 偏移的邻居
    // 一定是相邻物体的格子（如并排宝箱的 (18,0)），必须挡住扫描
    let ofx = fx, ofy = fy;
    if (ofx === 0 && ofy === 0 && (fw > 1 || fh > 1)) {
      // 向左扫描最多 fw-1 格：同类且帧全 0
      let ax = 0;
      for (let k = 1; k < fw; k++) {
        const li = st.idx(x - k, y);
        if (st.inBounds(x - k, y) && st.type[li] === type && st.frameX[li] === 0 && st.frameY[li] === 0) ax = k;
        else break;
      }
      ofx = ax * 18;
      // 向上扫描最多 fh-1 格：同类且帧全 0
      let ay = 0;
      for (let k = 1; k < fh; k++) {
        const ui2 = st.idx(x, y - k);
        if (st.inBounds(x, y - k) && st.type[ui2] === type && st.frameX[ui2] === 0 && st.frameY[ui2] === 0) ay = k;
        else break;
      }
      ofy = ay * 18;
    }
    // 旧版素材表【分带布局】兼容：wld 帧按新游戏单行布局存储（样式全部横排一行），
    // 而素材包里的表较窄、样式分多带排列（一行放不下就换到下一带）。
    // 样式索引超出一带容量 → 换带重算（如 Tiles_187：带宽 35 样式×54px，
    // 样式 52 头骨 wld 帧 (2808,0) → 实际 (52%35)*54=918, y+36）。
    // 带 = 物体占格宽×步长；带高 = 物体占格高×步长
    const meta = atlas.vmeta(sheet);
    if (meta && fw > 0) {
      const imgW = atlas.ensureVImage(meta.sheet)?.width ?? 0;
      if (imgW > 0 && ofx + meta.grid[0] > imgW) {
        const objW = fw * meta.stride[0];
        const bandH = (fh || 1) * meta.stride[1];
        const colsPerBand = Math.floor(imgW / objW);
        if (colsPerBand > 0) {
          const styleIdx = Math.floor(ofx / objW);
          if (styleIdx >= colsPerBand) {
            ofx = (styleIdx % colsPerBand) * objW + (ofx % objW);
            ofy += Math.floor(styleIdx / colsPerBand) * bandH;
          }
        }
      }
    }
    // 标准 18px stride 像素偏移直取（宝箱 Tiles_21 也是标准网格：
    // 样式横向排列 36px/个，closed 状态占前 2 行，下面是开启动画帧）
    r = atlas.vframeAt(sheet, ofx, ofy);
    if (!r) r = atlas.vframeAt(sheet, 0, 0);
  }
  if (!r) return;
  // 蜡烛类高格（grid 16×20）：底部对齐本格
  const dy = py + TILE - r.sh;
  // 原版 TileObjectData DrawYOffset：落地家具普遍 +2（腿部插入地面 2px）、
  // 挂墙/特殊件为负。从反编译 ObjectData/TileObjectData.cs 全量提取。
  const dyOff = DRAW_Y_OFFSET[sheet] ?? 0;
  ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, Math.max(py, dy) + dyOff, r.sw, r.sh);
  void fw; void fh;
}

/** 原版 TileObjectData.newTile.DrawYOffset 全量表（ObjectData/TileObjectData.cs 逐条提取；未列出 = 0） */
const DRAW_Y_OFFSET: Record<number, number> = {
  33: -4, 34: -2, 42: -2, 49: -4, 78: 2, 81: -8, 82: -1, 85: 2, 89: 2, 91: -2, 93: 2, 95: -2,
  100: 2, 102: 2, 104: 2, 105: 2, 126: -2, 132: 2, 133: 2, 134: 2, 135: 2, 136: 2, 139: 2,
  142: 2, 143: 2, 174: -4, 186: 2, 187: 2, 207: 2, 210: 2, 215: 2, 217: 2, 218: 2, 219: 2,
  220: 2, 227: -6, 228: 2, 231: 2, 243: 2, 244: 2, 247: 2, 254: 2, 270: -2, 271: -2, 275: 2,
  282: 2, 283: 2, 285: 2, 300: 2, 301: 2, 302: 2, 303: 2, 304: 2, 305: 2, 306: 2, 307: 2,
  308: 2, 324: -2, 349: 2, 354: 2, 355: 2, 372: -4, 377: 2, 378: 2, 388: -2, 412: 2, 428: 2,
  444: -2, 454: -2, 455: 2, 457: 2, 463: 2, 464: 2, 465: -2, 470: 2, 475: 2, 485: 2, 490: 2,
  491: 2, 494: 2, 499: 2, 505: 2, 506: 2, 520: 2, 521: 2, 522: 2, 523: 2, 524: 2, 525: 2,
  526: 2, 527: 2, 543: 2, 547: 2, 548: 2, 552: 2, 560: 2, 564: 2, 565: 2, 567: 2, 568: 2,
  569: 2, 570: 2, 572: -2, 579: -2, 581: -2, 591: -2, 592: -2, 593: 2, 594: 2, 597: 2, 598: 2,
  613: 2, 614: 2, 617: 2, 621: 2, 622: 2,
};
