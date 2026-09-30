// ★C10c 云尾 blit 归因重验（2026-09-30）——merge=merged 帧到底走哪条 blit 支。
// 【疑点】Windows SHM trace（Trace-20260930T144504）把 1530ms 全屏 blit 记到
//  cloudBlitRect 名下,而同 trace merge=merged 占 99.6%——merged 收口恒走
//  finishBatch 全幅 ctx.drawImage 支,bbox 支只应 'both' 独立批会话帧到达
//  ⇒ 疑 minified 内联/sourcemap 段邻接归因错位。
// 【仪】SkyRenderer.cloudBlitStats 分账（C10c 刀:mergedFull/mergedDefer/bbox/
//  bboxSkipEmpty/bboxFullFallback）+ Renderer.cloudMergeStats 会话分账。
// 【判读】若 mergedFull≈帧数 ∧ bbox≈0 → 归因错位实锤,真实热点=drawCloudsNear
//  merged 收口全幅 blit（native drawImage）,按 C10b 判例属设计内收口。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_c10c-blit-attribution.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
console.log('createGame:', gen?.ok, gen?.why ?? '');

await page.evaluate(() => import('/src/render/SkyRenderer.ts').then((m) => { window.__skyMod = m; }));
await freezeClock(page, { tod: 0.5 });

// 帧驱动（正常活帧,不暂停——云每帧都画）
const N = 600;
const snap = await page.evaluate((n) => {
  const g = window.__swGame;
  const sr = window.__skyMod.SkyRenderer;
  sr.cloudBlitStats = { mergedFull: 0, mergedDefer: 0, bbox: 0, bboxNoBatch: 0, bboxBoth: 0, bboxSkipEmpty: 0, bboxFullFallback: 0, bboxAreaPx: 0 };
  g.renderer.cloudMergeStats = {};
  const gf = g.frame.bind(g);
  let vnow = performance.now();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { vnow += 16.6667; gf(vnow); }
  return {
    wallMs: performance.now() - t0,
    blit: { ...sr.cloudBlitStats },
    merge: { ...g.renderer.cloudMergeStats },
    canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height,
    dpr: window.devicePixelRatio,
  };
}, N);

console.log(`[c10c] ${N} 帧 @ ${snap.canvasW}x${snap.canvasH} dpr=${snap.dpr} wall=${snap.wallMs.toFixed(0)}ms (${(N / (snap.wallMs / 1000)).toFixed(0)}fps)`);
console.log('  blit 分账:', JSON.stringify(snap.blit));
console.log('  会话分账:', JSON.stringify(snap.merge));
const frames = (snap.merge.merged || 0) + (snap.merge.split || 0);
const mergedShare = frames ? (snap.merge.merged || 0) / frames : 0;
const mergedFull = snap.blit.mergedFull, bbox = snap.blit.bbox;
const areaPct = (snap.blit.bboxAreaPx / (snap.blit.bbox * snap.canvasW * snap.canvasH) * 100);
console.log(`  merged 占比=${(mergedShare * 100).toFixed(1)}% mergedFull=${mergedFull}（${(mergedFull / N * 100).toFixed(1)}%/帧） bbox=${bbox}（noBatch=${snap.blit.bboxNoBatch} both=${snap.blit.bboxBoth}）skipEmpty=${snap.blit.bboxSkipEmpty} fullFallback=${snap.blit.bboxFullFallback}`);
console.log(`  bbox 均面积占比=${areaPct.toFixed(1)}% 全幅（均 ${(snap.blit.bboxAreaPx / Math.max(1, snap.blit.bbox) / 1e6).toFixed(2)}M px/次）`);

// 判读
let verdict;
if (snap.blit.bboxNoBatch > frames * 0.5 && mergedShare > 0.9) {
  verdict = '归因非错位:bbox 支每帧到达的真实 caller=远云 pass1（drawVanillaClouds 独立会话）,与近云 merged 收口无关;trace 的 cloudBlitRect 1530ms=远云 bbox blit 真账（热点定性:每帧独立 GL 会话+blit,面积占比见上）';
} else if (mergedShare > 0.9 && bbox === 0 && mergedFull > 0) {
  verdict = '归因错位实锤:merged 帧恒走全幅支,bbox 支零到达';
} else if (snap.blit.bboxBoth > frames * 0.05) {
  verdict = "'both' 独立批会话帧在走 bbox 支 → 按 C10b 判例扩合并门（skyMergeable 覆盖面排查）";
} else {
  verdict = '分布居中 → 需按场景分账再查';
}
console.log('[verdict]', verdict);
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
process.exit(0);
