// 原版山丘双 pass 1:1（1405 WorldGen.cs）：
//  - pass 7 "Mount Caves"（L5091-5150，1456 MountainCaves:11811 常数一致）：地表随机位置
//    用 Mountinater（L48367）造上漂泥土山丘，记录 mCave 坐标
//  - pass 34 "Mountain Caves"（L6628-6639）：每座山丘侧面开洞（CaveOpenater L48789）
//    + 向下蜿蜒洞穴（Cavinator L48733，递归至岩层）
// RNG 映射：Next(a,b) 左闭右开 → rng.int(a, b-1)；(int) → ctrunc。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { ctrunc } from '../../../core/csCompat';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { T, TILE_BY_KEY, TILE_DEFS, TILE_DUNGEON_IDS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';
import { canBeClearedDuringGenerationDual, dualDungeonState } from './DungeonStyles1457';

/** 山丘区域避让的沙族（原版 box 检查 type 53/151/274：沙/沙岩砖/沙岩板） */
const SAND_AVOID = idsByVanillaSheet(53, 151, 274);

/** internal tile id → vanilla sheet（CanBeClearedDuringGeneration dual 支/表查必走 sheet 域） */
const sheetOf = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;

/** ★IIIII179：WorldGen.CanBeClearedDuringGeneration（cs:81453-81460）1:1——
 *  静态集 TileID.Sets.CanBeClearedDuringGeneration（NOT_CLEARABLE=internal 域）
 *  ∪ dual 动态拒支（sheet 域）。@param t=internal id @returns true=可清 */
const cbcDg = (t: number, x: number, y: number): boolean =>
  t > 0 && !NOT_CLEARABLE.has(t) && canBeClearedDuringGenerationDual(sheetOf(t), x, y);

/** ★IIIII179：IsConsideredDungeonTile(t,allDungeons:true)（DU.cs:1844-1862）——
 *  Main.tileDungeon（TILE_DUNGEON=internal 域集）∪ ⋃_i dungeonGenVars[i]
 *  .isDungeonTile（tileProtection=sheet 域并集）。@param t=internal id */
const dtAll = (t: number): boolean => {
  if (t <= 0) return false;
  if (TILE_DUNGEON.has(t)) return true;
  const sh = sheetOf(t);
  if (sh < 0) return false;
  const tp = dualDungeonState.tileProtection;
  if (!tp) return false;
  for (const tb of tp) if (sh < tb.length && tb[sh]) return true;
  return false;
};

/** ★IIIII179：IsConsideredDungeonWall(w,allDungeons:true)（DU.cs:1929-1950）——
 *  Main.wallDungeon ∪ ⋃_i dungeonGenVars[i].isDungeonWall（wallProtection 并集,
 *  wall 本域=vanilla wall id）。 */
const dwAll = (wall: number): boolean =>
  wall > 0 && (WALL_DUNGEON.has(wall) || (dualDungeonState.wallProtection?.[wall] ?? false));

/** Mountinater（L48367）：上漂泥土 blob = 山丘本体。只在空气格激活填土(type 0=Dirt) */
function mountinater(st: TileStore, rng: RNG, i: number, j: number, remix: boolean): void {
  let num1 = rng.int(80, 119) + 0.0;      // cs num  = Next(80,120)（半径衰减主量）
  let num2 = rng.int(40, 54) + 0.0;       // cs num3 = Next(40,55)（步数计数器，double！）
  // ★IIIII43 REMIX（1457 cs:80673-80677）：步数计数 ×1.5 ⇒ while 多跑 ~50%（多耗骰）；
  //   半径基数 num2(cs) *=1.5 系**死写**（每轮 :80708 先重算再用，初始值无消费者）
  //   ——只落注释不写死码。val.Y=j+num3/2 初始下移随之放大：remix 山体下沉、时长拉长。
  if (remix) {
    num2 *= 1.5;
  }
  let px = i, py = j + num2 / 2;
  let vx = rng.int(-10, 10) * 0.1;        // Next(-10,11)
  let vy = rng.int(-20, -11) * 0.1;       // Next(-20,-10)
  while (num1 > 0 && num2 > 0) {
    num1 -= rng.int(0, 3);                // Next(4)
    num2--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01; // Next(80,120)
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const k = st.idx(x, y);
          if (!st.flags[k]) st.setTileSilent(x, y, T.DIRT); // 原版 active(true)+type 0(=Dirt)
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > 0.5) vx = 0.5;
    if (vx < -0.5) vx = -0.5;
    if (vy > -0.5) vy = -0.5;
    if (vy < -1.5) vy = -1.5;
  }
}

