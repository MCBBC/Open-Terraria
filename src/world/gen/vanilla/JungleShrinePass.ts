// 原版 "JungleShrines"(cs:16059-16213)+ "ChestsInJungleShrines"(cs:17308)1:1。
// 数量 = rand(7,12) × w/4200;落点在地牢异侧半区、(ws+rockLevel)/2..h-400,
// 中心须丛林草(tile 60),±30 步进 3 扫描排除蜂巢/蜥蜴砖/泥砖/红砖(225/229/226/119/120)
// 与蜂巢墙(86/87);jungleHut 每世界五选一 [119,120,158,175,45]→墙 [23,24,42,45,10];
// 实体壳 + 空腔(墙) + 腔内火把(样式3) + 底部入口 + 泥地基 + 金字塔顶;
// 神龛中心记录 → 常春藤宝箱(style 10,主件序 GetNextJungleChestItem)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, nextJungleItem, type ChestSink } from './BuriedChestsPass';

function sheetTile(sheet: number): number {
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const d = TILE_DEFS[id];
    if (d && d.vanilla?.sheet === sheet && d.key.startsWith('v_')) return id;
  }
  return -1;
}

const HUT_TILES = [sheetTile(119), sheetTile(120), TILE_BY_KEY['v_158_rich_mahogany']!,
  TILE_BY_KEY['v_175_tin_brick']!, TILE_BY_KEY['v_45_gold_brick']!];
const HUT_WALLS = [23, 24, 42, 45, 10];
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUD = TILE_BY_KEY['mud']!;
const TORCH = TILE_BY_KEY['torch']!;
const BAD_TILES = new Set([sheetTile(225), sheetTile(229), TILE_BY_KEY['v_226_lihzahrd_brick']!,
  sheetTile(119), sheetTile(120)]);

/** JungleShrines pass:返回神龛中心列表(供后续常春藤箱 pass 消费) */
export function runJungleShrinePass(st: TileStore, rng: RNG, gs: GenState): Array<{ x: number; y: number }> {
  const { w, h } = st;
  const spots: Array<{ x: number; y: number }> = [];
  // jungleHut 每世界五选一(cs:11182 Next(5) → cs:11335 switch)
  const hutIdx = rng.int(0, 4);
  const hutTile = HUT_TILES[hutIdx];
  if (hutTile < 0) return spots;
  const hutWall = HUT_WALLS[hutIdx];

  const count = Math.floor(rng.int(7, 11) * (w / 4200));
  let x = rng.int(40, w - 41);
  let y = rng.int(Math.floor((gs.worldSurface + gs.rockLevel) / 2), h - 401);
  let retries = 0;
  for (let i = 0; i < count; i++) {
    let placed = false;
    while (!placed) {
      retries++;
      // 地牢异侧半区(cs:16071-16076)
      x = rng.int(40, Math.floor(w / 2) - 41);
      if (gs.dungeonSide <= 0) x += Math.floor(w / 2);
      y = rng.int(Math.floor((gs.worldSurface + gs.rockLevel) / 2), h - 401);
      const halfW = rng.int(2, 3);  // num5
      const halfH = rng.int(2, 3);  // num6
      if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)] || st.type[st.idx(x, y)] !== JUNGLE_GRASS) continue;
      // ±30 步进 3 排除扫描(cs:16088-16102)
      let bad = false;
      for (let jx = x - 30; jx < x + 30 && !bad; jx += 3) {
        for (let jy = y - 30; jy < y + 30 && !bad; jy += 3) {
          if (!st.inBounds(jx, jy)) continue;
          if (st.flags[st.idx(jx, jy)] && BAD_TILES.has(st.type[st.idx(jx, jy)])) bad = true;
          const wl = st.wall[st.idx(jx, jy)];
          if (wl === 86 || wl === 87) bad = true;
        }
      }
      if (bad) {
        if (retries > w * 10) { retries = 0; break; } // 放弃本座(cs:16205)
        continue;
      }
      // 实体壳(cs:16116-16127)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        for (let ly = y - halfH - 1; ly <= y + halfH + 1; ly++) {
          if (!st.inBounds(lx, ly)) continue;
          st.setTileSilent(lx, ly, hutTile);
          st.liquid[st.idx(lx, ly)] = 0;
          st.liquidType[st.idx(lx, ly)] = 0;
        }
      }
      // 空腔 + 墙(cs:16129-16137)
      for (let lx = x - halfW; lx <= x + halfW; lx++) {
        for (let ly = y - halfH; ly <= y + halfH; ly++) {
          if (!st.inBounds(lx, ly)) continue;
          st.setTileSilent(lx, ly, 0);
          st.setWallSilent(lx, ly, hutWall);
        }
      }
      // 腔内火把(样式 3 丛林火把,cs:16139-16150;帧 22px 步长)
      for (let t = 0; t < 100; t++) {
        const tx = rng.int(x - halfW, x + halfW);
        const ty = rng.int(y - halfH, y + halfH - 2);
        if (!st.flags[st.idx(tx, ty)]) {
          st.setTileSilent(tx, ty, TORCH, 3 * 22, 0);
          break;
        }
      }
      // 底部入口:掏空壳底两行(cs:16152-16162)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        for (let ly = y + halfH - 2; ly <= y + halfH; ly++) {
          if (st.inBounds(lx, ly)) st.setTileSilent(lx, ly, 0);
        }
      }
      // 泥地基:壳底向下最多 4 格填泥(cs:16164-16174)
      for (let lx = x - halfW - 1; lx <= x + halfW + 1; lx++) {
        let fill = 4;
        let ly = y + halfH + 2;
        while (ly < h && !st.flags[st.idx(lx, ly)] && fill > 0) {
          st.setTileSilent(lx, ly, MUD);
          ly++; fill--;
        }
      }
      // 金字塔顶(cs:16176-16194)
      let topHalf = halfW - rng.int(1, 2);
      let ty = y - halfH - 2;
      while (topHalf > -1) {
        for (let lx = x - topHalf - 1; lx <= x + topHalf + 1; lx++) {
          if (st.inBounds(lx, ty)) st.setTileSilent(lx, ty, hutTile);
        }
        topHalf -= rng.int(1, 2);
        ty--;
      }
      spots.push({ x, y });
      retries = 0;
      placed = true;
    }
  }
  return spots;
}

/** ChestsInJungleShrines pass(cs:17308):神龛中心放常春藤箱;失败掏 3×3 后原地重试 */
export function runJungleChestsPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, spots: Array<{ x: number; y: number }>,
): void {
  for (const s of spots) {
    const main = nextJungleItem(gs, rng);
    if (!placeBuriedChest(st, rng, gs, chests, s.x + rng.int(0, 1), s.y, { style: 10, loot: main, flags: { ivy: true } })) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (st.inBounds(s.x + dx, s.y + dy)) st.setTileSilent(s.x + dx, s.y + dy, 0);
        }
      }
      placeBuriedChest(st, rng, gs, chests, s.x, s.y, { style: 10, loot: main, flags: { ivy: true } });
    }
  }
}
