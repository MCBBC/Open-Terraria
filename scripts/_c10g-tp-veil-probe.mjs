// C10g 传送幕帘活机验证:传送玩家→逐帧采样 _tpVeil/budgetAwaiting→揭幕后截图
// 判据:①幕帘触发且保持上帧若干帧 ②揭幕后目标视口全真对(无占位/无逐块缺口)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await new Promise((r) => setTimeout(r, 1500));

// 逐帧采样器:rAF 挂钩记录 _tpVeil/budgetAwaiting/paintedFrames
await page.evaluate(() => {
  const g = window.__swGame;
  window.__veilLog = [];
  const rec = () => {
    const cc = g.chunks;
    window.__veilLog.push({
      t: Math.round(performance.now()),
      veil: !!g._tpVeil,
      budg: cc ? cc.budgetAwaiting.size : -1,
      worker: cc ? cc.workerAwaiting.size : -1,
      camx: Math.round(g.camera.x),
    });
    if (window.__veilLog.length < 400) requestAnimationFrame(rec);
  };
  requestAnimationFrame(rec);
});

// 传送:向右跳 3000px（>1000px 阈值）
const before = await page.evaluate(() => ({ x: window.__swGame.player.x, camx: Math.round(window.__swGame.camera.x) }));
await page.evaluate(() => { window.__swGame.player.x += 3000; });
await new Promise((r) => setTimeout(r, 2500));
const log = await page.evaluate(() => window.__veilLog);
const veilFrames = log.filter((e) => e.veil);
const maxBudget = Math.max(...log.map((e) => e.budg));
const after = await page.evaluate(() => ({ x: Math.round(window.__swGame.player.x), camx: Math.round(window.__swGame.camera.x), covered: window.__swGame.chunks.viewportCovered() }));
console.log('before:', JSON.stringify(before));
console.log('after:', JSON.stringify(after));
console.log('veilFrames:', veilFrames.length, 'maxBudgetAwaiting:', maxBudget);
if (veilFrames.length) console.log('veil window:', JSON.stringify(veilFrames.slice(0, 3)), '...', JSON.stringify(veilFrames.slice(-2)));
await page.screenshot({ path: 'shots/c10e-trail/tp-veil-after.png' });
console.log('errs:', errs.slice(0, 4));
process.exit(0);