/** pass 7 Mount Caves：w*0.001 次尝试，避开中心 ±90/沙族 ±50×25/前丘 ±100（L5095-5148）。
 *  ★IIIII43 REMIX（1457 cs:11829-11832/11839-11844）：条数 ×1.5；**中心 ±90 拒绝环
 *  在 !remixWorldGen 内**——remix 不避让出生点带。 */
export function runMountCavesPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  // ★IIIII106 cs:11821-11823：sandy britches 整跳山丘体（同 Tunnels 整门语义）
  if (!!gs.seedFlags.surfaceIsDesert) return;
  const remix = !!gs.seedFlags.remix;
  let count = Math.floor(st.w * 0.001);
  if (remix) count = Math.trunc(count * 1.5);
  for (let n = 0; n < count; n++) {
    gp?.set(n / count);   // ≡ cs:11835 progress.Set((float)i / num)（山丘条目循环）
    let x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1); // Next(w*.25, w*.75)
    let tries = 0;
    let giveUp = false;
    let placed = false;
    while (!placed && !giveUp) {
      placed = true;
      if (!remix) {
        while (x > st.w / 2 - 90 && x < st.w / 2 + 90) {
          x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1);
        }
      }
      for (let k = 0; k < gs.numMCaves; k++) {
        if (Math.abs(x - gs.mCaveX[k]) < 100) { tries++; placed = false; break; }
      }
      if (tries >= st.w / 5) { giveUp = true; break; }
    }
    if (giveUp) continue;
    // 找该列地表首个实心格。沙族 box 检查复用外层 flag（cs:11861-11879）：
    // 一旦检出沙 flag 闩锁为 true——本列后续任何活性格都走不进 !flag 分支，
    // 即「首格近沙 → 整列放弃」（扫完 worldSurface 也不放置、不消费掷骰）。
    // 曾误读 cs:11877 为「近沙不 break 继续向下找深格放置」——漏了 flag 闩锁，
    // 在近沙列多放山丘+多吞 Mountinater 掷（2026-08-16 num4 重播后被对账暴露）。
    let sandLatched = false;
    for (let y = 0; y < gs.worldSurface; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      let nearSand = false;
      for (let dx = -50; dx < 50 && !nearSand; dx++) {
        for (let dy = -25; dy < 25; dy++) {
          const xx = x + dx, yy = y + dy;
          if (!st.inBounds(xx, yy) || !st.flags[st.idx(xx, yy)]) continue;
          if (SAND_AVOID.has(st.type[st.idx(xx, yy)])) { nearSand = true; break; }
        }
      }
      if (nearSand) sandLatched = true;
      if (!sandLatched) {
        mountinater(st, rng, x, y, remix);
        gs.mCaveX[gs.numMCaves] = x;
        gs.mCaveY[gs.numMCaves] = y;
        gs.numMCaves++;
        break;
      }
    }
  }
}

/** CaveOpenater（L48789）：山侧横向开口，100 步或直到离开墙/碰不可清 tile */
function caveOpenater(st: TileStore, rng: RNG, i: number, j: number): void {
  let num1 = rng.int(7, 11);              // Next(7,12)
  let dir = rng.int(0, 1) === 0 ? -1 : 1; // Next(2)
  if (rng.int(0, 9) !== 0) dir = i >= st.w / 2 ? -1 : 1; // 90% 朝世界外侧（Next(10)!=0）
  let px = i, py = j;
  let steps = 100;
  let vx = dir, vy = 0;
  while (steps > 0) {
    const cx = Math.max(0, Math.min(st.w - 1, ctrunc(px)));
    const cy = Math.max(0, Math.min(st.h - 1, ctrunc(py)));
    const k = st.idx(cx, cy);
    const t = st.type[k];
    // 停走门（cs:81366-81370）：wall==0 ∨ (active && !CanBeClearedDuringGeneration)
    //   ——★IIIII179 补 dual 动态拒支（WorldGen.cs:81453-81460;曾只查静态集）
    if (st.wall[k] === 0 || (st.flags[k] && !cbcDg(t, cx, cy))) steps = 0;
    steps--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const kk = st.idx(x, y);
          // 清格门（cs:81404-81408）：CanBeClearedDuringGeneration(type,k,l)
          //   ——★IIIII179 补 dual 动态拒支（保护界内各座 dungeon tile）
          if (st.flags[kk] && cbcDg(st.type[kk], x, y)) st.flags[kk] = 0; // 原版 active(false) 保留幽灵 type
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > dir + 0.5) vx = dir + 0.5;
    if (vx < dir - 0.5) vx = dir - 0.5;
    if (vy > 0) vy = 0;
    if (vy < -0.5) vy = -0.5;
  }
}

