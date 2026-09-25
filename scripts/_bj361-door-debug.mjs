// BJ361 调试8：清空监听写（一锤定音监听链撤写）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('361361', 1200, 800));
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const dbg = {};
  const saved = st.listeners;
  st.listeners = [];
  st.setTile(90, 60, 212, 0, 0);
  dbg.noListener = st.type[st.idx(90, 60)];
  // 逐个监听器回插，二分谁撤写
  st.type[st.idx(90, 60)] = 0; st.flags[st.idx(90, 60)] = 0;
  for (let k = 0; k < saved.length; k++) {
    st.listeners.push(saved[k]);
    st.setTile(90, 60, 212, 0, 0);
    const v = st.type[st.idx(90, 60)];
    dbg[`with${k}`] = v;
    if (v === 0) { dbg.culprit = k; dbg.culpritSrc = saved[k].toString().slice(0, 400); break; }
    st.type[st.idx(90, 60)] = 0; st.flags[st.idx(90, 60)] = 0;
  }
  st.listeners = saved;
  return dbg;
});
console.log(JSON.stringify(res, null, 2));
await browser.close();
