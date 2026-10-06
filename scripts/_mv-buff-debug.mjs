// 调试：buff 注入 98/99/47(=63?) 行为
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&swperf=0&dbg3=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1200));
const r = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const out = {};
  p.buffs.apply?.(98, 1);
  out.webImmediately = p.buffs.has?.(98);
  p.fixedUpdate(1, g);
  out.webAfterTick = p.buffs.has?.(98);
  p.buffs.remove?.(98);
  out.webRemoved = p.buffs.has?.(98);
  p.buffs.apply?.(99, 2);
  out.vorImmediately = p.buffs.has?.(99);
  p.fixedUpdate(1, g);
  out.vorAfterTick = p.buffs.has?.(99);
  p.buffs.remove?.(99);
  // 遍历 BUFF_DEFS 找 vanillaBuff 149/164/47 的键
  out.byVanilla = {};
  try {
    // BUFF_DEFS 不在窗上——用 has 试探若干整数
    for (const k of [47, 63, 98, 99]) out['has_' + k] = p.buffs.has?.(k);
  } catch (e) { out.enumErr = String(e); }
  return out;
});
console.log(JSON.stringify(r));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(0);
