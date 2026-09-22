// BJ274 探针7：loadJson 后立刻轮询 (1866,294) half 位——腐蚀发生在加载期还是运行期？
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const saveText = readFileSync('/tmp/bj274-map.json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bj274-chrome-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
// 先装好轮询:loadJson resolve 后立即开始
await page.evaluate((t) => {
  window.__timeline = [];
  const p = window.__swFlow.loadJson(t);
  const probe = () => {
    try {
      const g = window.__swGame;
      if (!g || !g.world || !g.world.store) { window.__timeline.push(['nosGame', performance.now()]); return; }
      const st = g.world.store;
      const i = st.idx(1866, 294);
      window.__timeline.push([`half=${st.half[i]} type=${st.type[i]} flags=${st.flags[i]}`, Math.round(performance.now())]);
    } catch (e) { window.__timeline.push(['err', String(e).slice(0, 80)]); }
  };
  p.then(probe, probe);
  const iv = setInterval(probe, 60);
  setTimeout(() => clearInterval(iv), 8000);
}, saveText);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 8500));
const tl = await page.evaluate(() => window.__timeline);
console.log('timeline:');
let prev = '';
for (const [s, t] of tl) {
  if (s !== prev) console.log(`  ${t}ms ${s}`);
  prev = s;
}
await browser.close();
console.log('done');
