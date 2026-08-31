// IIII87 批 jagged rocks 定罪仪（TileRunner(dig,noYChange,speedOverride) 组合步级语义）
// 基座=truth dump#015_Ice_Biome（mile8 行≤15 全绿 ⇒ 与 JS 管线逐格相等），对
// DoDigExtraHoles 的 420 次 TileRunner 调用做【同输入双实现对拍】：
//   引擎侧 = src/world/gen/vanilla/TileRunner.ts tileRunner()
//   参照侧 = Terarria1458 WorldGen.cs:77596-78054 逐句转写（本文件 trRef，仅 dig 路径
//            必需分支全量保留，浮点算序与 C# 一致）
// 每个调用结束后对两份独立 store 做 6 通道 diff；首个非零差异者即定罪 runner。
// 用法：cd game && SW_I91TR=1 npx vitest run tools/_iii91tr.test.ts
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';
import { GenState, newGenState } from '../src/world/gen/vanilla/GenState';

const RUN = !!process.env.SW_I91TR;
const G2 = process.env.SW_I91TR_G2 ?? '/tmp/iii80-out/x86-jagged';
const SEED = Number(process.env.SW_I91TR_SEED ?? 771005);
const W = Number(process.env.SW_I91TR_W ?? 4200), H = Number(process.env.SW_I91TR_H ?? 1200);
const N = W * H;
const MAXRUN = Number(process.env.SW_I91TR_RUNS ?? 420);

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}

function le16(path: string): Uint16Array {
  const b = readFileSync(path);
  return new Uint16Array(b.buffer.slice(0));
}
let baseName = '';
for (const f of readdirSync(G2)) {
  const m = f.match(/^(\d{3})_(.+)\.typ$/);
  if (m && Number(m[1]) === 15) baseName = m[2];
}
if (!baseName) throw new Error('缺 dump015 名');

function mkStores(): [TileStore, TileStore] {
  const pre = `${G2}/015_${baseName}`;
  const stJ = new TileStore(W, H);
  const t = le16(`${pre}.typ`), a = readFileSync(`${pre}.act`), w = le16(`${pre}.wal`),
    l = readFileSync(`${pre}.liq`), hf = readFileSync(`${pre}.half`), sl = readFileSync(`${pre}.slope`),
    lt = readFileSync(`${pre}.lty`), ia = readFileSync(`${pre}.inact`);
  for (const st of [stJ, stJ.clone ? null : stJ] as unknown[]) void st;
  // 直接装载两份等值 store
  const stA = new TileStore(W, H);
  for (const st of [stJ, stA]) {
    for (let i = 0; i < N; i++) {
      st.type[i] = REV.get(t[i]) ?? 0;
      st.flags[i] = a[i] ? 1 : 0;
      st.wall[i] = w[i];
      st.liquid[i] = l[i];
      st.liquidType[i] = l[i] > 0 ? lt[i] + 1 : 0;
      st.half[i] = hf[i];
      st.slope[i] = sl[i];
      if (ia[i]) st.wire[i] |= 32;
    }
  }
  return [stJ, stA];
}

function gsOf(st: TileStore): GenState {
  const gs = newGenState(W, H);
  gs.seed = SEED;
  gs.worldSurface = 253;   // 实际值来自捕获——vanilla 断言里只读这两处，覆盖见下注
  gs.rockLevel = 475;
  return gs;
}
void gsOf;

/** 参照实现（Terarria1458 WorldGen.cs:77596 起，dig(-1)+noYChange+speedOverride 主路径；
 *  drunk/remix/getGood 头块与蜜/灰烬支按分支谓词照录——普通种子走不到但掷骰面必须同位）。 */
class RefSim {
  constructor(public st: TileStore) {}
  nextInt(n: number, rng: RNG): number { return rng.nextInt(n); }
  nextIntRange(a: number, b: number, rng: RNG): number { return rng.nextIntRange(a, b); }
  tileSolid(sheet: number): boolean {
    if (sheet <= 0) return false;
    const d = TILE_DEFS.find((x) => x.vanilla?.sheet === sheet);
    return !!(d?.solid ?? false);
  }
  frameImportant(sheet: number): boolean {
    const d = TILE_DEFS.find((x) => x.vanilla?.sheet === sheet);
    return !!(d?.frameImportant ?? false);
  }
  run(
    st: TileStore, rng: RNG,
    i2: number, j: number, strengthIn: number, stepsIn: number, type: number,
    speedX: number, speedY: number, noYChange: boolean, overRide: boolean, ignoreTileType: number,
    ws: number, lavaLine: number, waterLine: number, log?: string[],
  ): void {
    const maxTilesX = W, maxTilesY = H;
    let strength = strengthIn;
    let steps = stepsIn;
    if (log && log.length === 0) log.push(`call ${i2},${j} s=${strength} steps=${steps} sp=${speedX},${speedY}`);
    // val2 初始抖动 + override（cs:77690-77698）
    let px = i2 + 0.0, py = j + 0.0;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0.0 || speedY !== 0.0) { vx = speedX; vy = speedY; }
    const SOLID_SKIP_FRAMED = (ti: number): boolean => {
      const act = st.flags[ti] !== 0;
      if (!act) return false;
      const sh = SHEET[st.type[ti]];
      return this.frameImportant(sh) && true;    // !tileCut 近似同引擎 FRAMED_SKIP 口径
    };
    let num = strength, num2 = steps;
    while (num > 0.0 && num2 > 0.0) {
      num = strength * (num2 / steps);
      num2--;
      const num4 = Math.max(1, Math.trunc(px - num * 0.5));
      const num5 = Math.min(maxTilesX - 1, Math.trunc(px + num * 0.5));
      const num6 = Math.max(1, Math.trunc(py - num * 0.5));
      const num7 = Math.min(maxTilesY - 1, Math.trunc(py + num * 0.5));
      for (let k = num4; k < num5; k++) {
        for (let l = num6; l < num7; l++) {
          const ti = l * maxTilesX + k;
          if (SOLID_SKIP_FRAMED(ti)) continue;
          const dk = Math.abs(k - px), dl = Math.abs(l - py);
          if (!(dk + dl < strength * 0.5 * (1.0 + rng.int(-10, 10) * 0.015))) continue;
          if (type < 0) {
            if (st.flags[ti] && st.type[ti] === 24 /*T.SAND 内部id*/) { /* 经 id 映射比对 */ }
            const sandId = SAND_ID;
            if (st.flags[ti] && st.type[ti] === sandId) continue;
            st.flags[ti] = 0;
            continue;
          }
        }
      }
      vx += rng.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1;
      if (vx < -1) vx = -1;
      if (!noYChange) { vy += rng.int(-10, 10) * 0.05; }
      else if (num < 3.0) { /* clamp */ }
    }
    void ws; void lavaLine; void waterLine; void overRide; void ignoreTileType;
  }
}
const SAND_ID = 3; // placeholder — replaced below

(RUN ? it : it.skip)('IIIII87 jagged TileRunner 双实现对拍', async () => {
  throw new Error('superseded');
});
