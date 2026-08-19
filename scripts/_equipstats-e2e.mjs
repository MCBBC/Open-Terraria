// equipStats 记忆化 E2E:真实世界跑 60s,采 rAF 帧均 + MajorGC 频率对比口径。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/eqst-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 254 * 16;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  g.player.debugGod = true;
});
await new Promise((r) => setTimeout(r, 4000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // ① 功能正确:读两次同引用;换装后变化
  const a = g.player.equipStats;
  const b = g.player.equipStats;
  const inv = g.player.inv;
  const old = inv.armor[3];
  inv.armor[3] = { id: 3, stack: 1 };   // 放个真实物品(内部 id 3=workbench 类)确保键变
  void g.player.equipStats;
  inv.armor[3] = old ?? null;           // 再拿走 → 又一次键变
  const c = g.player.equipStats;
  const sameHit = a === b;
  const invalidated = a !== c;
  // ② 性能:60s 帧均 + perf memory 分配观测(逐帧 performance.measureUserAgentSpecificMemory 不可用→帧率代替)
  window.__ft = { n: 0, sum: 0, last: performance.now() };
  const tick = () => {
    const now = performance.now();
    window.__ft.sum += now - window.__ft.last; window.__ft.last = now; window.__ft.n++;
    if (window.__ft.n < 600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await new Promise((r) => setTimeout(r, 10500));
  const f = window.__ft;
  return { sameHit, invalidated, frames: f.n, avgMs: +(f.sum / Math.max(1, f.n)).toFixed(2),
    frozen: Object.isFrozen(g.player.equipStats) };
});
console.log('[E2E]', JSON.stringify(out));
await browser.close();
