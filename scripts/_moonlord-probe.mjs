// 月总 F6 召唤探针:召唤→追踪 ai0/ai1/血量/部件/死亡公告来源
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('月') || t.includes('Moon') || t.includes('打败') || t.includes('苏醒')) console.log('[chat]', t.slice(0, 120)); });
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const err = g.debugSpawnNpc(398, 1, false);
  const trace = [];
  let core = null;
  for (let t = 0; t < 600; t++) {
    g.fixedUpdate(1 / 60);
    if (!core || core.dead) core = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 398) ?? core;
    if (t % 30 === 0 && core) {
      const parts = g.entities.enemies.filter((n) => !n.dead && (n.vanillaId === 396 || n.vanillaId === 397));
      const pl = g.player;
      trace.push(`t${t}: core(ai0=${core.ai0},ai1=${Math.round(core.ai1)},hp=${core.hp}) parts=${parts.length} player(dead=${pl.dead},cy=${Math.round(pl.cy)},cx=${Math.round(pl.cx)}) dist=${Math.round(Math.hypot(pl.cx-core.cx, pl.cy-core.cy))}`);
    }
    if (!core || core.dead) { trace.push(`CORE DEAD/GONE at t${t} bossFled=${core?.bossFled} downed=${g.world.flags['downed_398']}`); break; }
  }
  return { err, trace: trace.slice(0, 24), bossSlot: !!g.boss,
    chat: g.newText ? 'has' : 'none' };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
