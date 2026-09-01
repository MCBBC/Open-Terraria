// 原版 pass 20 "Glowing Mushroom Patches"（WorldGen.cs:12581-12709 + ShroomPatch cs:80540
// + SpreadGrass cs:75210 逐 tile 版）1:1。岩层深处放 min(w/700,50) 个蘑菇生态：
// ShroomPatch 泥 blob（墙 80）×6 → 全图 SpreadGrass(59→70, repeat:false) →
// 蘑菇草饰面循环（KillTile/PlaceTile(59)/Next(4) 散点）。
import { doSurfaceIsDesertCore } from './SecretSeedDoEndsPass';
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { intersectsAnyPotentialDungeonBounds } from './DungeonStyles1457'; // ★IIIII88 dual 拒带
import { tileRunner } from './TileRunner';
import { genSolidType } from './GenSolid';
// ★IIIII58（2026-08-29）REMIX #20 单格残差收官：饰面循环 K/P 支此前裸写
// flags/type，漏了原版 WorldGen.KillTile / PlaceTile 清链的 halfBrick(false)——
// x86 侧 (1891,1025) 沙格 h1→h0（KillTile 尾 cs:64406-64407 active(false)+
// halfBrick(false)），js 只裸关激活保 h1 = mile8 REMIX 唯一 Hf 差。改走引擎
// killTileGen（尘掷表+拒毁门+setTileSilent 半砖清除+SquareTileFrame 级联）
// 与 PlaceTile generic-solid 路径镜像。
import { genKillTile, genSquareTileFrame } from './FinalCleanupPass';

const MUD = TILE_BY_KEY['mud']!;
const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
/** sheet 反查表（remix 幽灵泥带 type==0 判定用；含未映射 = -1） */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let _i = 0; _i < TILE_DEFS.length; _i++) {
  const _s = TILE_DEFS[_i]?.vanilla?.sheet;
  if (typeof _s === 'number') SHEET_OF[_i] = _s;
}
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
// 邪恶草族/向日葵（SpreadGrass cs:75223/75266 门禁用）——必须按内部 ID 比较（曾误比 sheet 号）
const CORRUPT_GRASS_ID = TILE_BY_KEY['v_23_corrupt_grass_block']!;
const CRIMSON_GRASS_ID = TILE_BY_KEY['v_199_crimson_grass_block']!;
const CORRUPT_JG_ID = TILE_BY_KEY['v_661_corrupt_jungle_grass_block']!;
const CRIMSON_JG_ID = TILE_BY_KEY['v_662_crimson_jungle_grass_block']!;
const HALLOW_GRASS_ID = TILE_BY_KEY['v_109_hallowed_grass_block']!;
const SUNFLOWER = TILE_BY_KEY['v_27_sunflower']!;

/** SpreadGrass（cs:75210，本 pass 以 repeat:false 调用）：零掷骰、单格转换。
 *  门禁序：InWorld(,10) → active&&type==dirt → 3×3 全实心(或触岩浆)拒绝 →
 *  CanBeClearedDuringGeneration 拒绝 → type=grass。 */
/** SpreadGrass 递归洪水计数（cs:75316 grassSpread < 1000，mushroom/corruption 共用） */
export const grassSpreadState = { n: 0 };
let _wsRef: () => number = () => 300;
export function setWorldSurfaceRef(fn: () => number): void { _wsRef = fn; }
/** ★IIIII46：tenthAnniversaryWorldGen 参照（cs:75762-75770 SpreadGrass 中带门 tenth 豁免）
 * ——CorruptionPass 入口注入 gs.seedFlags.tenthAnniversary；缺省 false=非 tenth 行为不变。 */
let _tenthRef: () => boolean = () => false;
export function setTenthRef(fn: () => boolean): void { _tenthRef = fn; }

/** SpreadGrass（cs:75210）：dirt==0 时 j≥worldSurface 拒绝（cs:75243 第二门禁——
 *  corruption 的 0→23/199 只在地表以上铺）。repeat=true 时 3×3 邻格递归（限 1000） */
