import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5225';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(800);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await page.evaluate(() => window.__swUI.openInventory());
await sleep(400);
const info = await page.evaluate(() => {
  const v = document.querySelector('.sw-vinv');
  const slots = document.querySelectorAll('.sw-vinv .sw-slot[data-idx="1"]');
  const s0 = slots[0];
  const out = { vinv: !!v, slotCount: slots.length };
  if (s0) { const r = s0.getBoundingClientRect(); out.rect = { x: r.x, y: r.y, w: r.width, h: r.height }; }
  return out;
});
console.log('vanilla 布局槽位:', JSON.stringify(info));
if (info.rect && info.rect.w > 0) {
  await page.mouse.click(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
  await sleep(250);
  const st = await page.evaluate(() => ({ held: window.__swUI.heldStack ? window.__swUI.heldStack.id : null, mirror: !!window.__swGame.player.inv.cursorMirror }));
  console.log('点击后 heldStack=', JSON.stringify(st));
  // 立即点世界(光标持物→SW-AZ1 镜像使用)
  const n0 = await page.evaluate(() => { window.__useN = 0; return 0; });
  await page.mouse.move(800, 500);
  await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(200);
  const st2 = await page.evaluate(() => ({ useN: window.__useN, held: window.__swUI.heldStack ? window.__swUI.heldStack.id : null }));
  console.log('点世界后:', JSON.stringify(st2));
}
await browser.close();
process.exit(0);
