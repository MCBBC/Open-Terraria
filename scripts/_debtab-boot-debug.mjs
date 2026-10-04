// boot 停点诊断:导航后 240s 内轮询 __swFlow + 逐条 console
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('console', (m) => { const t = m.text(); if (t) console.log(`[c:${m.type()}]`, t.slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e?.message ?? e).slice(0, 300)));
await page.goto(`${ORIGIN}/?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', String(e).slice(0, 120)));
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const st = await page.evaluate(() => ({
    flow: typeof window.__swFlow,
    ready: document.readyState,
    veil: !!document.getElementById('sw-boot-prime'),
    splash: !!document.querySelector('[class*=splash]'),
    bodyKids: document.body ? document.body.children.length : -1,
    title: document.title,
  })).catch((e) => ({ err: String(e).slice(0, 100) }));
  if (st.flow === 'object') { console.log('BRIDGE UP at', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(st)); break; }
  if (Date.now() - t0 > 30000 && (Date.now() - t0) % 30000 < 1100) console.log('waiting', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(st));
  await new Promise((r) => setTimeout(r, 1000));
}
await browser.close();
process.exit(0);
