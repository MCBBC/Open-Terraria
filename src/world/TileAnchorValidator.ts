// TileObjectData 锚点验证器（vanilla Terraria.TileObject.CanPlace 全量移植，分格判定）
// 数据源：src/data/tile-anchors.json（tools/recon-tileobj.mjs 从反编译
//   Terraria.ObjectData/TileObjectData.cs 提取，1457）。
// 验收语义（TileObject.cs CanPlace 尾判）：锚点格子与占位格【全部】通过才可放
//   （num35/num36 双满分制），备选方向按序取首个满分者。
import anchorsJson from '../data/tile-anchors.json';
import { TILE_DEFS, TILE_TABLE_SHEETS, TILE_CUT_SHEETS, BREAKABLE_WHEN_PLACING_SHEETS } from '../data/tiles';
import { LIQUID_TYPE } from './TileStore';
import type { World } from './World';

export interface AnchorDataRec { t: string[]; cnt: number | string; start: number | string }
/** LiquidPlacement 枚举值入库形态（Terraria.Enums/LiquidPlacement.cs 四值；
 *  1457 基样式数据实际只出现前两者，'onlyInFull' 为子样式级（227 style5）预留。
 *  原版 OnlyInLiquid 基样式零出现，不入库值域。 */
export type LiquidPlacementVal = 'allowed' | 'notAllowed' | 'onlyInFull';
export interface AnchorRec {
  w: number; h: number; ox: number; oy: number;
  anchorTop: AnchorDataRec | null; anchorBottom: AnchorDataRec | null;
  anchorLeft: AnchorDataRec | null; anchorRight: AnchorDataRec | null;
  wall: boolean;
  /** ★M-3 液体放置两维（TileObjectData.LiquidPlace :1853-1907）：
   *  water 维 = 原版 liquidType 0/2/3（水/蜜/微光）；lava 维 = 1（岩浆）。
   *  缺省 = SetupBaseObject :1767-1768（water Allowed / lava NotAllowed）。 */
  liq: { water: LiquidPlacementVal; lava: LiquidPlacementVal };
  flatten: boolean; dir: string; yOff: number;
  dirs?: Array<{ dir: string }>;
}
const RAW = (anchorsJson as unknown as { v: string; tiles: Record<string, AnchorRec | null> }).tiles;

const _resolved = new Map<number, AnchorRec | null>();
/** 取 tile 的锚点规格；无数据 / 复杂构造回落(null)/含未建模豁免位者归 null 走旧路径 */
export function anchorSpecOf(sheet: number): AnchorRec | null {
  if (_resolved.has(sheet)) return _resolved.get(sheet)!;
  const raw = RAW[String(sheet)];
  let out: AnchorRec | null = null;
  if (raw) {
    // AlternateTile/Tree 位依赖逐族白名单（未提取）→ 整体回落旧近似（保守）
    const hasExoticBits = [raw.anchorTop, raw.anchorBottom, raw.anchorLeft, raw.anchorRight]
      .some((a) => a?.t.some((s) => s === 'AlternateTile' || s === 'Tree'));
    out = hasExoticBits ? null : raw;
  }
  _resolved.set(sheet, out);
  return out;
}

/** 原版 blockType()：0 平整 / 1 半砖 / 2..5 = slope1..4 */
function btOf(st: World['store'], x: number, y: number): number {
  const i = st.idx(x, y);
  if (st.half[i]) return 1;
  const s = st.slope[i];
  return s > 0 ? s + 1 : 0;
}
function defAt(st: World['store'], x: number, y: number) {
  return TILE_DEFS[st.get(x, y)];
}
function solidPureFlat(st: World['store'], x: number, y: number, flatten: boolean): boolean {
  // SolidTile 位：tileSolid 且非 tileSolidTop；默认还要求 blockType==0
  // （FlattenAnchors 时坡/半砖亦可）；noAttach 表近似忽略（常见家具锚面皆可附）
  const d = defAt(st, x, y);
  if (!d) return false;
  if (!(d.solid && !d.platform)) return false;
  return flatten || btOf(st, x, y) === 0;
}
function solidTopLike(st: World['store'], x: number, y: number): boolean {
  // SolidWithTop/Platform 位宽口径：平台族 + 桌台类（tableTop 集，平台兼桌面）
  return st.isPlatform(x, y) || TILE_TABLE_SHEETS.has(defAt(st, x, y)?.vanilla?.sheet ?? -1);
}
/** 原版 blockType 侧缘对位表（SolidSide）：bottom{4,5} top{2,3} left{3,5} right{2,4} */
const SIDE_BT_PAIRS: Record<string, number[]> = {
  bottom: [4, 5], top: [2, 3], left: [3, 5], right: [2, 4],
};