/** Cavinator（L48733）：向下蜿蜒洞穴，递归 steps 次直至岩层（不挖沙 53） */
/** 原版 tileDungeon（Main.cs:8131-8136）与 wallDungeon（Main.cs:10734-10745）
 *  ——★BJ187 收编 data/tiles.ts:TILE_DUNGEON_IDS/WALL_DUNGEON_SHEETS 单源
 *  （旧 idsByVanillaSheet 平移副本逐值全等已对拍） */
const TILE_DUNGEON = TILE_DUNGEON_IDS;
const WALL_DUNGEON = WALL_DUNGEON_SHEETS;

function cavinator(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, steps: number): void {
  let num1 = rng.int(7, 14);              // Next(7,15)
  const dir = rng.int(0, 1) === 0 ? -1 : 1;
  let px = i, py = j;
  let num4 = rng.int(20, 39);            // Next(20,40)（num4：剩余步数，地牢命中清零）
  let vx = dir, vy = rng.int(10, 19) * 0.01; // Next(10,20)
  const SAND = TILE_BY_KEY['sand']!;
  while (num4 > 0) {
    num4--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01;
    // ★地牢命中即整轮终止（cs:80753-80762）：tileDungeon/墙 dungeon → num4=0
    //  （此前缺失：跑满全程多耗每步 3 骰 → 条件性流漂移）
    outer:
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const kk = st.idx(x, y);
          const active = st.flags[kk] !== 0;
          // ★IIIII179 dual 停走支（cs:81277-81283）：dualDungeons.Enabled &&
          //   ((active && IsConsideredDungeonTile(t,allDungeons:true)) ||
          //    IsConsideredDungeonWall(w,allDungeons:true)) → num4=0 停走。
          //   曾整缺 ⇒ 洞穴穿透座1 各厅砖墙多耗每步 3 骰+误清保护砖（#34 主差源）。
          if (dualDungeonState.enabled && ((active && dtAll(st.type[kk])) || dwAll(st.wall[kk]))) {
            num4 = 0;
            break outer;
          }
          if ((active && TILE_DUNGEON.has(st.type[kk])) || WALL_DUNGEON.has(st.wall[kk])) {
            num4 = 0;
            break outer;
          }
          // 不可清块/沙：跳过该格（原版 continue，不终止）——★IIIII179 补
          //   CanBeClearedDuringGeneration dual 动态拒支（:81453-81460）
          if (active && (!cbcDg(st.type[kk], x, y) || st.type[kk] === SAND)) continue;
          if (active) st.flags[kk] = 0; // 原版 active(false) 保留幽灵 type（cavinator）
        }
        if (num4 <= 0) break;
      }
      if (num4 <= 0) break;
    }
    // ★1456 cs:80775-80790：for 循环后**无条件** val+=val2 + 速度 2 骰 + clamp,
    //   再由 while(num4>0) 判定退出——终止步（自然减尽或地牢命中）的速度 2 骰
    //   照消费。曾加 while 尾 `if(num4<=0) break` 跳过 → 每层递归少 2 骰，
    //   MCOpenings 后续洞掷骰流错位（9293480 债线 033 出口 typ=18641 的主根因）。
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > dir + 0.5) vx = dir + 0.5;
    if (vx < dir - 0.5) vx = dir - 0.5;
    if (vy > 2) vy = 2;
    if (vy < 0) vy = 0;
  }
  if (steps <= 0 || ctrunc(py) >= gs.rockLevel + 50) return;
  cavinator(st, rng, gs, ctrunc(px), ctrunc(py), steps - 1);
}

/** pass 34 Mountain Caves（L6628-6639）：每座山丘 开口+蜿蜒 */
export function runMountainCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 一次性探针钩（同 WebsPass 模式）：MCOpenings 入口快照（债时间线用）
  const g0 = globalThis as { __swMcCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swMcCap?.(gs, st); } catch { /* probe */ }
  for (let n = 0; n < gs.numMCaves; n++) {
    const x = gs.mCaveX[n], y = gs.mCaveY[n];
    caveOpenater(st, rng, x, y);
    cavinator(st, rng, gs, x, y, rng.int(40, 49)); // Next(40,50)
  }
}
