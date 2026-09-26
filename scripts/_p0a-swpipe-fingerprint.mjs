// ★P0-A 塌方指纹面验收探针（2026-09-25 定谳续刀）。
// 判据:
//   A. init 失败指纹:WebGL 全阻断（模拟 GPU 不可用）→ acquireSwPipe init 实败支
//      落 'lrecon-skip:swpipe-init-fail';composeSkipFrames/composeSkipStreak>0;
//      composeLastFail='swpipe-init-fail'（F5 一步归因——此前 17 分钟全 2D 零指纹）。
//   B. 渐进闩:retryLadderMs ∈ {2000,3500,5000} 且 retryInMs ≤5000（原 30s 定值闩反锁）。
//   C. 饥饿锁指纹:noteContextLost×3 → 'lrecon-skip:swpipe-starvelock' 落账;
//      swPipeDiag().starve.losses=3。
//   D. 一次性 toast:降级 episode 首帧恰一次（cbOnSwPipeDegrade 计数=1,episode 内不重复）。
//   E. 自愈:解除阻断+清闩 → alive=true;composeSkipStreak 归零;阶梯归零;路径回 'lrecon*'。
//   F. F5 面:collectDebugReport().composePath.skipFrames + .swpipe.starve 全字段在场。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_p0a-swpipe-fingerprint.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
// WebGL 全阻断（app 模块跑前注入）——GLPipeline.init → getContext=null → unavailable
await page.evaluateOnNewDocument(() => {
  window.__webglBlocked = true;
  const orig = HTMLCanvasElement.prototype.getContext;
  window.__origGetContext = orig;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (window.__webglBlocked && typeof type === 'string' && type.indexOf('webgl') >= 0) return null;
    return orig.call(this, type, ...rest);
  };
});
page.on('pageerror', (e) => console.log('PAGEERROR:', (e.message ?? '').slice(0, 200)));
await bootstrap(page, ORIGIN + '/?lightworker=1');   // ★P0-C:光照 worker 开→lightGate 面可验
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame（GL 全阻断下 2D 链自举）', !!gen?.ok, gen?.why ?? '');

await page.evaluate(() => { window.__swGame.running = false; });   // 停 rAF,帧全权由 g.frame 驱动
await page.evaluate(() => {
  const g = window.__swGame;
  window.__toast = 0;
  g.renderer.cbOnSwPipeDegrade = () => { window.__toast++; };
});
// 真实时间驱动 ~4.2s（渐进闩是墙钟——首败 2s/次败 3.5s 阶梯可走两拍）
for (let round = 0; round < 14; round++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 0; i < 18; i++) { window.__vnow = (window.__vnow || performance.now()) + 16.6667; g.frame(window.__vnow); }
  });
  await new Promise((r) => setTimeout(r, 130));
}

const armA = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    initFail: r.composePathStats['lrecon-skip:swpipe-init-fail'] ?? 0,
    skipFrames: r.composeSkipFrames,
    skipStreak: r.composeSkipStreak,
    lastFail: r.composeLastFail,
    diag: r.swPipeDiag ? r.swPipeDiag() : null,
    toast: window.__toast,
  };
});
console.log('[A-D] init-fail 臂', JSON.stringify(armA));
chk('A1 init 实败支落指纹（lrecon-skip:swpipe-init-fail>0）', armA.initFail > 0, `count=${armA.initFail}`);
chk('A2 composeSkipFrames/Streak 累计在场', armA.skipFrames > 0 && armA.skipStreak > 0, `${armA.skipFrames}/${armA.skipStreak}`);
const backoffN = await page.evaluate(() => window.__swGame.renderer.composePathStats['lrecon-skip:swpipe-backoff'] ?? 0);
chk('A3 双支指纹齐备（init-fail 实败+backoff 闩扣押）', backoffN > 0, `init-fail=${armA.initFail} backoff=${backoffN} lastFail=${armA.lastFail}`);
const ladder = armA.diag?.retryLadderMs ?? 0;
chk('B1 渐进闩阶梯 ∈ {2000,3500,5000}（≤5s,30s 反锁废除）', [2000, 3500, 5000].includes(ladder), `ladderMs=${ladder} retryInMs=${armA.diag?.retryInMs}`);
const d1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const bootFlag = r._swPipeDegradeToasted;      // boot 期 episode 已 fired-once（旗面证据）
  window.__toast = 0;
  r._swPipeDegradeToasted = false;               // 受控重放:新 episode
  r.notifySwPipeDegrade();
  const first = window.__toast;
  r.notifySwPipeDegrade();
  r.notifySwPipeDegrade();
  return { bootFlag, first, total: window.__toast };
});
chk('D1 一次性 toast:episode 恰一次（受控重放 1/3）', d1.bootFlag === true && d1.first === 1 && d1.total === 1, `bootFlag=${d1.bootFlag} ${d1.total}/3`);

// C. 饥饿锁指纹臂:清闩绕过渐进阶→直落 starvelock 门
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  r.swPipe = null; r.swPipeRetryAt = 0; r.swPipeRetryLadder = 0;
  r._swPipeMarkFrame = -1;
  return import('/src/render/GLStats.ts').then((G) => {
    G.noteContextLost('probe-1'); G.noteContextLost('probe-2'); G.noteContextLost('probe-3');
  });
});
for (let round = 0; round < 8; round++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 0; i < 18; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  });
  await new Promise((r) => setTimeout(r, 130));
}
const armC = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    starveSkip: r.composePathStats['lrecon-skip:swpipe-starvelock'] ?? 0,
    starve: r.swPipeDiag ? r.swPipeDiag().starve : null,
  };
});
console.log('[C] starvelock 臂', JSON.stringify(armC));
chk('C1 饥饿锁支落指纹（lrecon-skip:swpipe-starvelock>0）', armC.starveSkip > 0, `count=${armC.starveSkip}`);
chk('C2 starve 快照 losses=3', armC.starve?.losses === 3, JSON.stringify(armC.starve));

