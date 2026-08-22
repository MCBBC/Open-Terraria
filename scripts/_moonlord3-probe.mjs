// 复现: F6 召唤 396(月总头,无核心锚) → 立即死 → 误播击败?
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const events = [];
  const orig = g.newText.bind(g);
  g.newText = (text, ...rest) => { events.push({ tick: g.tickCount, text: String(text).slice(0, 50) }); return orig(text, ...rest); };
  const err = g.debugSpawnNpc(396, 1, false);
  const trace = [];
  for (let t = 0; t < 90; t++) {
    g.fixedUpdate(1 / 60);
    const head = g.entities.enemies.find((n) => n.vanillaId === 396);
    const core = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 398);
    trace.push(`t${t}: core=${core ? `ai0=${core.ai0} hp=${core.hp} alive` : 'GONE'} parts=${g.entities.enemies.filter((n) => !n.dead && (n.vanillaId === 396 || n.vanillaId === 397)).length} bossSlot=${g.boss ? g.boss.vanillaId : 'null'} events=${events.length}`);
    if (events.some((e2) => e2.text.includes('打败'))) { trace.push(`DEFEAT at t${t}`); break; }
    void 0;
  }
  return { err, trace: trace.filter((l) => l.includes('t0:') || l.includes('t30') || l.includes('t60') || l.includes('DEFEAT')).slice(0, 6), events: events.slice(0, 4), downed398: g.world.flags['downed_398'] };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
