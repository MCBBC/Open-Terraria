// IIII48 仪C：v0(真值) 结构账本精查——JS 窗口末端落在真值结构的哪一段？
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I48C === '1';
const W = 4200, H = 1200;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48c v0 ledger', async () => {
  const rigS: number[] = [];
  for (const l of readFileSync('/tmp/iii45-out/rollwin-rig-p12.txt', 'utf8').split('\n')) {
    const s = l.trim(); if (!s || s.startsWith('-')) continue;
    rigS.push(Number(s));
  }
  const jsS: number[] = [];
  for (const l of readFileSync('/tmp/iii45-out/js-roll-RockLayerCaves.txt', 'utf8').split('\n')) {
    const s = l.trim(); if (!s || s.startsWith('-')) continue;
    jsS.push(Number(s));
  }
  const rng = new RNG(SEED);
  let cnt = 0;
  const vals = new Int32Array(10_500_000);
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = (v: number) => { if (cnt < vals.length) vals[cnt] = v; cnt++; };

  const maxTilesX = W, maxTilesY = H, rockHiInt = 769;

  function tileRunner(xIn: number, yIn: number, strengthIn: number, stepsIn: number, type: number,
    speedX = 0.0, speedY = 0.0, noYChange = false): void {
    let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
    let valX = xIn as number, valY = yIn as number;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0 || speedY !== 0) { vx = speedX; vy = speedY; }
    rng.nextIntRange(0, 4);
    let num2 = stepsIn;
    while (strength > 0 && num2 > 0) {
      const num = strength * (num2 / stepsIn);
      num2--;
      const bx0 = Math.max(1, Math.trunc(valX - num * 0.5));
      const bx1 = Math.min(maxTilesX - 1, Math.trunc(valX + num * 0.5));
      const by0 = Math.max(1, Math.trunc(valY - num * 0.5));
      const by1 = Math.min(maxTilesY - 1, Math.trunc(valY + num * 0.5));
      for (let k = bx0; k < bx1; k++) {
        for (let l = by0; l < by1; l++) {
          if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
        }
      }
      valX += vx; valY += vy;
      vx += rng.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      if (!noYChange) {
        vy += rng.int(-10, 10) * 0.05;
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      } else if (num < 3) {
        if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
      }
    }
  }

  interface Row { kind: string; idx: number; start: number; end: number; str: number; stp: number; spX?: number }
  const ledger: Row[] = [];
  const areaF = W * H;
  let num = Math.trunc(Math.trunc(areaF * 0.00013) * 1.1);
  console.log(`v0 main attempts=${num}`);
  for (let i = 0; i < num; i++) {
    let type = -1;
    if (rng.nextInt(10) === 0) type = -2;
    let nstr = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
    let nstp = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
    const rx = rng.nextIntRange(0, maxTilesX);
    const ry = rng.nextIntRange(rockHiInt, maxTilesY);
    const before = cnt;
    tileRunner(rx, ry, nstr, nstp, type);
    ledger.push({ kind: 'M', idx: i, start: before, end: cnt, str: nstr, stp: nstp });
  }
  const mainEnd = cnt;
  num = Math.trunc(areaF * 0.00013 * 0.4);
  for (let j = 0; j < num; j++) {
    let type2 = -1;
    if (rng.nextInt(10) === 0) type2 = -2;
    const nstr2 = rng.nextIntRange(7, 26);
    const nstp2 = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, maxTilesX);
    const y2 = rng.nextIntRange(rockHiInt, maxTilesY);
    const before = cnt;
    tileRunner(x2, y2, nstr2, nstp2, type2, spX, spY, true);
    tileRunner(x2, y2, nstr2, nstp2, type2, -spX, -spY, true);
    ledger.push({ kind: 'E', idx: j, start: before, end: cnt, str: nstr2, stp: nstp2, spX });
  }
  delete g.__swOnRoll;
  console.log(`v0 mainEnd=${mainEnd} total=${cnt} rig=${rigS.length} js=${jsS.length}`);

  // 前缀校验
  let pk = 0;
  const kk = Math.min(cnt, rigS.length);
  while (pk < kk && vals[pk] === rigS[pk]) pk++;
  console.log(`v0∩rig prefix=${pk}`);
  let pj = 0;
  const jj = Math.min(jsS.length, cnt);
  while (pj < jj && jsS[pj] === vals[pj]) pj++;
  console.log(`js∩v0 prefix=${pj}`);

  // JS 末端上下文的 v0 账本
  const cut = jsS.length;
  console.log(`--- v0 ledger rows around js cut ${cut} ---`);
  for (const r of ledger) {
    if ((r.end >= cut - 3 && r.start <= cut + 40000)) {
      console.log(`${r.kind}${String(r.idx).padStart(4)} [${r.start}, ${r.end}) str=${r.str} stp=${r.stp}${r.spX !== undefined ? ` spX=${r.spX.toFixed(1)}` : ''}${cut >= r.start && cut < r.end ? '   <-- jsCut INSIDE' : ''}`);
    }
    if (r.start > cut + 50000) break;
  }
}, 900_000);