// E. 自愈臂:解除阻断+清闩 → acquire 成功
await page.evaluate(() => {
  window.__webglBlocked = false;
  const g = window.__swGame;
  const r = g.renderer;
  r.swPipe = null; r.swPipeRetryAt = 0; r.swPipeRetryLadder = 0;
  r.cloudPipeRetryAt = 0; r.worldPipeRetryAt = 0;
  return import('/src/render/GLStats.ts').then((G) => {
    G.noteStarveProbeOk();   // 连续两拍成功→闭合清窗（半开闭合语义演练）
    G.noteStarveProbeOk();
  });
});
for (let round = 0; round < 6; round++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 0; i < 18; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  });
  await new Promise((r) => setTimeout(r, 130));
}
const armE = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return { alive: r.swPipeDiag().alive, streak: r.composeSkipStreak, ladder: r.swPipeDiag().retryLadderMs, used: r.composePathUsed };
});
console.log('[E] 自愈臂', JSON.stringify(armE));
chk('E1 解除阻断后 alive=true（半开/渐进闩不反锁自愈）', armE.alive === true, `alive=${armE.alive}`);
chk('E2 自愈后 skipStreak=0 阶梯归零', armE.streak === 0 && armE.ladder === 2000, `streak=${armE.streak} ladder=${armE.ladder}`);
chk('E3 合成路径回正常 lrecon 面', String(armE.used).startsWith('lrecon') && !String(armE.used).startsWith('lrecon-skip'), armE.used);

// F. F5 面字段
const f5 = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/debug/DebugReport.ts');
  const rep = m.collectDebugReport(g);
  const rd = rep.render ?? {};
  return {
    skipFrames: rd.composePath?.skipFrames,
    skipStreak: rd.composePath?.skipStreak,
    statsKeys: Object.keys(rd.composePath?.stats ?? {}).filter((k) => k.indexOf('swpipe-') >= 0),
    swpipeAlive: rd.swpipe?.alive,
    swpipeStarve: rd.swpipe?.starve ? { losses: rd.swpipe.starve.losses, ever: rd.swpipe.starve.ever } : null,
  };
});
console.log('[F] F5 面', JSON.stringify(f5));
chk('F1 F5 composePath.skipFrames/skipStreak 在场', typeof f5.skipFrames === 'number' && typeof f5.skipStreak === 'number', `${f5.skipFrames}/${f5.skipStreak}`);
chk('F2 F5 composePath.stats 含 swpipe-* 指纹键', f5.statsKeys.length >= 2, f5.statsKeys.join(','));
chk('F3 F5 swpipe 块 alive+starve 快照在场', f5.swpipeAlive === true && !!f5.swpipeStarve, JSON.stringify(f5.swpipeStarve));

// ---- P0-C 增补:worldGl 闩指纹 + C9c-v2 lightGate 面（trace-231810 分层） ----
const wg = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    skipKeys: Object.keys(r.bglPathStats ?? {}).filter((k) => k.indexOf('world-gl-skip:') === 0),
    skipFrames: r.worldGlSkipFrames ?? null,
    diag: r.swPipeDiag ? r.swPipeDiag().worldGl : null,
  };
});
console.log('[W] worldGl 闩面', JSON.stringify(wg));
chk('W1 worldGl 失败因指纹落账（world-gl-skip:*>0）', wg.skipKeys.length >= 1 && wg.skipFrames > 0, `${wg.skipKeys.join(',')} frames=${wg.skipFrames}`);
// failWhy=「最近失败因」活值:自愈后健康支正确清空（塌方期非空,W1 的 skipKeys 即证据）
chk('W2 swPipeDiag.worldGl 块形状+降级计数在场（活值 failWhy 自愈后清空=正确语义）',
  !!wg.diag && typeof wg.diag.alive === 'boolean' && wg.diag.skipFrames > 0 && wg.skipKeys.length > 0 && wg.diag.failWhy === null,
  JSON.stringify(wg.diag));
const lg = await page.evaluate(async () => {
  const g = window.__swGame;
  const rep = await import('/src/debug/DebugReport.ts');
  return rep.collectDebugReport(g).render?.lightGate ?? null;
});
console.log('[G] lightGate 面', JSON.stringify(lg));
chk('G1 C9c-v2 门=adaptive 且进阈=1.5×tick≈25ms', !!lg && lg.mode === 'adaptive' && Math.abs(lg.enterMs - 25) < 0.1, JSON.stringify({ mode: lg?.mode, enterMs: lg?.enterMs }));
chk('G2 忙机门不再永久扣押:live=true 或好拍在涨（p50≤进阈）', !!lg && (lg.live === true || (lg.p50Ms > 0 && lg.p50Ms <= lg.enterMs && lg.good > 0)), JSON.stringify({ live: lg?.live, p50: lg?.p50Ms, good: lg?.good }));

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? `P0A-PROBE: ${bad.length}/${results.length} FAIL` : `P0A-PROBE: ${results.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