export function spreadGrassOnce(
  st: TileStore, i: number, j: number, dirt: number, grass: number, repeat = false,
): void {
  if (i < 10 || i >= st.w - 10 || j < 10 || j >= st.h - 10) return;   // InWorld(i,j,10)
  const ti = st.idx(i, j);
  if (!st.flags[ti] || st.type[ti] !== dirt) return;
  // cs:75223-75234（生成期分支）：邪恶草族（199/23）另有专属门——中央 10%（(0.45w,0.55w]）
  // 与滩带（beachDistance=380）内禁长；其余草走 (j>=worldSurface && dirt==0) 门。
  // ★IIIII46（cs:75764）：tenthAnniversary 世界跳过中央带拒绝项（仅滩带保留）。
  if (grass === CRIMSON_GRASS_ID || grass === CORRUPT_GRASS_ID) {
    if ((!_tenthRef() && i > st.w * 0.45 && i <= st.w * 0.55) || i < 380 || i >= st.w - 380) return;
  } else if (dirt === 0 && j >= _wsRef()) {
    return;                                                            // growGrassUnderground=false
  }
  let enclosed = true;
  for (let k = Math.max(0, i - 1); k < Math.min(st.w, i + 2); k++) {
    for (let l = Math.max(0, j - 1); l < Math.min(st.h, j + 2); l++) {
      const ni = st.idx(k, l);
      // tileSolid 走 GenSolid（本 pass 时点 484 滚动仙人掌 cs:12537 已翻非实心）
      if (!st.flags[ni] || !genSolidType(st.type[ni])) enclosed = false;
      if (st.liquidType[ni] === 2 && st.liquid[ni] > 0) { enclosed = true; break; }  // lava
    }
  }
  if (enclosed) return;
  // cs:75266：向日葵 27 在头顶 → 邪恶草族（23/661/199/662/109）禁长（生成期无 27，零影响保门）
  if ((grass === CORRUPT_GRASS_ID || grass === CORRUPT_JG_ID || grass === CRIMSON_GRASS_ID
    || grass === CRIMSON_JG_ID || grass === HALLOW_GRASS_ID)
    && j - 1 >= 0 && st.type[st.idx(i, j - 1)] === SUNFLOWER) return;
  // CanBeClearedDuringGeneration：与 TileRunner NOT_CLEAR 同源（dirt 族可清）
  const d = TILE_DEFS[st.type[ti]];
  if (d?.vanilla?.sheet != null && NOT_CLEARABLE.has(d.vanilla.sheet)) return;
  st.type[ti] = grass;
  // 递归洪水（cs:75309-75320）：3×3 邻格同 dirt，grassSpread < 1000
  if (!repeat) return;
  for (let m = i - 1; m <= i + 1; m++) {
    for (let n = j - 1; n <= j + 1; n++) {
      if (m < 0 || m >= st.w || n < 0 || n >= st.h) continue;
      const ni = st.idx(m, n);
      if (st.flags[ni] && st.type[ni] === dirt && grassSpreadState.n < 1000) {
        grassSpreadState.n++;
        spreadGrassOnce(st, m, n, dirt, grass, true);
        grassSpreadState.n--;
      }
    }
  }
}

/** 生成期不可清表（WorldGen.CanBeClearedDuringGeneration 的项目侧近似；
 *  396-399/404 沙族+化石、367/368 大理石花岗岩、41/43/44 地牢砖、481-483 等） */
const NOT_CLEARABLE = new Set<number>([
  396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237,
]);
/** ★IIIII58：PlaceTile(…,59) generic-solid 支镜像（WorldGen.cs:59841 default 分支）。
 *  原版 !active 目标先 tile.Clear(Tile|TilePaint|Slope)（cs:59501 → Tile.cs:746-774
 *  ⇒ type=0/帧0/斜坡0/halfBrick(false)），再 active(true)+type=59（cs:60730-60733
 *  尾 default 支）；调用方随后 SquareTileFrame(i,j)。59 不属液面拒绝清单、不属
 *  TruncatesWalls——生成期 paint/coating 恒零，半砖/坡面位清链为实际差异面。 */
