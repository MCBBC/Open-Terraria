// IIII48 仪I：M0 单 attempt 内部剖析——两引擎逐步对照（box 尺寸/掷耗/循环数）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner as srcRunner } from '../src/world/gen/vanilla/TileRunner';

const RUN = process.env.SW_I48I === '1';
const W = 4200, H = 1200;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48i M0 anatomy', async () => {
  const rngA = new RNG(SEED);
  const rngB = new RNG(SEED);

  // 先取 M0 头参（两侧同流）
  const headDraw = (r: RNG) => {
    let type = -1;
    if (r.nextInt(10) === 0) type = -2;
    let nstr = r.nextIntRange(6, 20);
    let nstp = r.nextIntRange(50, 300);
    nstr = Math.trunc(nstr * 0.7);
    nstp = Math.trunc(nstp * 0.7);
    const rx = r.nextIntRange(0, W);
    const ry = r.nextIntRange(769, H);
    return { type, nstr, nstp, rx, ry };
  };
  const hA = headDraw(rngA), hB = headDraw(rngB);
  console.log('M0 header', JSON.stringify(hA), JSON.stringify(hB));

  const gsStub = {
    seedFlags: { remix: true },
    worldSurface: 337, worldSurfaceLow: 162, worldSurfaceHigh: 312,
    rockLevel: 769, rockLevelLow: 700, rockLevelHigh: 769,
    waterLine: 929, lavaLine: 418,
    genWorldSurface: 276, genRockLayer: 745.8000000000001, genWorldSurfaceHigh: 312,
    beachDistance: 380,
    undergroundDesert: null,
  } as never;

  const stF = new TileStore(W, H); // 空 store 即可（M0 无状态反馈）
  const stJ = new TileStore(W, H);

  let cntA = 0;
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = () => cntA++;
  // ===== 剖析版 faithful =====
  {
    let strength = hA.nstr * (1 + rngA.int(-50, 50) * 0.01);
    let valX = hA.rx, valY = hA.ry;
    let vx = rngA.int(-10, 10) * 0.1;
    let vy = rngA.int(-10, 10) * 0.1;
    if (0 !== 0 || 0 !== 0) {}
    rngA.nextIntRange(0, 4);
    let num2 = hA.nstp;
    let stepRows = '';
    while (strength > 0 && num2 > 0) {
      const num = strength * (num2 / hA.nstp);
      num2--;
      let bx0 = Math.max(1, Math.trunc(valX - num * 0.5));
      let bx1 = Math.min(W - 1, Math.trunc(valX + num * 0.5));
      let by0 = Math.max(1, Math.trunc(valY - num * 0.5));
      let by1 = Math.min(H - 1, Math.trunc(valY + num * 0.5));
      const boxCells = (bx1 - bx0) * (by1 - by0);
      for (let k = bx0; k < bx1; k++) for (let l = by0; l < by1; l++) {
        if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rngA.int(-10, 10) * 0.015))) continue;
        void k;
      }
      if (stepRows.length < 300) stepRows += `${stepRows ? ',' : ''}s${boxCells}`;
      valX += vx; valY += vy;
      vx += rngA.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      vy += rngA.int(-10, 10) * 0.05;
      if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
    }
    console.log(`faithful total=${cntA} strength=${strength.toFixed(2)} steps=${hA.nstp}`);
    console.log(`faithful boxCells/step: ${stepRows}`);
  }
  delete g.__swOnRoll;

  // ===== src 版计数 =====
  let cntB = 0;
  g.__swOnRoll = () => cntB++;
  srcRunner(stJ, rngB, gsStub, hB.rx, hB.ry, { strength: hB.nstr, steps: hB.nstp, type: hB.type });
  delete g.__swOnRoll;
  console.log(`src total=${cntB}`);

  // 头部值复算（remix 抖动）
  const rj = new RNG(SEED);
  rj.nextInt(10); rj.nextIntRange(6, 20); rj.nextIntRange(50, 300); rj.nextIntRange(0, W); rj.nextIntRange(769, H);
  const jv = rj.int(-50, 50);
  console.log(`remix jitter=${jv} → strength=${(hA.nstr * (1 + jv * 0.01)).toFixed(2)}`);
}, 900_000);