interface SideSpec { t: string[]; cnt: number; start: number }

function evalCell(side: string, spec: SideSpec, at: [number, number],
  st: World['store'], rec: AnchorRec): boolean {
  const [cx, cy] = at;
  if (!st.inBounds(cx, cy)) return false;
  const active = st.isActive(cx, cy);
  const bit = (name: string) => spec.t.includes(name);
  let ok = false;
  if (active) {
    const d = defAt(st, cx, cy)!;
    const sheet = d?.vanilla?.sheet ?? -1;
    if (bit('SolidTile') && d?.solid && !d.platform && st.wall[st.idx(cx, cy)] >= 0
      && (rec.flatten || btOf(st, cx, cy) === 0)) ok = true;
    if (!ok && (bit('SolidWithTop') || bit('Table')) && solidTopLike(st, cx, cy)
      && (rec.flatten || !(st.isPlatform(cx, cy) && (st.half[st.idx(cx, cy)] || btOf(st, cx, cy) > 0))))
      ok = true;
    if (!ok && bit('SolidSide') && d?.solid && !d.platform
      && SIDE_BT_PAIRS[side]?.includes(btOf(st, cx, cy))) ok = true;
    if (!ok && bit('PlanterBox') && sheet === 380) ok = true;
    if (!ok && bit('SolidBottom')) {
      // Composite（TileObject :541-556）：整实心 / 半砖 / 顶坡 / 平台的半砖·顶坡形态；
      // NotReallySolid/bottomSlope 近似忽略（花箱族已由 PlanterBox 覆盖）
      const b = btOf(st, cx, cy);
      if (d?.solid || b === 1 || b >= 2) ok = true;
    }
  } else if (bit('EmptyTile')) ok = true;
  return ok;
}

/** 检验“某物放在 ax,ay 是否满足全部锚点”。CanPlace 的 all-or-nothing 判定。
 *  液体门 = 两维建模（rec.liq.water/lava，见下方逐格注释）；wall 族沿用
 *  isValidWallAnchor 默认分支（任意非零墙均有效）。occupiedIgnore：调用方为
 *  “原地重放”场景给的豁免面。 */
export function validateAnchors(st: World['store'], ax: number, ay: number, rec: AnchorRec,
  occupiedIgnore?: (x: number, y: number) => boolean): boolean {
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return false;
  if (ax < 1 || ay < 1 || ax + rec.w > st.w - 1 || ay + rec.h > st.h - 1) return false;
  for (let j = 0; j < rec.h; j++) {
    for (let i = 0; i < rec.w; i++) {
      const x = ax + i, y = ay + j;
      if (!st.inBounds(x, y)) return false;
      const i2 = st.idx(x, y);
      if (occupiedIgnore?.(x, y)) continue;
      // 占位格阻挡判定（CanPlace TileObject.cs:357）：tileCut ∪ BreakableWhenPlacing
      // 均不阻挡（写入前 TileObject.Place :84-86 KillTile 清除）；特例 484/654 虽属
      // tileCut 仍阻挡。★石堆族 185 曾漏入例外面——小石子挡家具须镐挖(用户实报)。
      {
        const shOc = defAt(st, x, y)?.vanilla?.sheet ?? -1;
        const clearable = (shOc !== -1 && shOc !== 484 && shOc !== 654
          && TILE_CUT_SHEETS.has(shOc)) || BREAKABLE_WHEN_PLACING_SHEETS.has(shOc);
        if (st.isActive(x, y) && !clearable) return false;
      }
      // ★M-3 液体放置两维门（vanilla TileObjectData.LiquidPlace 全支，TileObjectData.cs
      //  :1853-1907；CanPlace 逐格消费 TileObject.cs:342 → :361 flag3 并入拒放）：
      //  · 液体量 >0：lava 型（LIQUID_TYPE.LAVA=原版 liquidType 1）走 lava 维，其余
      //    （WATER/HONEY/SHIMMER=原版 0/2/3）走 water 维；NotAllowed 拒；
      //    onlyInFull 非满液（255）拒。
      //  · 液体量 ==0（dry）：onlyIn* 语义拒（:1886-1904 else 支——onlyInFull/onlyInLiquid
      //    在无液格恒拒）。基样式数据暂无 onlyIn 值，分支为语义完备性保留。
      //  旧实现 liqAllow 单维布尔（缺省 false=液体中一律拒）与原版 382/382 反向，已翻正。
      {
        const liqAmt = st.liquid[i2];
        // 本仓 liquidType 为原版 +1 编码（TileStore.LIQUID_TYPE）；0(NONE) 视同水（同
        //  Game.ts:21951 惯例——原版 liquidType()==0 即水）
        const isLava = st.liquidType[i2] === LIQUID_TYPE.LAVA;
        const spec = isLava ? rec.liq.lava : rec.liq.water;
        if (liqAmt > 0) {
          if (spec === 'notAllowed') return false;
          if (spec === 'onlyInFull' && liqAmt !== 255) return false;
        } else if (spec === 'onlyInFull') {
          return false;
        }
      }
      if (rec.wall && st.wall[i2] === 0) return false;
    }
  }
  const sideSpec = (side: 'top' | 'bottom' | 'left' | 'right'): SideSpec | null => {
    const a = side === 'top' ? rec.anchorTop : side === 'bottom' ? rec.anchorBottom
      : side === 'left' ? rec.anchorLeft : rec.anchorRight;
    if (!a) return null;
    return {
      t: a.t,
      cnt: typeof a.cnt === 'number' ? a.cnt : rec.w,
      start: typeof a.start === 'number' ? a.start : Math.max(0, rec.h - 1),
    };
  };
  const bottom = sideSpec('bottom');
  if (bottom) for (let k = 0; k < bottom.cnt; k++) {
    if (!evalCell('bottom', bottom, [ax + bottom.start + k, ay + rec.h], st, rec)) return false;
  }
  const top = sideSpec('top');
  if (top) for (let k = 0; k < top.cnt; k++) {
    if (!evalCell('top', top, [ax + top.start + k, ay - 1], st, rec)) return false;
  }
  const left = sideSpec('left');
  if (left) for (let k = 0; k < left.cnt; k++) {
    if (!evalCell('left', left, [ax - 1, ay + left.start + k], st, rec)) return false;
  }
  const right = sideSpec('right');
  if (right) for (let k = 0; k < right.cnt; k++) {
    if (!evalCell('right', right, [ax + rec.w, ay + right.start + k], st, rec)) return false;
  }
  return true;
}

