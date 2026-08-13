// 原版矿石 pass 27 "Shinies"（1405 WorldGen.cs:5837-5922；1456 OresAndShinies:13233 常数一致）
// + 宝石 pass 36 "Gems"（1405 L6754-6830，含尾部浮沙拱形化循环）。
// 密度=面积×常数、深度三带（surfLow..surfHigh / surfHigh..rockHigh / rockLow..底）、
// 脉体=TileRunner（菱形椭圆），邪恶矿 22/204 只在岩层以下。
// RNG 映射：C# Next(a,b) 左闭右开 → rng.int(a, b-1)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { tileRunner } from './TileRunner';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { flipGenSolid } from './GenSolid';

/** 单深度带放矿：count 次尝试，y∈[yMin,yMax)，strength/steps 各自区间 */
function band(
  st: TileStore, rng: RNG, gs: GenState,
  count: number, yMin: number, yMax: number,
  type: number, s: [number, number], steps: [number, number],
) {
  for (let i = 0; i < count; i++) {
    const x = rng.int(0, st.w - 1);              // Next(0, maxTilesX)
    const y = rng.int(Math.max(0, yMin), yMax - 1); // Next(yMin, yMax)
    tileRunner(st, rng, gs, x, y, {
      strength: rng.int(s[0], s[1]), steps: rng.int(steps[0], steps[1]),
      type, addTile: false,
    });
  }
}

const _origInt = null;
export function runShiniesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const area = st.w * st.h;
  const surfLow = gs.worldSurfaceLow, surfHigh = gs.worldSurfaceHigh;
  const rockHigh = gs.rockLevelHigh, rockLow = gs.rockLevelLow;

  // 铜/锡：三带 6e-5 / 8e-5 / 2e-4（cs:5840-5862）
  band(st, rng, gs, Math.floor(area * 6e-5), surfLow, surfHigh, gs.oreTiers.copper, [3, 5], [2, 5]);
  band(st, rng, gs, Math.floor(area * 8e-5), surfHigh, rockHigh, gs.oreTiers.copper, [3, 6], [3, 6]);
  band(st, rng, gs, Math.floor(area * 2e-4), rockLow, st.h, gs.oreTiers.copper, [4, 8], [4, 7]);
  // 铁/铅：三带 3e-5 / 8e-5 / 2e-4（cs:5863-5892）
  band(st, rng, gs, Math.floor(area * 3e-5), surfLow, surfHigh, gs.oreTiers.iron, [3, 6], [2, 4]);
  band(st, rng, gs, Math.floor(area * 8e-5), surfHigh, rockHigh, gs.oreTiers.iron, [3, 5], [3, 5]);
  band(st, rng, gs, Math.floor(area * 2e-4), rockLow, st.h, gs.oreTiers.iron, [4, 8], [4, 7]);
  // 银/钨：中层 2.6e-5 / 深层 1.5e-4（cs:13548-13562）；天空带 1.7e-4 在金深层**之后**（cs:13585）
  band(st, rng, gs, Math.floor(area * 2.6e-5), surfHigh, rockHigh, gs.oreTiers.silver, [3, 5], [3, 5]);
  band(st, rng, gs, Math.floor(area * 1.5e-4), rockLow, st.h, gs.oreTiers.silver, [4, 8], [4, 7]);
  // 金/铂：深层 1.2e-4（cs:13563-13577）——注册序在银天空带之前（曾倒置致流分叉）
  band(st, rng, gs, Math.floor(area * 1.2e-4), rockLow, st.h, gs.oreTiers.gold, [4, 7], [4, 7]);
  // 银/钨天空带 1.7e-4（cs:13585-13598）/ 金近地表带 1.2e-4（cs:13599-13612）
  band(st, rng, gs, Math.floor(area * 1.7e-4), 0, surfLow, gs.oreTiers.silver, [4, 8], [4, 7]);
  band(st, rng, gs, Math.floor(area * 1.2e-4), 0, Math.max(1, surfLow - 20), gs.oreTiers.gold, [4, 7], [4, 7]);
  // 邪恶矿：2.25e-5，仅岩层以下（cs:5932-5949）
  const evil = gs.crimson ? TILE_BY_KEY['ore_crimtane']! : TILE_BY_KEY['ore_demonite']!;
  band(st, rng, gs, Math.floor(area * 2.25e-5), gs.rockLevel, st.h, evil, [3, 5], [4, 7]);
}

/** 宝石 pass 36（cs:6754-6814）：六宝石独立数量（w×[0.3,0.1,0.25,0.45,0.5,0.05]×0.2），
 *  拒绝采样到石头上再 TileRunner；type 63-68 = 紫晶/黄玉/蓝宝/绿宝/红宝/钻石。 */