function placeMudGen(st: TileStore, x: number, y: number): void {
  const ii = st.idx(x, y);
  st.slope[ii] = 0;                  // Clear(TileDataType.Slope)：slope(0)
  st.half[ii] = 0;                   //                        halfBrick(false)
  st.frameX[ii] = 0; st.frameY[ii] = 0;   // Clear(TileDataType.Tile)：frameX/Y=0
  st.type[ii] = MUD;
  st.flags[ii] = 1;
}
export function runMushroomPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ▶探针钩（隔离重放 rig tools/_c29iso.test.ts 用）：管线时点 gs 快照 + cleanup 事件
  const __cap = (globalThis as { __swMushGsCap?: (gs: GenState, st: TileStore) => void }).__swMushGsCap;
  if (__cap) __cap(gs, st);
  const __ev = (globalThis as { __swMushEv?: (s: string) => void }).__swMushEv;

  const { w, h } = st;
  // ★IIIII106 cs:12600-12602：sandy britches 表层沙漠化第一臂（GlowingMushroomPatches
  //   pass 头、remix 假地表带臂之前；noSurface 组合走 DoSurfaceIsDesert 前半=另案登记）
  if (!!gs.seedFlags.surfaceIsDesert && !gs.seedFlags.noSurface) {
    doSurfaceIsDesertCore(st, rng, gs);
  }
  // ★IIIII48 REMIX 头段（1458 cs:12604-12613）：remix 世界把「假地表」带
  //   [remixMushroomLayerLow(850), maxTilesY-10] 内全部 **幽灵/活性 type=0（土/空气）**
  //   改写成泥 ghost——逐列 Next(3) 起始行（每列恒耗 1 骰）。vanilla 判 tile.type==0
  //   不判 active ⇒ JS 以 sheet==0 对齐（含空气幽灵与活/惰性泥土）。
  if (!!gs.seedFlags.remix) {
    const MUD59 = TILE_BY_KEY['mud']!;
    const bandLo = gs.remixMushroomLayerLow;
    for (let i = 10; i < w - 10; i++) {
      let j = bandLo + rng.int(0, 2);
      for (; j < h - 10; j++) {
        const ti = st.idx(i, j);
        const sh = SHEET_OF[st.type[ti]];
        if (sh === 0) st.type[ti] = MUD59;
      }
    }
  }
  setWorldSurfaceRef(() => gs.worldSurface);   // SpreadGrass 的 dirt==0 地表门禁用   // SpreadGrass 的 dirt==0 地表门禁用
  let mCount = w / 700;
  if (mCount > 50) mCount = 50;                    // GenVars.maxMushroomBiomes = 50
  const placed: Array<[number, number]> = [];
  // UndergroundDesertLocation = CombinedArea.Inflate(10,10)（右/下界排他）
  const ud = gs.undergroundDesert;
  for (let n = 0; n < mCount; n++) {
    let tries = 0;
    let flag = true;
    while (flag) {
      let x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);   // Next(0.2w, 0.8w)
      if (tries > Math.floor(w / 4)) {
        x = rng.int(Math.floor(w * 0.025), Math.floor(w * 0.975) - 1); // 兜底带（cs:12620）
      }
      // ★IIIII111（cs:12632-12647）：i am error 特化 Y 臂整缺——!errorWorld||notTheBees
      //   走常规两支；否则 y=Next(200,H-300)，且「y<ws+300 ∧ x∈中央±300」时连 x 一起
      //   重掷（x 重掷用主带区间，不回兜底带）直到落出中央浅区。骰耗差是 #20 蘑菇洞
      //   边缘族首响的真源之一（旧码把云岛深掷臂当唯一 error 支、漏了本位）。
      let y: number;
      if (!gs.seedFlags.errorWorld || gs.seedFlags.notTheBees) {
        y = !!gs.seedFlags.remix
          ? rng.int(gs.worldSurface + 50, gs.rockLevel - 51)
          : rng.int(gs.rockLevel + 50, h - 301);                     // Main.rockLayer
      } else {
        y = rng.int(200, h - 301);
        while (y < gs.worldSurface + 300 && x > Math.trunc(w / 2) - 300 && x < Math.trunc(w / 2) + 300) {
          x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);
          y = rng.int(200, h - 301);
        }
      }
      flag = false;
      // ★IIIII88 双地牢拒带（WorldGen.cs:12655-12667）：dual 时先查
      //   IntersectsAnyPotentialDungeonBounds(rect(±100)) —— 命中直接置 flag 重掷，
      //   ±100 网格扫描（147/161/162/60/368/367+地下沙漠）随后才跑。potentialBounds
      //   在 Dunes 头装配；非 dual 空表恒 false。零掷骰差异。
      if (gs.seedFlags.dualDungeons && intersectsAnyPotentialDungeonBounds(x - 100, y - 100, x + 100, y + 100)) {
        flag = true;
      }
      for (let l = x - 100; l < x + 100; l += 3) {
        for (let m = y - 100; m < y + 100; m += 3) {
          if (l >= 0 && l < w && m >= 0 && m < h) {
            const ti = st.idx(l, m);
            if (st.flags[ti]) {
              const t = st.type[ti];
              if (t === SNOW || t === ICE || t === THIN_ICE || t === JUNGLE_GRASS
                || t === TILE_BY_KEY['v_368_granite_block'] || t === TILE_BY_KEY['v_367_marble_block']!) {
                flag = true; break;
              }
            }
            // 注：大理石/花岗岩(#21/22)在本 pass 之后，367/368 恒不存在——保留判定零影响
            if (ud && l >= ud.x0 && l < ud.x1 && m >= ud.y0 && m < ud.y1) { flag = true; break; }
          } else { flag = true; break; }
        }
      }
      if (!flag) {
        for (const [px, py] of placed) {
          if (Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)) < 500) { flag = true; break; }
        }
      }
      if (!flag && placed.length < 50) {
        shroomPatch(st, rng, gs, x, y);
        for (let k = 0; k < 5; k++) { shroomPatch(st, rng, gs, x + rng.int(-40, 40), y + rng.int(-40, 40)); }
        placed.push([x, y]);
      }
      tries++;
      if (tries > Math.floor(w / 2)) break;
    }
  }
  // SpreadGrass 全图扫描（cs:12721-12749 普通世界分支：InWorld(i,j,50)）
  // ★IIIII111（cs:12709-12727）：i am error 特化臂——errorWorld 走【全列 0..H】扩散
  //   （从天顶云带起扫），非 error 世界才钳 worldSurface 起。 spreads 同式零掷差。
  for (let x = 0; x < w; x++) {
    const yStart = !!gs.seedFlags.errorWorld ? 0 : gs.worldSurface;
    for (let y = yStart; y < h; y++) {
      if (x >= 50 && x < w - 50 && y >= 50 && y < h - 50 && st.flags[st.idx(x, y)]) {
        spreadGrassOnce(st, x, y, MUD, MUSH_GRASS);
      }
    }
  }
  // 蘑菇草饰面第二循环（cs:12731-12769）
  for (let x = 0; x < w; x++) {
    for (let y = gs.worldSurface; y < h; y++) {
      const ti = st.idx(x, y);
      if (!st.flags[ti] || st.type[ti] !== MUSH_GRASS) continue;
      __ev?.(`A(${x},${y})`);
      for (let ix = x - 1; ix <= x + 1; ix++) {
        for (let iy = y - 1; iy <= y + 1; iy++) {
          if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
          const ii = st.idx(ix, iy);
          const iL = ix > 0 && st.flags[st.idx(ix - 1, iy)];
          const iR = ix < w - 1 && st.flags[st.idx(ix + 1, iy)];
          const iU = iy > 0 && st.flags[st.idx(ix, iy - 1)];
          const iD = iy < h - 1 && st.flags[st.idx(ix, iy + 1)];
          if (st.flags[ii]) {
            // ★IIIII58：K 支改走引擎 genKillTile＝KillTile 完整生成期链（cs:64406-
            // 64433：active(false)+halfBrick(false)+frameX/Y=-1+ClearBlockPaintAndCoating
            // +type=0+inActive(false)，含 CheckTileBreakability 拒毁头门与 SquareTileFrame
            // 级联；地形族零尘掷）。此前裸写 flags/type 漏 halfBrick(false)：REMIX
            // #20 (1891,1025) 沙格 h1→h0 未随=x86,mile8 REMIX 唯一 Hf 残差。
            if (!iL && !iR) { __ev?.(`K(${ix},${iy})t${st.type[ii]}H`); genKillTile(st, rng, ix, iy); }
            else if (!iU && !iD) { __ev?.(`K(${ix},${iy})t${st.type[ii]}V`); genKillTile(st, rng, ix, iy); }
            else __ev?.(`N(${ix},${iy})t${st.type[ii]}${iL ? 'l' : '-'}${iR ? 'r' : '-'}${iU ? 'u' : '-'}${iD ? 'd' : '-'}`);
          } else if (iL && iR) {
            __ev?.(`P(${ix},${iy})H`);
            placeMudGen(st, ix, iy);
            genSquareTileFrame(st, rng, ix, iy);
            if (ix > 0 && st.type[st.idx(ix - 1, y)] === MUSH_GRASS) { st.type[st.idx(ix - 1, y)] = MUD; }
            if (ix < w - 1 && st.type[st.idx(ix + 1, y)] === MUSH_GRASS) { st.type[st.idx(ix + 1, y)] = MUD; }
          } else if (iU && iD) {
            __ev?.(`P(${ix},${iy})V`);
            placeMudGen(st, ix, iy);
            genSquareTileFrame(st, rng, ix, iy);
            // ★cs:12764-12767 原版 quirk：竖桥写的 x 是 **num18（被放格列）**，
            // y 是 num17±1（锚 y）——曾误用锚 x → 偏列一格的 70→59 级联
            if (y > 0 && st.type[st.idx(ix, y - 1)] === MUSH_GRASS) { st.type[st.idx(ix, y - 1)] = MUD; }
            if (y < h - 1 && st.type[st.idx(ix, y + 1)] === MUSH_GRASS) { st.type[st.idx(ix, y + 1)] = MUD; }
          }
        }
      }
      if (rng.int(0, 3) === 0) {                   // Next(4)==0：1/4 散点 59→70
        const sx = x + rng.int(-20, 20), sy = y + rng.int(-20, 20);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h && st.type[st.idx(sx, sy)] === MUD) {
          st.type[st.idx(sx, sy)] = MUSH_GRASS;
        }
      }
    }
  }
}

