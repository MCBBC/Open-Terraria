// 原版图块通用渲染器：TEdit TileFraming.SelfFrame8Way 移植（8 向 47 项查找表）
// 用于 TileDef.vanilla.frame === 'auto' 的 1x1 实心块（泥土/矿石/冰雪等同表系）。
// 位序（与游戏 neighborMask 不同！）：U=1 L=2 R=4 D=8 UL=16 UR=32 DL=64 DR=128
// 变体选择 (x*7 + y*11) % 3；无条目/越界回退默认帧 (1,1)
import type { SpriteAtlas, DrawRect } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_BY_KEY } from '../data/tiles';

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
  if (entry) {
    const v = entry[((x * 7) + (y * 11)) % 3 % entry.length];
    const r = atlas.vframe(sheet, v[0], v[1]);
    if (r) return r;
  }
  return atlas.vframe(sheet, DEFAULT_FRAME[0], DEFAULT_FRAME[1]);
}

/** 树木专用渲染（tile 5，移植 TEdit WorldRenderXna 树逻辑）：
 *  - 树干帧（frameY < 198）：按树下草地生物群系选 Tiles_5_0..6 变体，取 (U,V,20,20) 压入 16px 格
 *  - 标记帧（frameX >= 22 且 frameY >= 198）：不采样 Tiles_5——
 *    U=22 树顶（Tree_Tops_style 80×80 底部锚定）、U=44 左枝（Tree_Branches 40×40 右锚定）、
 *    U=66 右枝（左锚定）；变体 x%3
 *  treeStyle 固定 0（wld 树样式段未解析，默认森林） */
