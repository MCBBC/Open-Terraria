// IIII48 仪B：pass12 参数变体扫描——判定二进制真行为：
//   v0: main×1.1 + extra(0.4)      （= 反编译字面）
//   v1: main 无缩放 + extra(0.4)   （= 仪A 结果，与 rig 前缀等长）
//   v2: main×1.1 + extra×1.1
//   v3: main 无缩放 + extra×1.1
// 输出各变体 vs rig/js 的公共前缀与总量。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I48B === '1';
const G2 = '/tmp/iii45-out/x86-remix';
const W = 4200, H = 1200;
const SEED = 1138154190;
const CONS = { rockLevelHigh: 769 };

function rd16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(b.byteOffset), b.byteOffset, b.length >> 1);
}
const rd8 = (p: string) => new Uint8Array(readFileSync(p));
const FRAMED_SHEET = new Set<number>([4, 5, 10, 11, 12, 13]);
void FRAMED_SHEET;

(RUN ? it : it.skip)('i48b variants', async () => {
  const t0 = rd16(`${G2}/011_Dirt_Layer_Caves.typ`);
  const a0 = rd8(`${G2}/011_Dirt_Layer_Caves.act`);

  const loadStream = (p: string): Int32Array => {
    const out: number[] = [];
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const s = l.trim(); if (!s || s.startsWith('-')) continue;
      out.push(Number(s));
    }
    return Int32Array.from(out);
  };
  const rigS = loadStream('/tmp/iii45-out/rollwin-rig-p12.txt');
  const jsS = loadStream('/tmp/iii45-out/js-roll-RockLayerCaves.txt');

  function run(variant: number): number {
    // 流对拍专用：不建全图状态（洞穴段骰流与瓦片态零反馈——已由仪A 自洽证明，
    // 此处 tf 恒零镜像足够：framed-active=0）
    const actives = 0;
    void actives; void t0; void a0;
    const rng = new RNG(SEED);
    let cnt = 0;
    const vals = new Int32Array(10_500_000);
    const g = globalThis as { __swOnRoll?: (v: number) => void };
    g.__swOnRoll = (v: number) => { if (cnt < vals.length) vals[cnt] = v; cnt++; };
    const maxTilesX = W, maxTilesY = H;
    const rockHiInt = CONS.rockLevelHigh;
    function tileRunner(xIn: number, yIn: number, strengthIn: number, stepsIn: number, type: number,
      speedX = 0.0, speedY = 0.0, noYChange = false): void {
      let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
      let valX = xIn as number, valY = yIn as number;
      let vx = rng.int(-10, 10) * 0.1;
      let vy = rng.int(-10, 10) * 0.1;
      if (speedX !== 0 || speedY !== 0) { vx = speedX; vy = speedY; }
      rng.nextIntRange(0, 4); // Next(4)
      let num2 = stepsIn;
      while (strength > 0 && num2 > 0) {
        const num = strength * (num2 / stepsIn);
        num2--;
        let bx0 = Math.max(1, Math.trunc(valX - num * 0.5));
        let bx1 = Math.min(maxTilesX - 1, Math.trunc(valX + num * 0.5));
        let by0 = Math.max(1, Math.trunc(valY - num * 0.5));
        let by1 = Math.min(maxTilesY - 1, Math.trunc(valY + num * 0.5));
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
    const areaF = W * H;
    let num = Math.trunc(areaF * 0.00013);
    const mulMain = (variant === 0 || variant === 2) ? 1.1 : 1;
    const mulExtra = (variant === 2 || variant === 3) ? 1.1 : 1;
    num = Math.trunc(num * mulMain);
    for (let i = 0; i < num; i++) {
      let type = -1;
      if (rng.nextInt(10) === 0) type = -2;
      let nstr = rng.nextIntRange(6, 20);
      let nstp = rng.nextIntRange(50, 300);
      nstr = Math.trunc(nstr * 0.7);
      nstp = Math.trunc(nstp * 0.7);
      const rx = rng.nextIntRange(0, maxTilesX);
      const ry = rng.nextIntRange(rockHiInt, maxTilesY);
      tileRunner(rx, ry, nstr, nstp, type);
    }
    num = Math.trunc(areaF * 0.00013 * 0.4 * mulExtra);
    for (let j = 0; j < num; j++) {
      const b0 = cnt;
      let type2 = -1;
      if (rng.nextInt(10) === 0) type2 = -2;
      const nstr2 = rng.nextIntRange(7, 26);
      const nstp2 = rng.nextIntRange(50, 200);
      const spX = rng.nextIntRange(100, 221) * 0.1;
      const spY = rng.nextIntRange(-10, 11) * 0.02;
      const x2 = rng.nextIntRange(0, maxTilesX);
      const y2 = rng.nextIntRange(rockHiInt, maxTilesY);
      tileRunner(x2, y2, nstr2, nstp2, type2, spX, spY, true);
      tileRunner(x2, y2, nstr2, nstp2, type2, -spX, -spY, true);
      if (variant === 0 && j < 4) console.log(`[b0] E${j}: q=${nstr2} stp=${nstp2} spX=${spX.toFixed(1)} xy=${x2},${y2} cost=${cnt - b0}`);
    }
    delete g.__swOnRoll;
    if (variant === 0 && process.env.SW_I48DUMPV0 === '1') {
      require('node:fs').writeFileSync('/tmp/iii51-out/v0-vals.txt', Array.prototype.join.call(vals.slice(0, Math.min(cnt, vals.length)), '\n'));
    }
    return Int32Array.from(vals.slice(0, Math.min(cnt, vals.length)));
  }

  const prefLen = (a: Int32Array, b: Int32Array) => {
    const k = Math.min(a.length, b.length);
    let i = 0;
    while (i < k && a[i] === b[i]) i++;
    return i;
  };
  console.log(`rig=${rigS.length} js=${jsS.length}`);
  for (const v of [0, 1, 2, 3]) {
    const st = run(v);
    console.log(`variant v${v}: total=${st.length} prefixVsRig=${prefLen(st, rigS)} prefixVsJs=${prefLen(st, jsS)}`);
  }
}, 900_000);
