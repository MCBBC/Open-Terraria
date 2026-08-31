// IIII87 jagged 定罪·双端仿真（干净版）：runner#12 快照上同时重放
//   [A] 引擎 tileRunner（RNG 内核=快照克隆；__swTrStep 收集迭代运动学）
//   [B] 原版转写 RefSim（dig(-1)+speedOverride+noYChange 全路径掷骰 1:1）
// 输出：首个分歧迭代（px/py/vx/vy/num1）与两侧其后轨迹；越界即锁定语句区。
// 用法：cd game && SW_I91SIM=1 npx vitest run tools/_iii91trsim.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';
import { tileRunner, FRAME_IMPORTANT_SKIP_SHEETS } from '../src/world/gen/vanilla/TileRunner';

const RUN = !!process.env.SW_I91SIM;
const DIR = process.env.SW_I91SIM_DIR ?? '/tmp/iii91-out/trsnap';
const W = 4200, H = 1200;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

function loadUR(dir: string): UnifiedRandom {
  const m = JSON.parse(readFileSync(`${dir}/ur.json`, 'utf8')) as { a: number[]; inext: number };
  const ur = new UnifiedRandom(1) as unknown as { seedArray: Int32Array; inext: number };
  ur.seedArray.set(m.a);
  ur.inext = m.inext;
  return ur as unknown as UnifiedRandom;
}
function loadStore(dir: string): TileStore {
  const st = new TileStore(W, H);
  const rd16 = (n: string) => new Uint16Array(readFileSync(`${dir}/${n}.bin`).buffer.slice(0));
  const rd8 = (n: string) => new Uint8Array(readFileSync(`${dir}/${n}.bin`).slice());
  (st.type as unknown as Uint16Array).set(rd16('type'));
  (st.flags as unknown as Uint8Array).set(rd8('flags'));
  (st.wall as unknown as Uint16Array).set(rd16('wall'));
  (st.half as unknown as Uint8Array).set(rd8('half'));
  (st.slope as unknown as Uint8Array).set(rd8('slope'));
  (st.liquid as unknown as Uint8Array).set(rd8('liquid'));
  try { (st.frameX as unknown as Uint16Array).set(rd16('frx')); } catch { /* 可缺 */ }
  try { (st.frameY as unknown as Uint16Array).set(rd16('fry')); } catch { /* 可缺 */ }
  return st;
}

class RefSim {
  vals: number[] = [];
  hist: Uint8Array[] = [];
  steps: Array<{ iter: number; px: number; py: number; vx: number; vy: number; num1: number; sN2: number; rolled: number; killed: number; skips: number }> = [];
  constructor(private st: TileStore, private ur: UnifiedRandom) {}
  n(): number {
    const v = this.ur.nextIntRange(-10, 11);
    this.vals.push(v);
    return v;
  }
  run(i2: number, j2: number, strengthIn: number, stepsIn: number,
      speedX: number, speedY: number, noYChange: boolean): void {
    const st = this.st;
    let px = i2 + 0.0, py = j2 + 0.0;
    let vx = this.n() * 0.1, vy = this.n() * 0.1;
    if (speedX !== 0.0 || speedY !== 0.0) { vx = speedX; vy = speedY; }
    const ladRoll = this.ur.nextIntRange(0, 4);            // cs:77709 Next(4)
    this.vals.push(ladRoll);
    let num = strengthIn, num2 = stepsIn;
    let iter = 0;
    while (num > 0.0 && num2 > 0.0) {
      iter++;
      num = strengthIn * (num2 / stepsIn);                 // cs:77744
      num2--;
      let rolled = 0, killed = 0, skips = 0;
      const x0 = Math.max(1, Math.trunc(px - num * 0.5));
      const x1 = Math.min(W - 1, Math.trunc(px + num * 0.5));
      const y0 = Math.max(1, Math.trunc(py - num * 0.5));
      const y1 = Math.min(H - 1, Math.trunc(py + num * 0.5));
      for (let k = x0; k < x1; k++) {                      // beach 带 num3 烙灭（无掷）
        for (let l = y0; l < y1; l++) {
          const ti = l * W + k;
          if (st.flags[ti] && this.isFramedSkip(st.type[ti])) { skips++; continue; }
          const r = this.n();                              // cs:77217 dist 骰
          rolled++;
          const dist = Math.abs(k - px) + Math.abs(l - py);
          if (!(dist < strengthIn * 0.5 * (1.0 + r * 0.015))) continue;
          if (st.flags[ti] && SHEET[st.type[ti]] === 53) continue;   // 沙保护
          st.flags[ti] = 0;                                // active=false 保 ghost
          killed++;
        }
      }
      px += vx; py += vy;                                  // cs:77906 移动
      // ladder：普通世界 !drunk ⇒ 条件左半恒真；num>50 才进入阶梯
      if (num > 50.0) {
        for (const thr of [50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900]) {
          if (!(num > thr)) break;
          px += vx; py += vy;
          num2--;
          const dy = this.ur.nextIntRange(-10, 11); this.vals.push(dy);   // cs:77965 Y 先
          vy += dy * 0.05;
          const dx = this.ur.nextIntRange(-10, 11); this.vals.push(dx);   // cs:77966 X 后
          vx += dx * 0.05;
        }
      }
      vx += this.n() * 0.05;                               // cs:78002 X 抖动
      if (vx > 1) vx = 1;
      if (vx < -1) vx = -1;
      if (!noYChange) {
        const dyy = this.n();
        this.vals.push(dyy);
        vy += dyy * 0.05;
        if (vy > 1) vy = 1;
        if (vy < -1) vy = -1;
      } else if (num < 3.0) {
        if (vy > 1) vy = 1;
        if (vy < -1) vy = -1;
      }
      this.hist.push(Uint8Array.from((st as unknown as { flags: Uint8Array }).flags));
      this.steps.push({ iter, px, py, vx, vy, num1: num, sN2: num2, rolled, killed, skips });
    }
  }

