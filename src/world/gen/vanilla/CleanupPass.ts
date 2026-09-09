// 原版 pass 37 "Clean Up Dirt"(L6873)移植:
// 1) 表层天然墙清理:地表以上暴露区的土/雪/丛林/蜂巢墙(2/40/64/86)清除(含左右 ±3 邻列,±2/3 各 50%);
// 2) ScanTileColumnAndRemoveClumps(L4141):逐列找竖向连续 < tileCounterMax(20) 的可清实心段,
//    连通块总 size < 20 则整块移除(消灭浮空散块)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { WALL_DUNGEON_SHEETS } from '../../DungeonDualZones';   // ★IIIII228 Main.wallDungeon 全表（★IIIII229 路径修正:vanilla/ 深度应 ../../,真身=src/world/DungeonDualZones.ts——原 ../ 单级解析不到致全树 transform 炸）

const TILE_COUNTER_MAX = 20;
const EBONSAND = TILE_BY_KEY['v_112_ebonsand_block']!;
const CRIMSAND = TILE_BY_KEY['v_234_crimsand_block']!;

// ★IIIII228 DoNoSurfaceFillTheTop（WorldGen.cs:1056-1080，DirtWallCleanup pass 头
//  noSurface 支 :15324-15328——if(noSurface){FillTheTop()} else {清墙} 二分臂）：
//  全图 X × 顶带 Y<100+Next(2) 逐格：非地牢墙格 → 强制激活（type 不动,幽灵块落地），
//  丛林草 60 / 蘑菇草 70 → 泥 59。★掷骰怪癖：`j < 100 + genRand.Next(2)` 的
//  Next(2) 在 for 条件里【每次迭代重掷】——每列 ~101 掷（j<100 全掷 + j=100 处
//  1 掷定尾),JS for 条件同语义逐字照抄（勿"优化"成列头单掷）。
//  tileDungeon 集 = Main.cs:8131-8136 {41,43,44,677,678,679}。
export function runNoSurfaceFillTheTop(st: TileStore, rng: RNG, gs: GenState): void {
  const DUNGEON_TILE = new Set([
    TILE_BY_KEY['v_41_blue_brick']!, TILE_BY_KEY['v_43_green_brick']!, TILE_BY_KEY['v_44_pink_brick']!,
  ]);
  for (const k of ['v_677_blue_dungeon_slab', 'v_678_green_dungeon_slab', 'v_679_pink_dungeon_slab']) {
    const id = TILE_BY_KEY[k];
    if (id !== undefined) DUNGEON_TILE.add(id);
  }
  const MUD = TILE_BY_KEY['mud']!;
  const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
  const MUSHROOM_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
  for (let i = 0; i < st.w; i++) {
    for (let j = 0; j < 100 + rng.nextInt(2); j++) {     // Next(2) 每迭代重掷（原版怪癖）
      if (!st.inBounds(i, j)) continue;
      const ii = st.idx(i, j);
      if (WALL_DUNGEON_SHEETS.has(st.wall[ii])) continue;
      const tt = st.type[ii];
      if (!DUNGEON_TILE.has(tt)) {
        // tile.active(true)：type 原样保留（含 type0 活性格=原版同款怪癖）、仅置位
        st.flags[ii] |= 1;
      }
      if (tt === JUNGLE_GRASS || tt === MUSHROOM_GRASS) {
        st.setTileSilent(i, j, MUD);
      }
    }
  }
}

export function runCleanupPass(st: TileStore, rng: RNG, gs: GenState): void {
  const __cap = (globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void }).__swWallCap;
  if (__cap) __cap('cleanup', gs, st);
  const { w } = st;
  // 1) 表层墙清理两遍(cs L6877-6938):
  //    左→右(3..w-4):中央清 2/40/64/86;右→左(w-5..5):中央清 2/40/64(不重复清蜂巢墙)。
  //    邻列两遍都只清 2/40;邻列清理门禁 = !active || type∉沙系(53/112/234,第二遍仅 53),
  //    ±2/±3 的 Next(2) 仅当墙命中才消费(cs:15340 短路)
  for (let dir = 0; dir < 2; dir++) {
    const from = dir === 0 ? 3 : w - 5;
    const to = dir === 0 ? w - 4 : 5;
    for (let x = from; dir === 0 ? x <= to : x >= to; x += dir === 0 ? 1 : -1) {
      let open = true;
      for (let y = 0; y < gs.worldSurface; y++) {
        if (open) {
          clearWallSet(st, x, y, dir === 0 ? [2, 40, 64, 86] : [2, 40, 64]);
          const ii = st.idx(x, y);
          const isSand = dir === 0
            ? (st.type[ii] === T.SAND || st.type[ii] === EBONSAND || st.type[ii] === CRIMSAND)
            : st.type[ii] === T.SAND;
          // cs:15334 门禁 = !active || type∉{53,112,234}(幽灵沙列有 type 无 flags,也进门并掷 4 骰)
          if (!st.flags[ii] || !isSand) {
            clearWallSet(st, x - 1, y, [2, 40]);
            // cs:15340/15344/15352/15356:±2/±3 的 Next(2) 仅当墙∈{2,40} 才消费(&& 短路)
            const rollIf = (xx: number) => {
              const ji = st.idx(xx, y);
              if ((st.wall[ji] === 2 || st.wall[ji] === 40) && rng.next() < 0.5) st.wall[ji] = 0;
            };
            rollIf(x - 2);
            rollIf(x - 3);
            clearWallSet(st, x + 1, y, [2, 40]);
            rollIf(x + 2);
            rollIf(x + 3);
            // cs:15360-15364:flag=false 在非沙分支内,仅 active 才关(原在分支外)
            if (st.flags[ii]) open = false;
          }
        } else {
          // 重新开放判定:本格与下方 4 格、左右 2 格全无墙且上方 4 格无活性块
          let reopen = true;
          for (let dy = 0; dy <= 4 && reopen; dy++) if (st.wall[st.idx(x, y + dy)] !== 0) reopen = false;
          for (const dx of [-2, -1, 1, 2]) if (st.wall[st.idx(x + dx, y)] !== 0) reopen = false;
          for (let dy = 0; dy <= 3 && reopen; dy++) if (st.flags[st.idx(x, y + dy)]) reopen = false;
          if (reopen) open = true;
        }
      }
    }
  }
  // 2) 散块清除已移至 MudCaves pass（1456 调用点 cs:12526—— DirtWallCleanup 只清墙；
  //    此前重复跑=双倍清除偏离原版，已删）
}

function clearWallSet(st: TileStore, x: number, y: number, set: number[]): boolean {
  if (!st.inBounds(x, y)) return false;
  const wl = st.wall[st.idx(x, y)];
  if (set.includes(wl)) { st.wall[st.idx(x, y)] = 0; return true; }
  return false;
}
