// 原版 GravitatingSandCleanup（1456 cs:15198-15226，注册位 Lakes(14613) 之后、
// Shimmer(15256) 之前）：逐列自底向上扫，地表内（y < worldSurface）的 Falling 系
// 方块（沙/邪沙/淤泥/雪泥/贝壳堆等，TileID.Sets.Falling cs:391）若与上方上一处实心
// 之间有空腔，把整段空腔 ResetToType 成同型方块——悬空沙柱"落定"，杜绝海岸/沙滩带
// 生成后残留的浮空沙。纯确定性扫描，零掷骰。
import type { TileStore } from '../../TileStore';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';
import { solidOrSlopedTile } from './HalfBrickPass';

/** TileID.Sets.Falling（1456 Terraria.ID/TileID.cs:391）：53,234,112,116,224,123,330,331,332,333,495 */
const FALLING = new Set<number>([
  TILE_BY_KEY['sand'] ?? 0,                    // 53
  TILE_BY_KEY['v_234_crimsand_block'] ?? 0,    // 234
  TILE_BY_KEY['v_112_ebonsand_block'] ?? 0,    // 112
  TILE_BY_KEY['v_116_pearlsand_block'] ?? 0,   // 116
  TILE_BY_KEY['v_224_slush_block'] ?? 0,       // 224
  TILE_BY_KEY['silt'] ?? 0,                    // 123
  TILE_BY_KEY['v_330_copper_coin_pile'] ?? 0,  // 330
  TILE_BY_KEY['v_331_silver_coin_pile'] ?? 0,  // 331
  TILE_BY_KEY['v_332_gold_coin_pile'] ?? 0,    // 332
  TILE_BY_KEY['v_333_platinum_coin_pile'] ?? 0,// 333
  TILE_BY_KEY['v_495_shell_pile_block'] ?? 0,  // 495
].filter((v) => v !== 0));

/** Tile.ResetToType（1456 Tile.cs:251-260）：liquid=0 + sTileHeader=32（仅 active 位
 *  ——★同时清块漆 sTileHeader 低 5 位与 inActive 位）+ bTileHeader=0（★墙漆+
 *  liquidType）+ bTileHeader2/3=0（★coat 位/帧元数据）+ frame 清零 + 换 type；
 *  wall 不动（wall 为独立 ushort 字段，不在 header 里）。
 *  ★R13-5（2026-08-24）补 paint/paintWall/coat 三通道清零——本 pass 注册位
 *  cs:15210 在一切油漆 pass 之前普通世界不可达，但与原版字段面对齐（潜伏缺口）。 */
function resetToType(st: TileStore, x: number, y: number, type: number): void {
  const i = st.idx(x, y);
  st.type[i] = type;
  st.flags[i] = 1;          // sTileHeader = 32（active 位）
  st.liquid[i] = 0;
  st.liquidType[i] = 0;     // liquidType 位（bTileHeader 5-6 位）
  st.half[i] = 0;
  st.slope[i] = 0;
  st.frameX[i] = 0;
  st.frameY[i] = 0;
  st.wire[i] = 0;           // bTileHeader/bTileHeader2 电路位（电线/致动位清零）
  st.paint[i] = 0;          // sTileHeader & 0x1F（块漆）
  st.paintWall[i] = 0;      // bTileHeader & 0x1F（墙漆）
  st.coat[i] = 0;           // bTileHeader3 coat 位（echo/fullbright）
}

export function runGravitatingSandPass(st: TileStore, gs: GenState): void {
  // ★R13-5①：门 `!Skyblock.denyAllGeneration && !SecretSeed.roundLandmasses.Enabled`
  //  （cs:15212）——planetoids 世界跳过整 pass（曾缺门）
  if (gs.seedFlags?.roundLandmasses) return;
  for (let x = 0; x < st.w; x++) {
    let flag = false;
    let num = 0;
    for (let y = st.h - 1; y > 0; y--) {
      if (!solidOrSlopedTile(st, x, y)) continue;
      const type = st.type[st.idx(x, y)];
      // cs:15210：上方曾有实心 && 在地表内 && 与上一实心不贴合 && Falling 系
      // → 把 (y, num) 空腔整段填成同型
      if (flag && y < gs.worldSurface && y !== num - 1 && FALLING.has(type)) {
        for (let j = y; j < num; j++) resetToType(st, x, j, type);
      }
      flag = true;
      num = y;
    }
  }
}