const TREE_STYLE = 0;
// 树下草地 → 生物群系树干变体（TEdit treeType；-1 = 基础 Tiles_5）
const TREE_GROUND: Array<[string, number]> = [
  ['v_23_corrupt_grass_block', 0],
  ['v_60_jungle_grass_block', 1],
  ['v_70_mushroom_grass_block', 6],
  ['snow', 3],
  ['v_199_crimson_grass_block', 4],
];
export function drawTreeCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, x: number, y: number, fx: number, fy: number, px: number, py: number,
  foliageOnly = false,
): void {
  if (fy >= 198 && fx >= 22) {
    // 树冠/树枝标记帧（仅由 ChunkCache 的外扩遍绘制，防跨 chunk 裁剪）
    if (foliageOnly === false) return;
    const frame = ((x % 3) + 3) % 3;
    let img: HTMLImageElement | null = null;
    let sx = 0, sy = 0, sw = 0, sh = 0, anchor = 0; // 0=底中(顶) 1=右中(左枝) 2=左中(右枝)
    if (fx === 22) {
      img = atlas.vimages.get(`vanilla/Tree_Tops_${TREE_STYLE}.png`) ?? null;
      sw = 80; sh = 80; sx = frame * (sw + 2); anchor = 0;
    } else if (fx === 44) {
      img = atlas.vimages.get(`vanilla/Tree_Branches_${TREE_STYLE}.png`) ?? null;
      sw = 40; sh = 40; sx = 0; sy = frame * (sh + 2); anchor = 1;
    } else if (fx === 66) {
      img = atlas.vimages.get(`vanilla/Tree_Branches_${TREE_STYLE}.png`) ?? null;
      sw = 40; sh = 40; sx = 42; sy = frame * (sh + 2); anchor = 2;
    }
    if (!img) return;
    let dx = px, dy = py;
    if (anchor === 0) { dx = px + (TILE - sw) / 2; dy = py + TILE - sh; }
    else if (anchor === 1) { dx = px + TILE - sw; dy = py + (TILE - sh) / 2; }
    else { dy = py + (TILE - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
    return;
  }
  if (foliageOnly) return; // 外扩遍只画树冠/树枝
  // 树干：向下扫描找草地定生物群系（TEdit baseX 奇偶修正 + 100 格深扫描）
  let baseX = 0;
  if (fx === 66 && fy <= 45) baseX++;
  if (fx === 88 && fy >= 66 && fy <= 110) baseX--;
  if (fx === 22 && fy >= 132 && fy < 198) baseX--;
  if (fx === 44 && fy >= 132 && fy < 198) baseX++;
  let type = -1;
  for (let i = 0; i < 100; i++) {
    const ty = y + i;
    if (ty >= st.h) break;
    const t = st.type[st.idx(x + baseX, ty)];
    if (t === 0) continue;
    if (t === TILE_BY_KEY['grass']) { type = -1; break; }
    const hit = TREE_GROUND.find(([k]) => TILE_BY_KEY[k] === t);
    if (hit) { type = hit[1]; break; }
  }
  const img = type >= 0
    ? atlas.vimages.get(`vanilla/Tiles_5_${type}.png`) ?? atlas.vimages.get('vanilla/Tiles_5.png')
    : atlas.vimages.get('vanilla/Tiles_5.png');
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
/** 仙人掌生物群系贴图（向下扫沙类：腐化/猩红/神圣 → 独立变体贴图） */
export function cactusTextureFor(atlas: SpriteAtlas, st: TileStore, x: number, y: number): HTMLImageElement | null {
  let img = atlas.vimages.get('vanilla/Tiles_80.png');
  const ebonsand = TILE_BY_KEY['v_112_ebonsand_block'] ?? -1;
  const crimsand = TILE_BY_KEY['v_234_crimsand_block'] ?? -1;
  const pearlsand = TILE_BY_KEY['v_116_pearlsand_block'] ?? -1;
  for (let i = 0; i < 100 && y + i < st.h; i++) {
    const t = st.type[st.idx(x, y + i)];
    if (t === 0) continue;
    if (t === ebonsand) { img = atlas.vimages.get('vanilla/Evil_Cactus.png') ?? img; break; }
    if (t === crimsand) { img = atlas.vimages.get('vanilla/Crimson_Cactus.png') ?? img; break; }
    if (t === pearlsand) { img = atlas.vimages.get('vanilla/Good_Cactus.png') ?? img; break; }
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
    // 左臂（右侧有更高主干）
    if (!hasN) { ux = 6; uy = 2; }
    else { ux = 3; uy = hasS ? 1 : 2; }
  } else if (hL > hSelf) {
    // 右臂（左侧有更高主干）
    if (!hasN) { ux = 6; uy = 1; }
    else { ux = 2; uy = hasS ? 1 : 2; }
  } else if (!hasN) {
    // 主干顶格：手臂连接位判定（w/e/sw/se）
    uy = 0;
    const w = isC(x - 1, y), sw = isC(x - 1, y + 1), e = isC(x + 1, y), se = isC(x + 1, y + 1);
    if (w && !sw && (!e || se)) ux = 4;
    else if (e && !se && (!w || sw)) ux = 1;
    else if (w && !sw && e && !se) ux = 5;
    else ux = 0;
  } else {
    ux = 0; uy = 1; // 主干身格
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
  sheet: number, frame: 'auto' | 'style', fw: number, fh: number,
  st: TileStore, x: number, y: number, type: number,
  same: (t: number) => boolean, px: number, py: number, fx: number, fy: number,
): void {
  // 树木（tile 5）：专用渲染（树冠/树枝标记帧 + 生物群系树干）
  if (sheet === 5 && frame === 'style') {
    drawTreeCell(ctx, atlas, st, x, y, fx, fy, px, py);
    return;
  }
  // 仙人掌（tile 80）：wld 无帧，按邻接现场分帧 + 生物群系变体
  if (sheet === 80 && frame === 'style') {
    drawCactusCell(ctx, atlas, st, x, y, type, px, py);
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
    // 标准 18px stride 像素偏移直取（宝箱 Tiles_21 也是标准网格：
    // 样式横向排列 36px/个，closed 状态占前 2 行，下面是开启动画帧）
    r = atlas.vframeAt(sheet, ofx, ofy);
    if (!r) r = atlas.vframeAt(sheet, 0, 0);
  }
  if (!r) return;
  // 蜡烛类高格（grid 16×20）：底部对齐本格
  const dy = py + TILE - r.sh;
  ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, px, dy < py ? py : dy, r.sw, r.sh);
  void fw; void fh;
}
