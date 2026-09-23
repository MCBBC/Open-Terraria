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
  // 二分 A：window 全部 __sw* 真删除（★不暂存——__wrKeep 版本会把值留在 window=保留原引用,结论无效）
  const dropped = await page.evaluate(() => {
    const dropped2 = [];
    for (const k of Object.getOwnPropertyNames(window)) {
      if (k.startsWith('__sw')) { try { dropped2.push(k + '=' + String(window[k]).slice(0, 30)); delete window[k]; } catch { /* 只读 */ } }
    }
    return dropped2;
  });
  console.log('STEP2 真删除 window __sw* 键:', dropped.length, '个:', dropped.slice(0, 20).join(' | '));
  await gc();
  const r2 = await page.evaluate(() => ({ game: window.__wrG.deref() !== undefined }));
  console.log('STEP2 后存活:', JSON.stringify(r2), r2.game ? '→ 锚不在 window __sw* 面' : '→ 锚在 window __sw* 面');
  if (r2.game) {
    // 二分 B：控制台驻留假设——CDP Runtime 代理会把 console.log 的对象参数强留
    // （探针伪影家族）。discardConsoleEntries + console.clear 后再判。
    await cdp.send('Runtime.discardConsoleEntries').catch(() => {});
    await page.evaluate(() => { try { console.clear(); } catch { /* 忽略 */ } });
    await gc();
    const r2b = await page.evaluate(() => ({ game: window.__wrG.deref() !== undefined }));
    console.log('STEP2b 清控制台后存活:', JSON.stringify(r2b), r2b.game ? '→ 非控制台驻留' : '→ ★控制台驻留=探针伪影,用户侧无此锚');
  }
}
await browser.close();
process.exit(0);