/** 点击格 → 锚定位置换算 + Smart 吸附。返回最终锚点（占位左上角）。
 *  候选序（vanilla 手感：Smart Cursor 对持拿物的幽灵吸附重定向，行为子集）：
 *  ①主 Origin 对位；②方向备选水平镜像；③★全窗吸附——
 *    水平覆盖点击列落在物件横向跨度内的所有锚（贴墙缝点首/尾格即成），垂直
 *    覆盖「点击格作为底锚行正上方悬坐」（点到地表固体上时幽灵整体上移），
 *    按「Origin 所在格到点击的曼哈顿距」升序取首个满分者。 */
export function chooseAnchorFromClick(st: World['store'], cx: number, cy: number, rec: AnchorRec):
  { x: number; y: number } | null {
  const prim = { x: cx - rec.ox, y: cy - rec.oy };
  if (validateAnchors(st, prim.x, prim.y, rec)) return prim;
  if ((rec.dirs?.length ?? 0) > 0 && rec.w > 1) {
    const mx = { x: cx - ((rec.w - 1) - rec.ox), y: cy - rec.oy };
    if (mx.x !== prim.x && validateAnchors(st, mx.x, mx.y, rec)) return mx;
  }
  // ③ 全窗吸附：横向让点击列 ∈ [ax, ax+w-1]（ax ∈ [cx-w+1, cx]，与 Origin 解耦），
  //    纵向 ay ∈ [cy-h, cy]：「物件直接坐在点击行上方」(ay=cy-h, 点地表块本体)
  //    至「点击行即物件顶行」。排序键 = 物件 Origin 格到点击的曼哈顿距，同距低者优。
  type Cand = { ax: number; ay: number; d: number };
  const out: Cand[] = [];
  for (let dxx = -(rec.w - 1); dxx <= 0; dxx++) {
    const ax = cx + dxx;
    for (let ay = cy - rec.h; ay <= cy; ay++) {
      if (ax === prim.x && ay === prim.y) continue;
      const oxCell = ax + rec.ox, oyCell = ay + rec.oy;
      out.push({ ax, ay, d: Math.abs(oxCell - cx) + Math.abs(oyCell - cy) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.ay - b.ay || a.ax - b.ax);
  for (const c of out) {
    if (validateAnchors(st, c.ax, c.ay, rec)) return { x: c.ax, y: c.ay };
  }
  return null;
}
export const ANCHOR_JSON_V = (anchorsJson as unknown as { v: string }).v;
