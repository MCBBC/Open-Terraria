// 头像三模式截图留证（重放）：逐模式开商人对话，截 .sw-npc-dialog 元素。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
import fs from 'node:fs';
const OUT = process.env.OUT_DIR || '/tmp/portrait-repro';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });

// 一次性 spawn 商人
await page.evaluate(() => (async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const n = new TownNPC('merchant', g.player.x + 30, g.world.groundLevel * 16 - 48);
  n.home = { x: Math.floor(n.cx / 16), y: Math.floor(n.cy / 16) };
  g.entities.add(n, 'npcs');
  g.player.x = n.cx - 30; g.player.y = n.cy - 8;
})());
for (const m of ['detailed', 'closeUp', 'fullBodyRetro']) {
  await page.evaluate(async (mm) => {
    const g = window.__swGame;
    const { options } = await import('/src/core/Options.ts');
    options.data.dialoguePortraitMode = mm;
    g.closeNpcDialog();
    const npc = [...g.entities.npcs][0];
    g.player.x = npc.cx - 30; g.player.y = npc.cy - 8;
    for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
    g.openNpcDialog.call(g, npc);
    window.__portraitMode = mm;
    window.__portraitDone = false;
    setTimeout(() => { window.__portraitDone = true; }, 600);
  }, m);
  await page.waitForFunction(() => window.__portraitDone === true, { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 300));
  const dlg = await page.$('.sw-npc-dialog');
  if (dlg) await dlg.screenshot({ path: `${OUT}/dlg-${m}.png` });
  else console.log(`no dialog element for ${m}`);
}
console.log('shots done ->', OUT);
await browser.close();
