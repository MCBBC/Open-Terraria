// 原版 pass 31 "Lakes" 1:1（1405 WorldGen.cs:6448-6560 + SonOfLakinater:48516）。
// 拒绝采样找地表湖位（避海滩/中心±5%/前湖±150/山丘±100/沙顶/猩红石/宝箱/地下沙漠），
// SonOfLakinater 自地表向下蜿蜒掏湖腔并灌水（首步上方漏斗入口 + 周壁泥土壳）。
// RNG 映射：Next(a,b) → rng.int(a, b-1)；NextFloat → rng.next()。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const MUD = TILE_BY_KEY['mud']!;
/** WallID.Sets.WallTypeToTerrainTileType（WallID.cs:66）：墙→地形 tile（vanilla sheet id），
 *  未映射默认 0=泥土。写入 st.type 前经 SHEET_TO_INTERNAL 转内部 id */
const WALL_TO_TERRAIN_SHEET = new Map<number, number>([
  [40, 147], [71, 161], [15, 59], [86, 225], [3, 25], [83, 203], [178, 367], [180, 368],
]);
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SAND = TILE_BY_KEY['sand']!;
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block'] ?? -1;
const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block'] ?? -1;  // 原版 25=黑檀石（曾误当 chest）

/** WillWaterPlacedHereStayPut 1:1（cs:79059-79067）：下/左/右三格全部满足
 *  (active && tileSolid && !tileSolidTop) || liquid==255 才放得住。
 *  tileSolidTop≈!platform（本仓口径，与 TileCleanupPass 一致；湖腔语境下
 *  出现的全是自然地形 tile，platform 族不参与，判定等价） */
function willWaterStayPut(st: TileStore, x: number, y: number): boolean {
  const ok = (xx: number, yy: number) => {
    if (!st.inBounds(xx, yy)) return false;
    const i = st.idx(xx, yy);
    if (st.liquid[i] === 255) return true;
    const d = TILE_DEFS[st.type[i]];
    return !!st.flags[i] && !!d?.solid && !d?.platform;
  };
  return ok(x, y + 1) && ok(x - 1, y) && ok(x + 1, y);
}