export function runGemsPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:15114 `Main.tileSolid[484] = false`）——DesertBiome
  //   头（cs:12537）已翻过,此处为原版冗余重放,接线仅为时间线存档（484 生成期恒非实心）。
  flipGenSolid([484], false);
  const gems: Array<[string, number]> = [
    ['gem_sapphire', 0.3],   // 63
    ['gem_ruby', 0.1],       // 64
    ['gem_emerald', 0.25],   // 65
    ['gem_topaz', 0.45],     // 66
    ['gem_amethyst', 0.5],   // 67
    ['gem_diamond', 0.05],   // 68
  ];
  for (const [key, density] of gems) {
    const type = TILE_BY_KEY[key]!;
    const count = Math.floor(st.w * density * 0.2);
    for (let i = 0; i < count; i++) {
      // cs:15144-15152:do-while 至多 3 轮采样(num2 从 3 递减,命中即停);
      // 3 轮全 miss 则 num2==0 跳过 TileRunner。命中判定 = active() && type==1
      let tries = 3, x = 0, y = 0, hit = false;
      do {
        x = rng.int(0, st.w - 1);
        y = rng.int(gs.worldSurface, st.h - 1);
        const ii = st.idx(x, y);
        hit = st.flags[ii] !== 0 && st.type[ii] === T.STONE;
      } while (!hit && --tries > 0);
      if (tries !== 0) {
        tileRunner(st, rng, gs, x, y, {
          strength: rng.int(2, 5), steps: rng.int(3, 6), // Next(2,6)/Next(3,7)
          type, addTile: false,
        });
      }
    }
  }
  sandArch(st, gs);
}

/** 浮沙拱形化（cs:15166-15191，Gems pass 尾段）：悬空沙柱顶格平移到侧下方贴地——
 *  消除生成期浮沙，避免进游戏后大范围流沙塌落。
 *  ★S1：地下沙漠按**整列**跳过——cs:15172 `l<=UD.Left||l>=UD.Right` 才处理该列；
 *  GenVars.UndergroundDesertLocation 默认 Rectangle.Empty（GenVars.cs:138，
 *  Left=Right=0）→ 条件恒真、全列处理，ud=null 同义。旧版用蜂窝墙 187/216/217
 *  逐格代理，列内任一格无该墙即漏跳。
 *  ★S3：反向扫描列域 = [6,w-5]（cs:15168-15170：num6=w-5、num7=5，`l!=5` 停），
 *  旧版 [5,w-6] 错位 1 列（顺向 [5,w-6] 本就正确，勿动）。
 *  ★S4：源格 cs:15181 只 active(false) 保留 type（幽灵语义），旧版清成 0 号方块。 */
function sandArch(st: TileStore, gs: GenState) {
  // Main.tileSand（Main.cs:7177-7180）：53/112/116/234——旧漏 116 珍珠沙（S2）
  const SANDS = new Set<number>(
    ['sand', 'v_112_ebonsand_block', 'v_116_pearlsand_block', 'v_234_crimsand_block']
      .map((k) => TILE_BY_KEY[k])
      .filter((v): v is number => v != null),
  );
  const ud = gs.undergroundDesert;
  for (let dir = 0; dir < 2; dir++) {
    const step = dir === 0 ? 1 : -1;
    const x0 = dir === 0 ? 5 : st.w - 5;
    const x1 = dir === 0 ? st.w - 5 : 5;
    for (let x = x0; x !== x1; x += step) {
      if (ud && x > ud.x0 && x < ud.x1) continue;   // cs:15172 列级跳过（严格不等=界列仍处理）
      for (let y = 10; y < st.h - 10; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || !st.flags[st.idx(x, y + 1)]) continue;
        if (!SANDS.has(st.type[i]) || !SANDS.has(st.type[st.idx(x, y + 1)])) continue;
        const nx = x + step;
        if (st.flags[st.idx(nx, y)] || st.flags[st.idx(nx, y + 1)]) continue;
        // cs:15178-15180：自 m+1 起下落，终止于首个 active 或出界（InWorld padding 10），
        // n-- 后放置（旧版下界 h-1，与原版 padding 10 分叉）
        let ny = y + 1;
        for (;;) {
          if (!(nx >= 10 && nx < st.w - 10 && ny >= 10 && ny < st.h - 10)) break;
          if (st.flags[st.idx(nx, ny)]) break;
          ny++;
        }
        ny--;
        const sandType = st.type[i];                // 先取
        st.flags[i] = 0;                            // cs:15181 active(false)：保留 type/frame/坡
        const di = st.idx(nx, ny);                  // cs:15183-15184 active(true)+type——
        st.type[di] = sandType;                     // 字面同原版，不触碰目的格 frame
        st.flags[di] = 1;
      }
    }
  }
}
