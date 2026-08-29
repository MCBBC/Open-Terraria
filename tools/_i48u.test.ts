// IIII48 仪U：终极对账——REAL(runCavesPass 于 dump010 态) vs FAITHFUL(C#转写于同态)
// 的逐 attempt 参数+成本表并列，直到首个实质分歧行。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { runCavesPass } from '../src/world/gen/vanilla/CavesPass';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48U === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200, N = W * H;
const SEED = 1138154190;

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));

(RUN ? it : it.skip)('i48u ultimate ledger', async () => {
  const BYSHEET = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && !BYSHEET.has(s)) BYSHEET.set(s, i);
  }
  const mkState = () => {
    const st = new TileStore(W, H);
    const t0 = rd16(`${G2}/010_Small_Holes.typ`);
    const a0 = rd8(`${G2}/010_Small_Holes.act`);
    const l0 = rd8(`${G2}/010_Small_Holes.liq`);
    const lt0 = rd8(`${G2}/010_Small_Holes.lty`);
    for (let i = 0; i < N; i++) {
      st.type[i] = BYSHEET.get(t0[i]) ?? 0;
      st.flags[i] = a0[i] ? 1 : 0;
      st.liquid[i] = l0[i];
      st.liquidType[i] = lt0[i];
    }
    return st;
  };

  // ---------- FAITHFUL（1458 cs 逐句） ----------
  function faithfulAll(st: TileStore): Array<{ kind: string; idx: number; param: string; cost: number; cum: number }> {
    const rng = new RNG(SEED);
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    const maxTilesX = W, maxTilesY = H, rockHiInt = 769;
    const WL = 929, LL = 418, BH = 380;
    const oceanLevel = (337 + 769) / 2 + 40;
    const CONS_ROCK = 769;
    const FRAMED = new Set([4, 5, 10]); // 近似——洞穴段无活性 framed（已证 0），占位
    function runner(xIn: number, yIn: number, sIn: number, stepsIn: number, type: number,
      spdX = 0, spdY = 0, noY = false): void {
      let strength = sIn * (1 + rng.int(-50, 50) * 0.01);
      let vx = rng.int(-10, 10) * 0.1, vy = rng.int(-10, 10) * 0.1;
      if (spdX !== 0 || spdY !== 0) { vx = spdX; vy = spdY; }
      rng.nextIntRange(0, 4);
      let num2 = stepsIn;
      let valX = xIn, valY = yIn;
      while (strength > 0 && num2 > 0) {
        const cur = strength * (num2 / stepsIn);
        num2--;
        const bx0 = Math.max(1, Math.trunc(valX - cur * 0.5));
        const bx1 = Math.min(maxTilesX - 1, Math.trunc(valX + cur * 0.5));
        const by0 = Math.max(1, Math.trunc(valY - cur * 0.5));
        const by1 = Math.min(maxTilesY - 1, Math.trunc(valY + cur * 0.5));
        for (let k = bx0; k < bx1; k++) for (let l = by0; l < by1; l++) {
          const ti = l * W + k;
          if (st.flags[ti] && FRAMED.has(st.type[ti])) continue;
          if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
          if (type < 0) {
            if (st.flags[ti] && st.type[ti] === BYSHEET.get(53)) continue;
            if (type === -2 && st.flags[ti] && (l < WL || l > LL)) {
              st.liquid[ti] = 255; st.liquidType[ti] = 1;
              const rl = l > LL && (l < CONS_ROCK - 80 || l > maxTilesY - 350)
                && !((l <= oceanLevel) && (k < BH || k > maxTilesX - BH));
              if (rl) st.liquidType[ti] = 2;
            }
            st.flags[ti] = 0;
          }
        }
        valX += vx; valY += vy;
        vx += rng.int(-10, 10) * 0.05;
        if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
        if (!noY) { vy += rng.int(-10, 10) * 0.05; if (vy > 1) vy = 1; else if (vy < -1) vy = -1; }
        else if (cur < 3) { if (vy > 1) vy = 1; else if (vy < -1) vy = -1; }
      }
    }
    const rows: Array<{ kind: string; idx: number; param: string; cost: number; cum: number }> = [];
    let num = Math.trunc(Math.trunc(N * 0.00013) * 1.1);
    for (let i = 0; i < num; i++) {
      let type = -1;
      if (rng.nextInt(10) === 0) type = -2;
      const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
      const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
      const x = rng.nextIntRange(0, maxTilesX);
      const y = rng.nextIntRange(rockHiInt, maxTilesY);
      const c0 = cnt;
      runner(x, y, s2, s3, type);
      rows.push({ kind: 'M', idx: i, param: `q=${s2} stp=${s3} xy=${x},${y}`, cost: cnt - c0, cum: cnt });
    }
    num = Math.trunc(N * 0.00013 * 0.4);
    for (let j = 0; j < num; j++) {
      let t2 = -1;
      if (rng.nextInt(10) === 0) t2 = -2;
      const q = rng.nextIntRange(7, 26);
      const stp = rng.nextIntRange(50, 200);
      const spX = rng.nextIntRange(100, 221) * 0.1;
      const spY = rng.nextIntRange(-10, 11) * 0.02;
      const x2 = rng.nextIntRange(0, maxTilesX);
      const y2 = rng.nextIntRange(rockHiInt, maxTilesY);
      const c0 = cnt;
      runner(x2, y2, q, stp, t2, spX, spY, true);
      runner(x2, y2, q, stp, t2, -spX, -spY, true);
      rows.push({ kind: 'E', idx: j, param: `q=${q} stp=${stp} spX=${spX.toFixed(1)} xy=${x2},${y2} t=${t2}`, cost: cnt - c0, cum: cnt });
    }
    delete g.__swOnRoll;
    rows.push({ kind: 'END', idx: -1, param: '', cost: 0, cum: cnt });
    return rows;
  }

  // ---------- REAL ----------
  interface RRow { kind: string; idx: number; param: string; cost: number; cum: number }
  function realAll(st: TileStore): RRow[] {
    const rows: RRow[] = [];
    const rng = new RNG(SEED);
    const gs = {
      seed: SEED, seedFlags: { remix: true },
      worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
      rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
      waterLine: 929, lavaLine: 418,
      genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
      remixSurfaceLayerLow: 700, remixSurfaceLayerHigh: 850,
      beachDistance: 380, beachLeftEnd: 376, beachRightStart: 3873,
      undergroundDesert: null,
    } as never as Parameters<typeof runCavesPass>[2];
    let cnt = 0;
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = () => cnt++;
    let prevCnt = 0;
    const oReseed = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: unknown, s: number) => void;
    let seq = 0;
    (RNG.prototype as unknown as Record<string, unknown>).reseed = function (this: unknown, s: number) {
      seq++;
      void seq;
      return oReseed.call(this, s);
    };
    // 用织入方式记录：直接内联复制 REAL 的 rocklayer 块逻辑但通过 src 函数——
    // 为保真实性改为补丁模块不可行；此处在测试里复刻 REAL 调用序列（与源码逐字一致）
    // ——DirtLayer 段照抄源码
    let num = Math.trunc(N * 0.00003);
    num = Math.trunc(num * 2);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(6) === 0 ? -2 : -1;
      let nx = rng.nextIntRange(0, W);
      let ny = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      while (((nx < 340 || nx > W - 340) && ny < gs.genWorldSurfaceHigh)
        || (nx >= W * 0.45 && nx <= W * 0.55 && ny < gs.worldSurface)) {
        nx = rng.nextIntRange(0, W);
        ny = rng.nextIntRange(gs.worldSurfaceLow, gs.rockLevelHigh + 1);
      }
      const s4 = rng.nextIntRange(5, 15);
      const s5 = rng.nextIntRange(30, 200);
      const c0 = cnt;
      tileRunner(st, rng, gs, nx, ny, { strength: Math.trunc(s4 * 1.1), steps: Math.trunc(s5 * 1.9), type });
      rows.push({ kind: 'D', idx: i, param: '', cost: cnt - c0, cum: cnt });
    }
    rng.reseed(SEED);
    prevCnt = 0;
    num = Math.trunc(Math.trunc(N * 0.00013) * 1.1);
    for (let i = 0; i < num; i++) {
      const type = rng.nextInt(10) === 0 ? -2 : -1;
      const n2 = rng.nextIntRange(6, 20);
      const n3 = rng.nextIntRange(50, 300);
      const s2 = Math.trunc(n2 * 0.7);
      const s3 = Math.trunc(n3 * 0.7);
      const x = rng.nextIntRange(0, W);
      const y = rng.nextIntRange(gs.rockLevelHigh, H);
      const c0 = cnt;
      tileRunner(st, rng, gs, x, y, { strength: s2, steps: s3, type });
      rows.push({ kind: 'M', idx: i, param: `q=${s2} stp=${s3} xy=${x},${y}`, cost: cnt - c0, cum: cnt });
    }
    num = Math.trunc(N * 0.00013 * 0.4);
    for (let j = 0; j < num; j++) {
      const type2 = rng.nextInt(10) === 0 ? -2 : -1;
      const s2b = rng.nextIntRange(7, 25);
      const stp = rng.nextIntRange(50, 199);
      const spX = rng.nextIntRange(100, 220) * 0.1;
      const spY = rng.nextIntRange(-10, 10) * 0.02;
      const x2 = rng.nextIntRange(0, W);
      const y2 = rng.nextIntRange(gs.rockLevelHigh, H);
      const c0 = cnt;
      tileRunner(st, rng, gs, x2, y2, { strength: s2b, steps: stp, type: type2, speedX: spX, speedY: spY, noYChange: true });
      const r1 = cnt;
      tileRunner(st, rng, gs, x2, y2, { strength: s2b, steps: stp, type: type2, speedX: -spX, speedY: -spY, noYChange: true });
      rows.push({ kind: 'E', idx: j, param: `q=${s2b} stp=${stp} spX=${spX.toFixed(1)} xy=${x2},${y2} t=${type2} r1=${r1 - c0}`, cost: cnt - c0, cum: cnt });
    }
    delete g.__swOnRoll;
    rows.push({ kind: 'END', idx: -1, param: '', cost: 0, cum: cnt });
    return rows;
  }

  const stA = mkState();
  const fr = faithfulAll(mkState());
  const re = realAll(stA);
  console.log(`faithful END cum=${fr[fr.length - 1].cum}; real END cum=${re[re.length - 1].cum}`);
  const fMain = fr.find((r) => r.kind === 'END')!.cum;
  // 找到首个 M 或 E 不一致
  const F = fr.filter((r) => r.kind === 'M' || r.kind === 'E');
  const Rw = re.filter((r) => r.kind === 'M' || r.kind === 'E');
  let divIdx = -1;
  for (let i = 0; i < Math.min(F.length, Rw.length); i++) {
    if (F[i].param !== Rw[i].param || F[i].cost !== Rw[i].cost) { divIdx = i; break; }
  }
  console.log(divIdx < 0 ? 'ALL ROWS MATCH' : `first mismatch row#${divIdx}`);
  for (let z = Math.max(0, divIdx - 2); z < Math.min(F.length, Rw.length, divIdx + 6); z++) {
    console.log(`[${z}] F(${F[z].kind}${F[z].idx}): ${F[z].param} cost=${F[z].cost}`);
    console.log(`      R(${Rw[z].kind}${Rw[z].idx}): ${Rw[z].param} cost=${Rw[z].cost}`);
  }
}, 900_000);
