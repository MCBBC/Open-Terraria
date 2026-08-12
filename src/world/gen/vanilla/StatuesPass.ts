// 原版 "Statues" pass 1:1(cs:16952-17055 + SetupStatueList cs:4395 + PlaceStatueTrap cs:4436)。
// statueList 73 项:0-43 段 (105,i) 但 [34]=(349,0)、[43]=(105,50),
// 追加 63,64,65,66,68,69,70,71,72,73,75,51..62,77,78,67,74,37,2。
// 数量 = floor(73*2*w/4200);逐个顺序轮换取样式,落点向下扫到首个实心格上一格放置;
// 陷阱雕像样式 {4,7,10,18}(GenVars.StatuesWithTraps)→ 邻近放飞镖陷阱 137 并拉线。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';

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
const TRAP = statueTileKey(137);
const WIRE_RED = TileStore.WIRE_RED;

/** PlaceStatueTrap(cs:4436):±10 盒内找"空格+下方实心"位放飞镖陷阱并向雕像拉红石线 */
export function placeStatueTrap(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y) || x < 20 || x > st.w - 21 || y < 20 || y > st.h - 21 || !TRAP) return;
  for (let i = -10; i <= 10; i++) {
    for (let j = -10; j <= 10; j++) {
      const tx = x + i, ty = y + j;
      if (!st.inBounds(tx, ty + 1)) continue;
      const above = st.flags[st.idx(tx, ty)];
      const below = st.flags[st.idx(tx, ty + 1)];
      if (above) continue;
      if (!below || !TILE_DEFS[st.type[st.idx(tx, ty + 1)]]?.solid) continue;
      if (st.type[st.idx(tx, ty + 1)] === 162) continue; // 冰(原版特判)
      st.setTileSilent(tx, ty, TRAP, 0, 0);
      // WireLine:先横后竖的 L 形红石线
      const sx = Math.sign(x - tx), sy = Math.sign(y - ty);
      for (let wx = tx; wx !== x; wx += sx) st.wire[st.idx(wx, ty)] |= WIRE_RED;
      for (let wy = ty; wy !== y; wy += sy) st.wire[st.idx(x, wy)] |= WIRE_RED;
      st.wire[st.idx(x, y)] |= WIRE_RED;
      return;
    }
  }
}

/** Statues pass 主体。须在洞穴/生物群系成形后调用(原版序:SettleLiquids 后、地下屋前) */
export function runStatuesPass(st: TileStore, rng: RNG, gs: GenState): void {
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
      if (y < 2 || !st.inBounds(x + 1, y - 2)) { fail++; if (fail >= 10000) { done = true; } continue; }
      // 2×3 净空(PlaceTile forced 语义:占用格须非 active)
      let ok = true;
      for (let dx = 0; dx < 2 && ok; dx++) {
        for (let dy = -2; dy <= 0 && ok; dy++) {
          if (st.flags[st.idx(x + dx, y + dy)]) ok = false;
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