  private isFramedSkip(t: number): boolean {
    const s = SHEET[t];
    return s > 0 && FRAME_IMPORTANT_SKIP_SHEETS.has(s);
  }
}

(RUN ? it : it.skip)('IIIII87 dual-runner sim sweep', async () => {
  const results: string[] = [];
  for (let kk = 0; kk <= 24; kk++) {
    const dir = `${DIR}/k${kk}`;
    let args;
    try { args = JSON.parse(readFileSync(`${dir}/args.json`, 'utf8')); } catch { continue; }
    const stA = loadStore(dir), stB = loadStore(dir);
    const engSteps: Array<Record<string, unknown>> = [];
    (globalThis as { __swTrStep?: (o: Record<string, unknown>) => void }).__swTrStep = (o) => engSteps.push(o);
    const rngA = new RNG(0) as unknown as { ur: UnifiedRandom };
    rngA.ur = loadUR(dir);
    const gsA = {
      worldSurface: args.ws, rockLevel: args.rl, beachDistance: args.bd,
      waterLine: args.wl, lavaLine: args.ll, seedFlags: {},
    } as never;
    tileRunner(stA, rngA as never, gsA, args.i, args.j, {
      strength: args.strength, steps: args.steps, type: -1, addTile: false,
      speedX: args.sX, speedY: args.sY, noYChange: args.nyC,
    });
    delete (globalThis as { __swTrStep?: unknown }).__swTrStep;

    const ref = new RefSim(stB, loadUR(dir));
    ref.run(args.i, args.j, args.strength, args.steps, args.sX, args.sY, args.nyC);

    // 计数器逐迭代对齐（rolled/killed/skips 相位一致）
    let bad = -1;
    for (let i = 0; i < Math.min(engSteps.length, ref.steps.length); i++) {
      const a = engSteps[i], b = ref.steps[i];
      if (a.rolled !== b.rolled || a.kills !== b.killed || a.skips !== b.skips) { bad = i; break; }
    }
    console.log(`== k${kk} phys map (first 6) ==`);
    for (let i = 0; i < Math.min(6, engSteps.length, ref.steps.length); i++) {
      const a = engSteps[i], b = ref.steps[i];
      console.log(`  E[${i + 1}] px=${a.px.toFixed(2)} py=${a.py.toFixed(2)} vx=${a.vx} vy=${a.vy} n=${a.num1?.toFixed?.(3)} rolls=${a.rolled} k=${a.kills}`);
      console.log(`  R[${i + 1}] px=${b.px.toFixed(2)} py=${b.py.toFixed(2)} vx=${b.vx} vy=${b.vy} n=${b.num1?.toFixed?.(3)} rolls=${b.rolled} k=${b.killed}`);
    }
    // 引擎侧迭代旗标历史取自示踪载荷
    const engHist = engSteps.map((e2) => e2.h as Uint8Array | undefined);
    const refHist = ref.hist;
    void engHist; void refHist;
    if (bad >= 0) {
      const ea = engHist[bad], ra = refHist[bad];
      if (ea && ra) {
        const dif: number[] = [];
        for (let q = 0; q < W * H && dif.length < 12; q++) {
          if ((ea[q] & 1) !== (ra[q] & 1)) dif.push(q);
        }
        for (const q of dif) {
          const x = q % W, y = Math.floor(q / W);
          console.log(`   difCell ${x},${y}: Eact=${ea[q] & 1} Rackt=${ra[q] & 1}`
            + ` Etyp=${SHEET[stA.type[q]]} Rtyp=${SHEET[stB.type[q]]}`);
        }
      }
    }
    if (bad < 0 && engSteps.length === ref.steps.length) {
      // 终态 diff
      let da = 0;
      for (let i = 0; i < W * H; i++) if ((stA.flags[i] & 1) !== (stB.flags[i] & 1)) da++;
      results.push(`k${kk}: OK iters=${engSteps.length} storeDiffAct=${da}`);
    } else {
      results.push(`k${kk}: MISMATCH @iter ${bad + 1}`
        + ` E=${JSON.stringify(engSteps[bad])} R=${JSON.stringify(ref.steps[bad])}`);
      console.log(results.at(-1));
      writeFileSync(`/tmp/iii91-out/trsnap/k${kk}/diag.json`,
        JSON.stringify({ engSteps: engSteps.slice(Math.max(0,bad-2), bad+3), refSteps: ref.steps.slice(Math.max(0,bad-2), bad+3) }));
      break;
    }
  }
  console.log(results.join('\n'));
}, 240_000);
