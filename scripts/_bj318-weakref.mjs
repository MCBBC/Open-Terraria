// ★BJ318 WeakRef 存活判定探针：进世界后对 Game/world.store 建 WeakRef →
// quitToMenu → 强制 GC → 判定是否被钉死；再用「window.__sw* 全摘」二分锚是否在
// window 句柄面。判定口径：deref()!==undefined=仍被强引用。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 590000,
  userDataDir: '/tmp/bj318-wr-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('HeapProfiler.enable').catch(() => {});
const gc = async () => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
};

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log('STEP: newWorld eval begin');
await page.evaluate(() => window.__swFlow.newWorld('wr' + (Date.now() % 10000), 4200, 1200));
console.log('STEP: newWorld eval done');
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swGame?.running)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3000));
console.log('STEP: weakref setup');
await page.evaluate(() => {
  const g = window.__swGame;
  window.__wrG = new WeakRef(g);
  window.__wrW = new WeakRef(g.world);
  window.__wrS = new WeakRef(g.world.store);
  window.__wrP = new WeakRef(g.player);
});
console.log('STEP: quitToMenu begin');
await page.evaluate(() => window.__swFlow.quitToMenu());
console.log('STEP: quitToMenu done');
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !window.__swGame && !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await gc();
const r1 = await page.evaluate(() => ({
  game: window.__wrG.deref() !== undefined,
  world: window.__wrW.deref() !== undefined,
  store: window.__wrS.deref() !== undefined,
  player: window.__wrP.deref() !== undefined,
}));
console.log('STEP1 quit+gc 后存活:', JSON.stringify(r1), r1.game ? '→ Game 被钉死' : '→ Game 已释放');

if (r1.game) {
  // 二分 A：window 全部 __sw* 摘除
  await page.evaluate(() => {
    window.__wrKeep = {};
    for (const k of Object.getOwnPropertyNames(window)) {
      if (k.startsWith('__sw')) { try { window.__wrKeep[k] = window[k]; window[k] = null; } catch { /* 只读 */ } }
    }
  });
  await gc();
  const r2 = await page.evaluate(() => ({ game: window.__wrG.deref() !== undefined }));
  console.log('STEP2 摘除 window.__sw* 后存活:', JSON.stringify(r2), r2.game ? '→ 锚不在 window __sw* 面' : '→ 锚在 window __sw* 面（逐一恢复可定凶）');
  // 逐一恢复,找出钉死者
  if (!r2.game) {
    const keys = await page.evaluate(() => Object.keys(window.__wrKeep));
    let culprit = [];
    for (const k of keys) {
      await page.evaluate((kk) => { window[kk] = window.__wrKeep[kk]; }, k);
      await gc();
      const alive = await page.evaluate(() => window.__wrG.deref() !== undefined);
      if (alive) { culprit.push(k); await page.evaluate((kk) => { window[kk] = null; }, k); }
    }
    console.log('STEP3 复活钉死 Game 的 window 键:', culprit.join(', ') || '(无单键复活→多键联合)');
  }
}
await browser.close();
process.exit(0);
