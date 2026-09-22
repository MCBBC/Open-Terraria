// BJ274 探针6：half[] 写入陷阱——谁在运行时把 (1866,294) 设成半砖？
// loadJson 载入 → 用 Proxy 包裹 st.half 拦截 idx(1866+? ) 写入 → 捕获调用栈。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const saveText = readFileSync('/tmp/bj274-map.json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bj274-chrome-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), saveText);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));

// 装陷阱:监视 (1860..1872, 292..296) 的 half 写入
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  window.__halfWrites = [];
  const raw = st.half;
  const W = st.w;
  const mon = new Proxy(raw, {
    set(arr, prop, val) {
      if (typeof prop === 'string' && /^\d+$/.test(prop) && val !== 0) {
        const i = Number(prop);
        const x = i % W, y = (i / W) | 0;
        if (x >= 1855 && x <= 1875 && y >= 291 && y <= 297) {
          window.__halfWrites.push({
            x, y, val,
            st: String(new Error().stack || '').split('\n').slice(2, 10)
              .map(s => s.trim().replace('http://localhost:5201', '')).join(' <- '),
          });
        }
      }
      arr[prop] = val;
      return true;
    },
  });
  try {
    Object.defineProperty(st, 'half', { get() { return mon; }, set(v) { raw = v; }, configurable: true });
  } catch (e) { console.log('trap failed', e); }
  window.__trapOn = true;
});
await page.evaluate(() => { const g = window.__swGame; g.player.x = 30043; g.player.y = 4678; });
// 等写入发生
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const got = await page.evaluate(() => window.__halfWrites);
  if (got.length) {
    console.log('HALF WRITES captured:', got.length);
    for (const w of got.slice(0, 5)) console.log(JSON.stringify(w, null, 1));
    break;
  }
}
// 兜底:20s 后检查状态
const final = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const i = st.idx(1866, 294);
  return { half: st.half[i], type: st.type[i], flags: st.flags[i], writes: window.__halfWrites.length };
});
console.log('final (1866,294):', JSON.stringify(final));
await browser.close();
console.log('done');
