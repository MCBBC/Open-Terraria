// 彩带 1345 使用路径深挖:逐帧 useTime/swing/recLog('use')/stack
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const items = await import('/src/data/items.ts');
  const DEFS = items.ITEM_DEFS, IBK = items.ITEM_BY_KEY;
  const confId = IBK['vi_1345_Confetti'] ?? DEFS.findIndex((d) => d?.key === 'vi_1345_Confetti');
  inv.slots[0] = { id: confId, stack: 3 };
  g.player.selectedSlot = 0;
  g.input.mouseX = 800; g.input.mouseY = 400; g.input.mouseDown = true; g.input.rightDown = false;
  const frames = [];
  const uses = [];
  const origRec = g.recLog?.bind(g);
  if (origRec) g.recLog = (kind, data) => { if (kind === 'use') uses.push(data); return origRec(kind, data); };
  for (let i = 0; i < 12; i++) {
    g.fixedUpdate(1 / 60);
    frames.push({
      f: i,
      useTime: g.player.useTime,
      anim: g.player.itemAnimTicks ?? null,
      swing: g.swing ? { t: g.swing.t, dur: g.swing.dur, useStyle: g.swing.useStyle, item: g.swing.item } : null,
    });
  }
  g.input.mouseDown = false;
  g.fixedUpdate(1 / 60);
  if (origRec) g.recLog = origRec;
  return { confId, stack: inv.slots[0]?.stack, frames, uses };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