/** SonOfLakinater（L48516）：向下蜿蜒湖腔。lava 恒 false（getGoodWorld 不支持） */
function sonOfLakinater(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, strengthMultiplier = 1): void {
  // cs:80357 头部 Next(3)（liquidType——普通世界恒水，但掷骰必消耗！曾缺失致流偏移）
  rng.int(0, 2);
  let radius = rng.int(15, 30) * strengthMultiplier;   // num1（1/5 ×1.3）
  let steps = rng.int(30, 60);                         // num2
  if (rng.int(0, 4) === 0) { radius *= 1.3; steps *= 1.3; }
  let px = i + 0.0, py = j + 0.0;
  let wander = rng.next() * (1 / 500);                 // num3
  let vx: number;
  if (rng.int(0, 3) !== 0) {
    vx = rng.int(-15, 15) * 0.01;
  } else {
    vx = rng.int(-50, 50) * 0.01;
    wander = rng.next() * 0.004 + 0.001;
  }
  let vy = rng.int(0, 100) * 0.01;
  const stepsTotal = steps;                            // num4
  while (radius > 3 && steps > 0) {
    radius -= rng.int(0, 10) * 0.1;
    steps--;
    let x0 = Math.floor(px - radius * 4), x1 = Math.floor(px + radius * 4);
    let y0 = Math.floor(py - radius * 3), y1 = Math.floor(py + radius * 2);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = radius;                                  // num9
    const entranceY = j + 5;                           // num17
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        const t = Math.min(1, Math.max(0, steps / stepsTotal)); // num2/num4（lerp 系数）
        const xc = (Math.abs(x - px) * 0.6) * (1 - t) + (Math.abs(x - px) * 0.3) * t;
        const yc = (Math.abs(y - py) * 1.4) * (1 - t) + (Math.abs(y - py) * 5) * t;
        const dist = Math.hypot(xc, yc);               // num16
        if (dist < r * 0.4) {
          // 湖腔主体：掏空 + 灌水
          if (y >= j) {
            const ti2 = st.idx(x, Math.min(st.h - 1, y));
            if (y <= j + 1 ? willWaterStayPut(st, x, y) : true) {
              st.liquid[ti2] = 255;
              st.liquidType[ti2] = 1;
            }
          }
          st.flags[ti] = 0;   // ★原版 cs:80469 仅 active(false)——type 保留为幽灵格（曾误清 type）
          // 原版此处 type==59/60 时 SpreadGrass 邻格——草传播未移植，跳过（后续 pass 铺草）
        } else if (y > j + 1 && dist < r && st.liquid[ti] === 0) {
          // 腔壁壳（cs:80477-80484）：窄处 + ★非活性 + 自身/左/右/下有墙 →
          //   type = WallTypeToTerrainTileType[wall]（WallID.cs:66：40→147、71→161、
          //   15→59、86→225、3→25、83→203、178→367、180→368，未映射默认 0=泥土）再激活。
          //   曾只置 flags=1（type 残留）→ 湖缘"type 残留+实心"幽灵格
          if (Math.abs(x - px) * 0.8 < r && !st.flags[ti] && st.wall[ti] > 0
            && st.wall[st.idx(x - 1, y)] > 0 && st.wall[st.idx(x + 1, y)] > 0
            && st.wall[st.idx(x, y + 1)] > 0) {
            const sheet = WALL_TO_TERRAIN_SHEET.get(st.wall[ti]) ?? 0;
            st.type[ti] = SHEET_TO_INTERNAL.get(sheet) ?? 0;   // 墙→地形（内部 id）
            st.flags[ti] = 1;
          }
        } else if (y < j && steps === stepsTotal - 1 && y > gs.worldSurfaceLow - 20 && st.flags[ti]) {
          // 首步：向上漏斗入口（cs:80493-80506）——★原版有 active 前置（曾漏）；
          //   云族跳过。内部非活性格（洞穴空腔）不参与漏斗挖掘
          const cloud = TILE_BY_KEY['v_189_cloud_block']!;
          if (st.type[ti] !== cloud && st.type[ti] !== TILE_BY_KEY['v_196_rain_cloud_block']) {
            const fx = Math.abs(x - i) * 0.7;
            const fy = Math.abs(y - entranceY) * 1.35;
            const width = (1 - Math.abs(x - i) / Math.max(1, x1 - i)) * 2.3;
            const pow = width ** 4;
            if (y < entranceY && fx < r * 0.4 + Math.abs(y - entranceY) * 0.5 * pow) {
              st.flags[ti] = 0;   // ★原版 cs:80506 仅 active(false)——type 保留为幽灵格
            }
          }
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-100, 100) * wander;
    vy += rng.int(-100, 100) * 0.01;
    if (vx > 1) vx = 1;
    if (vx < -1) vx = -1;
    if (vy > 1) vy = 1;
    const floor = 0.5 * (1 - steps / stepsTotal);
    if (vy < floor) vy = floor;
  }
}

