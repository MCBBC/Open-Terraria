// 原版 "Statues" pass 1:1(cs:16952-17055 + SetupStatueList cs:4395 + PlaceStatueTrap cs:4436)。
// statueList 73 项:0-43 段 (105,i) 但 [34]=(349,0)、[43]=(105,50),
// 追加 63,64,65,66,68,69,70,71,72,73,75,51..62,77,78,67,74,37,2。
// 数量 = floor(73*2*w/4200);逐个顺序轮换取样式,落点向下扫到首个实心格上一格放置;
// 陷阱雕像样式 {4,7,10,18}(GenVars.StatuesWithTraps)→ 邻近放飞镖陷阱 137 并拉线。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';

/** statueList(cs:4395-4433):73 项 (tile, style) 对,原序 */
export const STATUE_LIST: Array<[number, number]> = (() => {
  const list: Array<[number, number]> = [];
  for (let i = 0; i < 44; i++) list.push([105, i]);
  list[34] = [349, 0];
  list[43] = [105, 50];
  for (const s of [63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75,
    51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
    77, 78, 67, 74, 37, 2]) list.push([105, s]);
  return list;
})();

const STATUE = STATUE_LIST;

/** 陷阱雕像 = 列表索引 {4,7,10,18}(GenVars.StatuesWithTraps;索引<34 时与样式同值) */
export const STATUES_WITH_TRAPS = new Set([4, 7, 10, 18]);

function statueTileKey(sheet: number): number | null {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return null;
}

const STATUE_105 = statueTileKey(105);
const STATUE_349 = statueTileKey(349);
const TRAP = statueTileKey(135);   // cs:4451 PlaceTile(135)——超级飞镖陷阱（曾误 137）
const TRAP_162 = statueTileKey(162);
const WIRE_RED = TileStore.WIRE_RED;

/** PlaceStatueTrap(cs:4436-4462)：±10 盒内找"空格+下方 SolidTile2 且非冰(162)"位放
 *  超级飞镖陷阱(135,曾误用 137)并 WireLine 拉红线——L 形拐点=(陷阱x,雕像y)
 *  （cs:111-129：横段沿 start(雕像)y、竖段沿 end(陷阱)x）。 */
export function placeStatueTrap(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y) || x < 20 || x > st.w - 21 || y < 20 || y > st.h - 21 || !TRAP) return;
  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const tx = x + i, ty = y + j;
      if (!st.inBounds(tx, ty + 1)) continue;
      const ci = st.idx(tx, ty), bi = st.idx(tx, ty + 1);
      if (st.flags[ci]) continue;                                   // !tile2.active()
      // SolidTile2(tile)（cs:70178）：active && 生成期 tileSolid && slope==0 && !halfBrick && !inActive
      if (!st.flags[bi] || st.half[bi] || st.slope[bi] !== 0 || ((st.wire[bi] >>> 5) & 1) === 1
        || !vanGenSolidType(st.type[bi])) continue;
      if (st.type[bi] === TRAP_162) continue;                       // tile.type != 162（冰特判）
      st.setTileSilent(tx, ty, TRAP, 0, 0);
      // WireLine(new Point(x,y), new Point(tx,ty))：横段沿雕像 y、竖段沿陷阱 x
      const x0 = Math.min(x, tx), x1 = Math.max(x, tx);
      const y0 = Math.min(y, ty), y1 = Math.max(y, ty);
      for (let wx = x0; wx <= x1; wx++) st.wire[st.idx(wx, y)] |= WIRE_RED;
      for (let wy = y0; wy <= y1; wy++) st.wire[st.idx(tx, wy)] |= WIRE_RED;
      return;
    }
  }
}

