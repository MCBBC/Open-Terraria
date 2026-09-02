// 原版 Pots pass 1:1（1456 WorldGen.cs:18108-18286）——自 WorldGen.ts potPass 外提
// （尾部清剿批 2026-08-17：实现体出禁改文件，行为/掷序零变化）。
// count = 面积×0.0008(小 4200×1200 = 4032 个),每个成功点放 1 罐;
// 进度 >75% 强制从地表浅层起扫、>93% 强制地狱行;2 宽×2 高 PlacePot
// (cs:54082:frameX = k*18 + 变体*36、frameY = (l+1)*18 + style*36);
// 样式按地面 tile/墙(冰雪 4-6/丛林草 7-9/地牢 10-12/腐化 16-18/猩红 22-24/
// 花岗岩 31-33/蜥蜴砖 28-30/大理石墙 34-36/地狱 13-15/默认 0-3)。
// 墓园段（cs:18110-18120）留在外层 potPass（秘密种子门，普通种子零掷）。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { vanGenSolidType } from './GenSolid';

export function runPotsPass(store: TileStore, rng: RNG, gs: GenState): void {
  const g0 = globalThis as { __swPotCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swPotCap?.(gs, store); } catch { /* probe */ }
  const { w, h } = store;
  const POT = TILE_BY_KEY['pot']!;
  const count = Math.floor(w * h * 0.0008);
  const surfHigh = Math.max(1, Math.floor(gs.worldSurfaceHigh));
  const surfLow = Math.floor(gs.worldSurfaceLow);

  const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!;
  const JUNGLE = TILE_BY_KEY['v_60_jungle_grass_block']!;
  const LIHZARD = TILE_BY_KEY['v_226_lihzahrd_brick'] ?? -1;
  const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const MARBLE_WALLS = new Set([187, 216, 223]);

  for (let n = 0; n < count; n++) {
    const progress = n / count;
    // 原版外层 while(!flag) 重试：每罐最多 10000 次全列尝试（cs:18198/18290 num7）
    let placed = false;
    for (let attempt = 0; attempt < 10000 && !placed; attempt++) {
      // ★Next(a,b) 独占上界：y0=Next(surfHigh, h-10)、x=Next(20, w-20)——rng.int 含端
      //  故上界各 -1（曾 int(20, w-20)=Next(20,4181)：分布/模数双偏 → 全 pass 流错位）
      let y0 = rng.int(surfHigh, Math.max(surfHigh + 1, h - 11));
      if (progress > 0.93) y0 = h - 150;          // 尾段强制地狱行(cs:18194)
      else if (progress > 0.75) y0 = surfLow;     // 后 1/4 起地表浅层(cs:18196)
      const x = rng.int(20, w - 21);
      // 向下扫描(cs:18210-18286):遇首个实心(且上格非岩浆/微光)后进入候选模式
      let foundSolid = false;
      for (let y = y0; y < h - 20 && !placed; y++) {
        const t = store.get(x, y);
        if (!foundSolid) {
          const liq = store.liquid[store.idx(x, y - 1)];
          const ltype = store.liquidType[store.idx(x, y - 1)];
          // ★cs:18220 `active() && tileSolid[type]`:必须查激活位——TileStore.get 返回
          //   裸 type,TileRunner 幽灵格(有 type 无 flags)会提前触发候选模式,
          //   把瓦罐 pass 的首实心锚点整体上移(根因)
          if (store.flags[store.idx(x, y)] !== 0 && vanGenSolidType(t)
            && !(liq > 0 && ltype === 2) && !(liq > 0 && ltype === 4)) foundSolid = true;
          continue;
        }
        // cs:18216 门禁:y < Main.worldSurface(平均地表线)时必须有墙——
        // 曾误用 worldSurfaceLow(谷底线,几乎恒小于 y)→ 地表露天处全放,陶罐泛滥
        if (y < gs.worldSurface && store.wall[store.idx(x, y)] === 0) continue;
        // cs:18220：style=Next(0,4) 在该行通过墙门禁后立即掷（ground 门禁之前——
        // 消费顺序 1:1，漏掷会平移后续 RNG 流）
        let style = rng.int(0, 3);
        const ground = store.get(x, y + 1);
        if (ground === 0 || !store.flags[store.idx(x, y + 1)]) continue;
        const liq2 = store.liquid[store.idx(x, y)];
        const ltype2 = store.liquidType[store.idx(x, y)];
        if ((liq2 > 0 && ltype2 === 2) || (liq2 > 0 && ltype2 === 4)) continue; // anyLava/anyShimmer 才拒（水/蜜可放）
        if (oceanDepthsAt(store, gs, x, y)) continue;
        // 样式覆写链（cs:18235-18266，非互斥、后命中覆盖先命中；RNG 仅在命中时消耗）
        const sheetOf = (id: number) => TILE_DEFS[id]?.vanilla?.sheet ?? -1;
        const gs2 = sheetOf(ground);
        if (ground === SNOW || ground === ICE || gs2 === 162) style = rng.int(4, 6);
        if (ground === JUNGLE) style = rng.int(7, 9);
        {
          const wl = store.wall[store.idx(x, y)];
          // IsDungeonPlatformOrShelf（cs:11507）：type19 且 frameY/18 ∈ {6,7,8,9..12}
          const shelfRow = Math.floor(store.frameY[store.idx(x, y + 1)] / 18);
          const inDun = DUNGEON_WALLS.has(wl)
            || gs2 === 41 || gs2 === 43 || gs2 === 44 || gs2 === 481 || gs2 === 482 || gs2 === 483
            || (gs2 === 19 && shelfRow >= 6 && shelfRow <= 12);
          if (inDun) style = rng.int(10, 12);
        }
        if (gs2 === 23 || gs2 === 25 || gs2 === 22 || gs2 === 163) style = rng.int(16, 18); // 腐化草/黑檀石/魔矿/紫冰
        if (gs2 === 199 || gs2 === 203 || gs2 === 204 || gs2 === 200) style = rng.int(22, 24);
        if (sheetOf(ground) === 367) style = rng.int(31, 33);  // cs:18264：大理石 367 → 31-33（曾错查 368 花岗岩）
        if (ground === LIHZARD) style = rng.int(28, 30);
        if (MARBLE_WALLS.has(store.wall[store.idx(x, y)])) style = rng.int(34, 36);
        if (y > h - 200) style = rng.int(13, 15);  // Main.UnderworldLayer = maxTilesY-200
        // PlacePot（cs:54529）：2×2 净空 + 双列下方 nactive/整砖/无坡/实心 + remix 拒收带
        if (!placePot(store, rng, x, y, POT, style, gs.seedFlags.remix === true)) continue;
        placed = true;
      }
    }
  }
}