/** pass 31 Lakes（L6450-6560）：num3 = Next(n*3, n*6) 次尝试（n=w/4200），上限 maxLakes-1 */
export function runLakesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  // cs:14619-14620：double 先乘后截——Next((int)(w/4200*3), (int)(w/4200*6))。
  // 曾 n=floor(w/4200) 整数化再乘（6400 宽原版 Next(4,9) vs 复刻 [3,5]）
  const n = w / 4200;
  const tries = rng.int(Math.floor(n * 3), Math.floor(n * 6) - 1);
  const beachAvoid = 275 + 5 + 40 + 20;                // lakesBeachAvoidance = beachSandRandomCenter(320)+20
  const maxLakes = 50;
  const lakeX: number[] = [];
  let budget = Math.floor(w / 4);                      // num4 尝试预算
  for (let k = 0; k < tries; k++) {
    if (lakeX.length >= maxLakes - 1) break;
    while (budget > 0) {
      let bad = false;
      budget--;
      let x = rng.int(beachAvoid, w - beachAvoid - 1); // Next(avoid, w-avoid)
      while (x > w * 0.45 && x < w * 0.55) {
        x = rng.int(beachAvoid, w - beachAvoid - 1);
      }
      for (const lx of lakeX) { if (Math.abs(x - lx) < 150) { bad = true; break; } }
      if (!bad) {
        for (let c = 0; c < gs.numMCaves; c++) {
          if (Math.abs(x - gs.mCaveX[c]) < 100) { bad = true; break; }
        }
      }
      // cs:14660-14666：隧道 ±100 避让（GenVars.tunnelX/numTunnels——曾缺失致首湖错位）
      if (!bad) {
        for (let c = 0; c < gs.numTunnels; c++) {
          if (Math.abs(x - gs.tunnelX[c]) < 100) { bad = true; break; }
        }
      }
      if (bad) continue;
      // 自 worldSurfaceLow-20 向下找实心
      let y = gs.worldSurfaceLow - 20;
      for (;;) {
        if (st.flags[st.idx(x, y)]) break;
        y++;
        if (y >= gs.worldSurface || st.wall[st.idx(x, y)] > 0) { bad = true; break; }
      }
      if (!bad && st.type[st.idx(x, y)] === SAND) { bad = true; }
      if (bad) continue;
      // ±50 无猩红石/宝箱
      for (let dx = -50; dx <= 50 && !bad; dx++) {
        for (let dy = -50; dy <= 50; dy++) {
          if (!st.inBounds(x + dx, y + dy)) continue;
          const t = st.type[st.idx(x + dx, y + dy)];
          // 原版 cs:14690 不判 active：type==203/25（猩红石/黑檀石）即拒
          if (t === CRIMSTONE || t === EBONSTONE) { bad = true; break; }
        }
      }
      if (bad) continue;
      // 两侧 ±20 皆实心为止下沉（上限 worldSurface-50）
      const anchor = y;
      // SolidTile（cs:10959）= active && tileSolid——曾只判 active（±20 下沉与 121×121
      // 实心率把树/草饰等非实心活格也计入 → 实心率虚高、湖位错选）
      const solidAt = (xx: number, yy: number) => {
        if (!st.inBounds(xx, yy)) return false;
        const ii = st.idx(xx, yy);
        return !!st.flags[ii] && !!TILE_DEFS[st.type[ii]]?.solid;
      };
      while (!solidAt(x - 20, y) || !solidAt(x + 20, y)) {
        y++;
        if (y > gs.worldSurface - 50) { bad = true; break; }
      }
      if (bad) continue;
      // cs:14716 `if (num5 - num7 <= 10) { …放置块… }`——下沉 ≤10 格（平坦位）才
      // 进入放置路径；曾把门写反成 `<= 10 continue`（湖只落在崎岖位,根因级反转）
      if (y - anchor > 10) continue;
      // ±60 顶部 20 格净空（无块无墙）
      for (let dx = -60; dx <= 60 && !bad; dx++) {
        const ty = y - 20;
        if (!st.inBounds(x + dx, ty)) continue;
        if (st.flags[st.idx(x + dx, ty)] || st.wall[st.idx(x + dx, ty)] > 0) { bad = true; }
      }
      if (bad) continue;
      // 121×121 实心率 ≥80%
      let solidN = 0;
      for (let dx = -60; dx <= 60; dx++) {
        for (let dy = 0; dy <= 120; dy++) {
          if (solidAt(x + dx, y + dy)) solidN++;
        }
      }
      if (solidN < 121 * 121 * 0.8) continue;
      // 非地下沙漠（cs:14740-14742）：!UndergroundDesertLocation.Intersects(
      // Rectangle(x-8, y-8, 16, 16)) 才放——原版记录的矩形，直接用 gs 数据
      // （曾以蜂窝墙 187/216/217 反推区域 = 沙丘区墙未及处误收 → 沙漠内出湖）
      const ud = gs.undergroundDesert;
      if (ud && x + 8 > ud.x0 && x - 8 < ud.x1 && y + 8 > ud.y0 && y - 8 < ud.y1) continue;
      sonOfLakinater(st, rng, gs, x, y, 1);
      lakeX.push(x);
      break;
    }
  }
  gs.lakeX = lakeX;
}
