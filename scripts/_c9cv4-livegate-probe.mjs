// ★C9c-v4 进场简化 真链验收探针（2026-09-28;弱机永久 warmup 根治）。
// 判据:
//   A. 真链进场:缺省 adaptive 模式（?lightworker 缺省开）进世界后 lightGateDiag.live
//      在首个健康结果后即 true（v4 hasResult 进场;v3 需 8 连拍 ≤25ms）。
//   B. lightGateDiag 样例:live/good/bad/p50Ms/lastLagMs/enterMs/exitMs/mode/ring/
//      exitReason 全字段在位且 mode='adaptive'、enterMs≈25/exitMs≈41.7（F5 兼容）。
//   C. 出场唯一条件:live 恒定不横跳（观测窗内 live 翻转=0;lag 不出场,看门狗未触发
//      → exitReason 恒 null）。
//   D. worker 侧对账:results>0 且零 falls（回传健康,双跑确已收敛=live 态本地
//      scan/blur 整段跳过）。
// 运行:SW_ORIGIN=http://localhost:5241 node tools/run-diag.mjs scripts/_c9cv4-livegate-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?lightworker=1');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 实时步进驱动 + lightGateDiag 轮询（c9d 探针判例:页内直查模块单例） ----
const sample = await page.evaluate(async () => {
  const mod = await import('/src/lighting/LightingEngine.ts');
  const LW = await import('/src/lighting/LightWorkerLink.ts');
  const g = window.__swGame;
  const vnow0 = performance.now();
  let vnow = vnow0;
  const liveHistory = [];
  let firstLiveFrame = -1;
  let frames = 0;
  for (let i = 0; i < 600; i++) {          // ≤10s 观测窗（60Hz 步进）
    vnow += 16.6667;
    g.frame(vnow);
    frames++;
    const d = mod.lightGateDiag;
    liveHistory.push(d.live ? 1 : 0);
    if (d.live && firstLiveFrame < 0) firstLiveFrame = frames;
    if (firstLiveFrame > 0 && frames > firstLiveFrame + 120) break;   // live 后再观测 2s
  }
  const flips = liveHistory.reduce((n, v, i) => (i > 0 && v !== liveHistory[i - 1] ? n + 1 : n), 0);
  return {
    diag: { ...mod.lightGateDiag },
    stats: LW.lightWorkerStats(),
    firstLiveFrame, frames,
    livePct: liveHistory.filter((v) => v === 1).length / Math.max(1, liveHistory.length),
    liveFlips: flips,
    lastLagTail: liveHistory.length,
  };
});

console.log('[lightGateDiag 样例]', JSON.stringify(sample.diag));
console.log('[lightWorkerStats]', JSON.stringify(sample.stats));
console.log(`[时序] firstLiveFrame=${sample.firstLiveFrame}/${sample.frames} livePct=${(sample.livePct * 100).toFixed(1)}% liveFlips=${sample.liveFlips}`);

chk('A1 真链进场:首个健康结果后 live=true（v4 hasResult 语义）', sample.diag.live === true && sample.firstLiveFrame > 0,
  `firstLiveFrame=${sample.firstLiveFrame}`);
chk('A2 进场时延有界:60 帧（1s）内进场（v3 忙机永拒对照面:首结果即进,无 8 连拍等待）',
  sample.firstLiveFrame > 0 && sample.firstLiveFrame <= 60, `frame=${sample.firstLiveFrame}`);
chk('B1 lightGateDiag 样例全字段在位（F5 兼容 10 字段）',
  ['live', 'good', 'bad', 'p50Ms', 'lastLagMs', 'enterMs', 'exitMs', 'mode', 'ring', 'exitReason']
    .every((k) => k in sample.diag), JSON.stringify(Object.keys(sample.diag)));
chk('B2 mode=adaptive 且阈常量正确（enter≈25/exit≈41.7）',
  sample.diag.mode === 'adaptive'
  && Math.abs(sample.diag.enterMs - 1000 / 60 * 1.5) < 0.1
  && Math.abs(sample.diag.exitMs - 1000 / 60 * 2.5) < 0.1,
  `enter=${sample.diag.enterMs.toFixed(1)} exit=${sample.diag.exitMs.toFixed(1)}`);
chk('C1 live 恒定:观测窗零横跳（出场唯一=看门狗;lag 不出场）', sample.liveFlips === 0, `flips=${sample.liveFlips}`);
chk('C2 exitReason 恒 null（看门狗未触发）', sample.diag.exitReason === null, String(sample.diag.exitReason));
chk('D1 worker 侧健康:results>0 且零 falls（回传健康=live 态双跑确已收敛）',
  sample.stats.results > 0 && sample.stats.falls === 0,
  `results=${sample.stats.results} falls=${sample.stats.falls} lagMs=${sample.stats.lagMs?.toFixed?.(1) ?? sample.stats.lagMs}`);

await browser.close();
if (pageErrors.length) console.log('[pageerrors]', pageErrors.slice(0, 3));
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? `C9CV4-PROBE: ${bad.length}/${results.length} FAIL` : `C9CV4-PROBE: ${results.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
