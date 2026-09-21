// ★BJ223 最小世界加载链检查——BJ219 报 __swLoadJson 卡死（worker 15 分钟不归）环境复现判别。
// 断言：菜单可达 → __swLoadJson（真实地图 JSON）→ __swGame.world 在 90s 内就绪。
// 绿=世界加载链正常（BJ219 卡死系其探针环境偶发/cache-sweep 反药）；红=真回归立刀。
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
page.on('dialog', async (d) => {
  console.log('[ALERT]', d.message().slice(0, 600));   // ★loadFromJson catch 的 alert=错误真身
  await d.dismiss().catch(() => {});
});
page.on('worker', (w) => console.log('[worker spawn]', w.url().slice(-80)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).catch(() => '<unserializable>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail|warn/i.test(line)) console.log('[console]', line.slice(0, 400));
});
const t0 = Date.now();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5241') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
console.log('[probe] menu ok', Date.now() - t0, 'ms');
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); console.log('[probe] sp ok'); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  let rej = null;
  const loadP = window.__swLoadJson(t).catch((e) => { rej = String(e && e.stack || e).slice(0, 500); });
  // 60s 竞速：world 就绪 vs 超时
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) {
    await wait(200);
    if (rej) return { fail: 'loadP-rejected', err: rej };
  }
  if (rej) return { fail: 'loadP-rejected', err: rej };
  if (!window.__swGame?.world) return { fail: 'world-timeout-60s' };
  try { await Promise.race([loadP, wait(5000)]); } catch (e) { return { ok: true, note: 'loadP reject after world ready' }; }
  return { ok: true };
}, mapText);
console.log('[probe] result', JSON.stringify(boot), 'elapsed', Date.now() - t0, 'ms');
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(boot.ok && errs.length === 0 ? 0 : 1);
