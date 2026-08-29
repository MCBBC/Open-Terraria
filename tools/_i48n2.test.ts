// IIII48 仪N2：faithful 真值侧 E 成本全表（对照 real SW_I48ALL 表）
import { it } from 'vitest';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I48N2 === '1';
const W = 4200, H = 1200;
const SEED = 1138154190;

(RUN ? it : it.skip)('i48n2 truth e-cost table', async () => {
  const rng = new RNG(SEED);
  let cnt = 0;
  const g = globalThis as { __swOnRoll?: (v: number) => void };
  g.__swOnRoll = () => cnt++;
  // 主循环（faithful，纯流无状态）
  let num = Math.trunc(Math.trunc(W * H * 0.00013) * 1.1);
  function tileRunnerF(xIn: number, yIn: number, strengthIn: number, stepsIn: number, type: number,
    speedX = 0, speedY = 0, noYChange = false): void {
    let strength = strengthIn * (1 + rng.int(-50, 50) * 0.01);
    let valX = xIn, valY = yIn;
    let vx = rng.int(-10, 10) * 0.1;
    let vy = rng.int(-10, 10) * 0.1;
    if (speedX !== 0 || speedY !== 0) { vx = speedX; vy = speedY; }
    rng.nextIntRange(0, 4);
    let num2 = stepsIn;
    while (strength > 0 && num2 > 0) {
      const cur = strength * (num2 / stepsIn);
      num2--;
      const bx0 = Math.max(1, Math.trunc(valX - cur * 0.5));
      const bx1 = Math.min(W - 1, Math.trunc(valX + cur * 0.5));
      const by0 = Math.max(1, Math.trunc(valY - cur * 0.5));
      const by1 = Math.min(H - 1, Math.trunc(valY + cur * 0.5));
      for (let k = bx0; k < bx1; k++) for (let l = by0; l < by1; l++) {
        if (!(Math.abs(k - valX) + Math.abs(l - valY) < strength * 0.5 * (1 + rng.int(-10, 10) * 0.015))) continue;
      }
      valX += vx; valY += vy;
      vx += rng.int(-10, 10) * 0.05;
      if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
      if (!noYChange) { vy += rng.int(-10, 10) * 0.05; if (vy > 1) vy = 1; else if (vy < -1) vy = -1; }
      else if (cur < 3) { if (vy > 1) vy = 1; else if (vy < -1) vy = -1; }
    }
  }
  const mainCosts: number[] = [];
  for (let i = 0; i < num; i++) {
    const type = rng.nextInt(10) === 0 ? -2 : -1;
    const s2 = Math.trunc(rng.nextIntRange(6, 20) * 0.7);
    const s3 = Math.trunc(rng.nextIntRange(50, 300) * 0.7);
    const x = rng.nextIntRange(0, W);
    const y = rng.nextIntRange(769, H);
    const b = cnt;
    tileRunnerF(x, y, s2, s3, type);
    mainCosts.push(cnt - b);
  }
  console.log(`TRUTH mainEnd=${cnt} (${mainCosts.length} attempts)`);
  num = Math.trunc(W * H * 0.00013 * 0.4);
  const ecosts: number[] = [];
  const eparams: string[] = [];
  for (let j = 0; j < num; j++) {
    const type2 = rng.nextInt(10) === 0 ? -2 : -1;
    const q = rng.nextIntRange(7, 26);
    const stp = rng.nextIntRange(50, 200);
    const spX = rng.nextIntRange(100, 221) * 0.1;
    const spY = rng.nextIntRange(-10, 11) * 0.02;
    const x2 = rng.nextIntRange(0, W);
    const y2 = rng.nextIntRange(769, H);
    eparams.push(`q=${q} stp=${stp} spX=${spX.toFixed(1)} t=${type2} xy=(${x2},${y2})`);
    const b = cnt;
    tileRunnerF(x2, y2, q, stp, type2, spX, spY, true);
    tileRunnerF(x2, y2, q, stp, type2, -spX, -spY, true);
    ecosts.push(cnt - b);
  }
  delete g.__swOnRoll;
  console.log(`TRUTH extraTotal=${cnt}`);
  require('node:fs').writeFileSync('/tmp/iii51-out/truth-e.txt', ecosts.map((c, i) => `${c}|${eparams[i]}`).join('\n'));
}, 900_000);
