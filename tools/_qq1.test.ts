// QQQQQ ①：s22222 链 #63 蜘蛛波分支定位——JS 真管线三流日志
// （NEST 采样锚 / __swSpiderVisit 全访 / __swSpiderDeco 分支级陈设），
// 与 IIIII 织入 app（/tmp/iiiii-app，SW_SPIDER_OUT）同种子 22222 对拍。
// 用法：SW_QQ1=1 npx vitest run tools/_qq1.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_QQ1 === '1';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';

(RUN ? it : it.skip)('qq1: s22222 spider full-visit logs (real pipeline)', async () => {
  // 全局掷计数（1 roll = 1 internalSample，与 vanilla NA/NB 同单位）
  const rollBox = { n: 0 };
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIS = (URp as { internalSample: () => number }).internalSample;
  (URp as { internalSample: () => number }).internalSample = function (this: unknown) {
    rollBox.n++;
    return (oIS as unknown as (this: unknown) => number).call(this);
  };
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
  g.__swSpiderNest = (s) => nest.push(`${s} roll@${rollBox.n}`);
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
    (URp as { internalSample: () => number }).internalSample = oIS as () => number;
  }
  writeFileSync('/tmp/qqqq-work/spider-js-nest.txt', nest.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-visit.txt', visit.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-deco.txt', deco.join('\n') + '\n');
  writeFileSync('/tmp/qqqq-work/spider-js-cand.txt', cand.join('\n') + '\n');
  console.log(`qq1 done ${((Date.now() - t0) / 1000).toFixed(0)}s nests=${nest.length} visits=${visit.length} deco=${deco.length} cand=${cand.length}`);
  console.log(nest.join('\n'));
}, 600_000);
