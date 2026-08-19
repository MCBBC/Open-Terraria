// QQQQQ ①：s22222 链 #63 蜘蛛波分支定位——JS 真管线三流日志
// （NEST 采样锚 / __swSpiderVisit 全访 / __swSpiderDeco 分支级陈设），
// 与 IIIII 织入 app（/tmp/iiiii-app，SW_SPIDER_OUT）同种子 22222 对拍。
// SW_QQ1_ROLL=11,12：nest11..nest12 之间的掷流（kind+实参）逐条录制。
// 用法：SW_QQ1=1 npx vitest run tools/_qq1.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_QQ1 === '1';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('qq1: s22222 spider full-visit logs (real pipeline)', async () => {
  // 全局掷计数（1 roll = 1 internalSample，与 vanilla NA/NB 同单位）
  const rollBox = { n: 0 };
  const ROLL_FROM = Number(process.env.SW_QQ1_ROLL ?? '-1');
  const rolls: string[] = [];
  const cap = { on: false };
  const URp = UnifiedRandom.prototype as unknown as {
    internalSample: () => number;
    nextInt: (m: number) => number;
    nextIntRange: (a: number, b: number) => number;
    next: () => number;
    nextDouble: () => number;
  };
  const oIS = URp.internalSample;
  const oNI = URp.nextInt;
  const oNIR = URp.nextIntRange;
  const oN = URp.next;
  const oND = URp.nextDouble;
  URp.internalSample = function (this: unknown) {
    rollBox.n++;
    return oIS.call(this);
  };
  const rec = (s: string) => { if (cap.on) rolls.push(`${rollBox.n}\t${s}`); };
  URp.nextInt = function (this: unknown, m: number) { const r = oNI.call(this, m); rec(`a\t${m}\t${r}`); return r; };
  URp.nextIntRange = function (this: unknown, a: number, b: number) { const r = oNIR.call(this, a, b); rec(`b\t${a}\t${b}\t${r}`); return r; };
  URp.next = function (this: unknown) { const r = oN.call(this); rec(`n\t${r}`); return r; };
  URp.nextDouble = function (this: unknown) { const r = oND.call(this); rec(`d\t${r}`); return r; };

  const nest: string[] = [];
  const visit: string[] = [];
  const deco: string[] = [];
  const g = globalThis as {
    __swSpiderNest?: (s: string) => void;
    __swSpiderVisit?: (cx: number, cy: number, k: string, b: number, a2: number, w: number) => void;
    __swSpiderDeco?: (s: string) => void;
    __swSpiderCand?: (n: number, t: number, x: number, y: number, count: number, shroom: number) => void;
  };
  const cand: string[] = [];
  g.__swSpiderCand = (n, t, x, y, count, shroom) => cand.push(`${n}\t${t}\t${x},${y}\t${count}\t${shroom}`);
  g.__swSpiderNest = (s) => {
    const m = /^NEST#(\d+)/.exec(s);
    if (m) {
      const n = Number(m[1]);
      if (n === ROLL_FROM) cap.on = true;
      if (n === Number(process.env.SW_QQ1_ROLL_TO ?? '-1')) cap.on = false;
    }
    nest.push(`${s} roll@${rollBox.n}`);
  };
  g.__swSpiderVisit = (cx, cy, k, b, a2, w) => visit.push(`${w} ${k} ${cx},${cy} ${b}:${a2}`);
  g.__swSpiderDeco = (s) => deco.push(s);
  const t0 = Date.now();
  try {
    await generateWorld({ width: 4200, height: 1200, seedText: '22222', evil: 1 });
  } finally {
    g.__swSpiderNest = undefined;
    g.__swSpiderVisit = undefined;
    g.__swSpiderDeco = undefined;
    g.__swSpiderCand = undefined;
    URp.internalSample = oIS; URp.nextInt = oNI; URp.nextIntRange = oNIR; URp.next = oN; URp.nextDouble = oND;
  }
  writeFileSync('/tmp/qqqq-work/spider-js-nest.txt', nest.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-visit.txt', visit.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-deco.txt', deco.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-cand.txt', cand.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-rolls.txt', rolls.join('\n') + '\n');
  console.log(`qq1 done ${((Date.now() - t0) / 1000).toFixed(0)}s nests=${nest.length} visits=${visit.length} deco=${deco.length} cand=${cand.length} rolls=${rolls.length}`);
  console.log(nest.join('\n'));
}, 600_000);
