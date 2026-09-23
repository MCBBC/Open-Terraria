// ★BJ303 机制取证探针：在真实 Game 实例上验证 detached-method 调用 = undefined.world 崩点。
// emitLineLight 的 `const add = game.addLightAt; add(...)` 丢 this → addLightAt 首句
// `this.world?.store...` 抛 TypeError。本探针在页内精确复刻该调用形态取完整栈。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}

const verdict = await page.evaluate(() => {
  const g = window.__swGame;
  const out = {};
  // 1) 正常方法调用（this=game）——基线
  try { g.addLightAt(100, 100, 0.1, 0.4, 0.3); out.boundCall = 'ok'; } catch (e) { out.boundCall = String(e); }
  // 2) detached 引用调用（emitLineLight 现行写法）——取完整栈
  const add = g.addLightAt;
  try { add(100, 100, 0.1, 0.4, 0.3); out.detachedCall = 'no-throw'; }
  catch (e) { out.detachedCall = String(e); out.detachedStack = String(e.stack ?? '').split('\n').slice(0, 8).join('\n'); }
  // 3) this 实证
  const thisProbe = { world: 42, m() { return typeof this; } };
  const dm = thisProbe.m;
  out.detachedThis = (() => { try { return JSON.stringify(dm()); } catch (e) { return 'throw: ' + String(e).slice(0, 80); } })();
  return out;
});
console.log(JSON.stringify(verdict, null, 2));
await browser.close();
