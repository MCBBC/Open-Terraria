// G1 断层取证：craft 链三段探针
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 240)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
  guide.home = null;
  g.entities.add(guide, 'npcs');
  g.openNpcDialog.call(g, guide);
  const res = {};
  res.cbKeyExists = typeof g.cb.onGuideCraftOpen;
  // 直调回调（绕过按钮），看 UI 响应
  g.cb.onGuideCraftOpen();
  await new Promise((r) => setTimeout(r, 100));
  res.afterDirectOverlay = !!document.querySelector('.sw-guide-overlay');
  document.querySelector('.sw-guide-overlay')?.remove();
  // 经按钮链
  g.dialogNpc ??= guide;
  g.npcDialogButton('craft');
  await new Promise((r) => setTimeout(r, 120));
  res.afterButtonOverlay = !!document.querySelector('.sw-guide-overlay');
  res.dialogClosed = g.dialogNpc === null;
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