/** PlacePot（1457 WorldGen.cs:54529≡1458 同号）1:1：2×2（x..x+1, y-1..y）须净空；
 *  下方双列须 nactive && !halfBrick && slope==0 && tileSolid；成功才掷 Next(3) 变体。
 *  ★IIIII186 remix 拒收带（cs:54532-54535）：`remix && x∈(0.48w,0.52w) && y>h-220`
 *  → flag=false（**先于净空检查、不掷变体骰**）——JS 曾整缺此门，remix 下中央深带
 *  多放罐且重试账错位（#71 A=16,837 主源之一;x86 侧拒后继续扫列至 h-20 烧扫描掷） */
export function placePot(store: TileStore, rng: RNG, x: number, y: number, type: number, style: number,
  remix = false): boolean {
  if (remix && x > store.w * 0.48 && x < store.w * 0.52 && y > store.h - 220) return false;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (!store.inBounds(x + dx, y + dy) || store.flags[store.idx(x + dx, y + dy)]) return false;
    }
    if (!store.inBounds(x + dx, y + 1)) return false;
    const gi = store.idx(x + dx, y + 1);
    if (!store.flags[gi] || store.half[gi] || store.slope[gi] !== 0) return false;
    if (!vanGenSolidType(store.type[gi])) return false;
  }
  const variant = rng.int(0, 2) * 36;   // genRand.Next(3)*36（仅成功时消费）
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      store.setTileSilent(x + dx, y + dy, type, dx * 18 + variant, (dy + 1) * 18 + style * 36);
      store.half[store.idx(x + dx, y + dy)] = 0;
    }
  }
  return true;
}

/** oceanDepths（WorldGen.cs:10968）：y > oceanLevel 直接 false；海滩列才 true */
export function oceanDepthsAt(store: TileStore, gs: GenState, x: number, y: number): boolean {
  const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  if (y > oceanLevel) return false;
  return x < gs.beachDistance || x > store.w - gs.beachDistance;
}