/** Statues pass 主体。须在洞穴/生物群系成形后调用(原版序:SettleLiquids 后、地下屋前) */
export function runStatuesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 一次性探针钩（同 WebsPass 模式）：Statues 入口快照（债时间线用）
  {
    const g0 = globalThis as { __swStatCap?: (gs: GenState, st: TileStore) => void };
    try { g0.__swStatCap?.(gs, st); } catch { /* probe */ }
  }
  if (!STATUE_105) return;
  const { w, h } = st;
  const count = Math.floor(STATUE.length * 2 * (w / 4200));
  let num = 0; // 样式序游标(cs:16970 顺序轮换)
  const yMin = Math.floor((gs.worldSurface * 2 + gs.rockLevel) / 3);
  for (let i = 0; i < count; i++) {
    if (num >= STATUE.length) num = 0;
    const [sheet, style] = STATUE[num];
    let done = false;
    let fail = 0;
    while (!done) {
      let x = rng.int(20, w - 21);
      let y = rng.int(yMin, h - 301);
      // 海洋回避(cs:16989 oceanDepths)——y > oceanLevel 直接 false 必须前置：
      // 否则深层海滩列（y 超过海平面线）会被误拒重掷
      const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      let guard = 100;
      while (y <= oceanTop && (x < gs.beachDistance || x > w - gs.beachDistance) && guard-- > 0) {
        x = rng.int(20, w - 21);
        y = rng.int(yMin, h - 301);
      }
      if (guard <= 0) { done = true; break; }
      // 向下扫到首个 active 格,雕像坐其上一格(cs:17014-17018)
      while (y < h && !st.flags[st.idx(x, y)]) y++;
      if (y >= h) { done = true; break; }
      y--;
      // cs:17036 anyShimmer 门（PlaceTile 调用前置）+ cs:59501 PlaceTile 前奏
      // tile.Clear(Tile|TilePaint|Slope)：**任何失败尝试也会清** inactive 锚格的
      // half/slope/type/帧（golden 半砖位 v0 的来源；须在一切本地门之前——
      // 原版 pass 无边界门，PlaceTile 照调）。WWW 批 2026-08-18 接线。
      // ★PPPP 补 else-if 支（cs:59503-59507）：锚格 **活性** 且非 frameImportant 时
      //   ResetsHalfBrickPlacementAttempt[num]（105/349 不在例外表 → 恒 true）→
      //   halfBrick(false)+帧归零（type/active 保留）。触发场景=随机 y 落在岩体内 →
      //   下扫首格即活性 → y-- 锚到活性半砖泥/石 → 放置必败但半砖被原版清掉
      //   （#58 残余 7 Hf：(3063,475) 等七格 H0>1 的真身）。
      {
        const ai = st.idx(x, y);
        const shimmer = st.liquid[ai] > 0 && st.liquidType[ai] === 4 /* LIQ_SHIMMER */;
        if (!shimmer) {
          if (!st.flags[ai]) {
            st.half[ai] = 0; st.slope[ai] = 0; st.type[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
          } else if (!TILE_DEFS[st.type[ai]]?.framed) {
            st.half[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
          }
        }
      }
      if (y < 2 || !st.inBounds(x + 1, y - 2)) { fail++; if (fail >= 10000) { done = true; } continue; }
      // 2×3 净空(PlaceTile forced 语义:占用格须非 active)
      let ok = true;
      for (let dx = 0; dx < 2 && ok; dx++) {
        for (let dy = -2; dy <= 0 && ok; dy++) {
          if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
        }
      }
      // ★Place2xX 底座门（cs:39762）：SolidTile2(x,y+1) && SolidTile2(x+1,y+1)——
      //   SolidTile2（cs:70178）= active && 生成期 tileSolid && slope==0 && !halfBrick
      //   && !inActive（无 solidTop 条件，勿用 SolidTile）。曾整门缺失 → #58 干净基座
      //   下 100+ 雕像错位（半砖/坡面/非实心底座被误收）。WWW 批 2026-08-18 修。
      if (ok) {
        for (const bx of [x, x + 1]) {
          const bi = st.idx(bx, y + 1);
          if (!st.flags[bi] || st.half[bi] || st.slope[bi] !== 0
            || ((st.wire[bi] >>> 5) & 1) === 1 || !vanGenSolidType(st.type[bi])) { ok = false; break; }
        }
      }
      if (!ok) { fail++; if (fail >= 10000) { done = true; } continue; }
      const tile = sheet === 349 ? STATUE_349 : STATUE_105;
      if (!tile) { done = true; break; }
      // 雕像帧换行（PlaceTile case 105，cs:39716-39720）：每行 55 列——
      // frameX=(style%55)*36、frameY=floor(style/55)*54。此前单轴 style*36，
      // style≥55 全部越界错位（Tiles_105 宽 1980=55 列）
      const row = Math.floor(style / 55);
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          st.setTileSilent(x + dx, y - 2 + dy, tile, (style - row * 55) * 36 + dx * 18, row * 54 + dy * 18);
        }
      }
      if (STATUES_WITH_TRAPS.has(num)) placeStatueTrap(st, x, y);
      num++;
      done = true;
    }
  }
}
