// _usefx dbg2：弓按住逐帧追踪（16ms×40）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const items = window.__swItems;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const bowKey = Object.keys(items).find(k => /^vi_39_/.test(k));
  const arrowKey = Object.keys(items).find(k => /wooden_arrow/i.test(k));
  p.inv.slots[p.inv.selected] = { id: items[bowKey], stack: 1 };
  p.inv.slots[54] = { id: items[arrowKey], stack: 999 };
  p.useTime = 0;
  await sleep(100);
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  const snaps = [];
  g.input.mouseDown = true;
  let arrows = 0;
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, bucket) => { if (e && e.constructor && /Arrow/i.test(e.constructor.name)) arrows++; return origAdd(e, bucket); };
  for (let i = 0; i < 40; i++) {
    await sleep(16);
    snaps.push({ i, arrows, n: g.entities.projectiles.length,
      useTime: p.useTime, swing: g.swing ? g.swing.t : 0, md: g.input.mouseDown, prev: g._prevMouseDown });
  }
  g.entities.add = origAdd;
  g.input.mouseDown = false;
  return { snaps: snaps.filter((_, i) => i % 2 === 0), bowKey, arrowKey };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
