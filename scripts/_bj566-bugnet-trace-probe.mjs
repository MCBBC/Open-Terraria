// BJ566 追踪探针:谁在按住期逐帧重建 swing?（实例方法包装 + 堆栈采样）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 120)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&bj566trace=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
// 清 SW 模块缓存防陈旧（zenith 探针同式）
await page.evaluate(async () => {
  try {
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    await Promise.all((await navigator.serviceWorker?.getRegistrations?.() ?? []).map((r) => r.unregister()));
  } catch {}
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const van = await (await fetch('sprites/vanilla.json')).json();
  let key = null;
  for (const [idStr, m] of Object.entries(van.items ?? {})) {
    if (Number(idStr) === 1991) key = 'vi_1991_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  }
  const id = window.__swItems?.[key];
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();

  // 包装 useSwing 记录调用栈
  const orig = g.useSwing.bind(g);
  const calls = [];
  g.useSwing = function (...args) {
    calls.push(new Error('useSwing-call').stack?.split('\n').slice(2, 6).join(' | '));
    return orig(...args);
  };

  g.swing = null; g.player.useTime = 0;
  g.input.mouseX = g.player.cx + 300; g.input.mouseY = g.player.cy;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const tTrace = [];
  for (let i = 0; i < 40; i++) {
    g.fixedUpdate(1 / 60);
    tTrace.push(g.swing ? `${g.swing.t}/${g.swing.dur}` : 'null');
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return { useSwingCalls: calls.length, first3: calls.slice(0, 3), tTrace };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
process.exit(0);