/** ShroomPatch（cs:80540）1:1：泥 blob 随机游走，上空挖空、墙→80、尾端 2 支泥 runner */
function shroomPatch(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): void {

  // ★IIIII50（1458 cs:81099-81104）：size 缩放 num3=w/4200 —— getGoodWorldGen&&!remix
  //  再 ×1.5（FTW 蘑菇洞窟显著增大；漏接曾致首个泥 blob 落地后与真值世界态分裂，
  //  后续 500 距离拒绝采样按放大态重掷 → 全部洞位/形状级联错位）。
  const van = (st.w / 4200)
    * ((gs.seedFlags.getGoodWorld && !gs.seedFlags.remix) ? 1.5 : 1);   // cs:81101-81103
  let num = rng.int(80, 99) * van;                 // Next(80,100) × 缩放——num 曾漏乘(2026-08-12 审计)
  let num2 = rng.int(20, 25) * van;                // Next(20,26) × 缩放
  const num4 = num2 - 1;                           // 首圈标记
  let px = i + 0.0, py = j - num2 * 0.3;
  let vx = rng.int(-100, 100) * 0.005;
  let vy = rng.int(-200, -101) * 0.005;
  while (num > 0 && num2 > 0) {
    num -= rng.int(0, 2);                          // Next(3)
    num2 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5));
    const x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, Math.trunc(py - num * 0.5));
    const y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    const r = num * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ddx = Math.abs(x - px);
        const ddy = Math.abs((y - py) * 2.3);
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        const ti = st.idx(x, y);
        if (d < r * 0.8 && st.liquidType[ti] === 2) st.liquid[ti] = 0;   // tile.lava()
        if (d < r * 0.2 && y < py) {
          st.flags[ti] = 0;                          // active(false)：type 保留（幽灵，同原版）
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        } else if (d < r * 0.4 * (0.95 + rng.next() * 0.1)) {
          st.type[ti] = MUD;                        // type 恒写（active 另判）
          if (num2 === num4 && y > py) st.flags[ti] = 1;
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        }
      }
    }
    px += vx; py += vy;
    px += vx;                                       // 原版 val+=val2 后再 val.X+=val2.X
    vx += rng.int(-100, 109) * 0.005;
    vy -= rng.int(0, 109) * 0.005;                  // Next(110)
    if (vx > -0.5 && vx < 0.5) vx = vx < 0 ? -0.5 : 0.5;
    if (vx > 0.5) vx = 0.5;
    if (vx < -0.5) vx = -0.5;
    if (vy > 0.5) vy = 0.5;
    if (vy < -0.5) vy = -0.5;
    for (let m = 0; m < 2; m++) {
      let x = Math.trunc(px) + rng.int(-20, 19);
      let y = Math.trunc(py) + rng.int(0, 19);
      // 原版拒绝环：落点非活性且非泥则重掷（无界重掷→落地即活性/泥）
      while (x >= 0 && x < st.w && y >= 0 && y < st.h
        && !st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] !== MUD) {
        x = Math.trunc(px) + rng.int(-20, 19);
        y = Math.trunc(py) + rng.int(0, 19);
      }
      tileRunner(st, rng, gs, x, y, {
        strength: rng.int(10, 19), steps: rng.int(10, 19),   // Next(10,20)×2
        type: MUD, speedY: 2, noYChange: true,
      });
    }
  }
}
