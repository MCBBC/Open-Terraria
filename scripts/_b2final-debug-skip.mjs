// 诊断 v2:全程 k 迁移位点 + post-400 skip 明细
import esbuild from 'esbuild';
await esbuild.build({ entryPoints: ['src/core/FrameBeat.ts'], bundle: true, format: 'esm', outfile: '/tmp/fb-debug.mjs', logLevel: 'silent' });
const { FrameBeat } = await import('/tmp/fb-debug.mjs');

let s = 97 % 2147483647; if (s <= 0) s += 2147483646;
const lcg = () => (s = (s * 48271) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, lcg()))) * Math.cos(2 * Math.PI * lcg());
const beat = new FrameBeat();
let t = 0, prevT = 0, prevK = 1;
const trans = [];
const postSkips = [];
for (let i = 0; i < 5000; i++) {
  prevT = t;
  t += 8.0 + 0.9 * gauss();
  beat.observeVsync(t, 120);
  const go = beat.shouldRender(t);
  if (!go && i >= 400) postSkips.push({ i, d: +(t - prevT).toFixed(2), ord: beat.ordinal, k: beat.k, est: +beat.vsyncPeriod.toFixed(3) });
  if (go) {
    beat.beginRender(t);
    beat.endRender(t + 4);
    if (beat.k !== prevK) { trans.push({ i, k: prevK, to: beat.k, reason: beat.lastReason, est: +beat.vsyncPeriod.toFixed(2) }); prevK = beat.k; }
  }
}
console.log('transitions:', JSON.stringify(trans));
console.log('post-400 skips:', postSkips.length, JSON.stringify(postSkips.slice(0, 6)));
