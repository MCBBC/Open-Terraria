// 复现用户场景:F6 面板召唤(带公告监听)——监听 newText/onChat 捕获"已被打败"出现的精确 tick
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
  // 包一层 newText 捕获所有公告+tick
  const events = [];
  const origNewText = g.newText.bind(g);
  g.newText = (text, ...rest) => {
    events.push({ tick: g.tickCount, text: String(text).slice(0, 60) });
    return origNewText(text, ...rest);
  };
  // 也监听 onChat(cb 链)
  const err = g.debugSpawnNpc(398, 1, false);
  const trace = [];
  let core = null;
  for (let t = 0; t < 300; t++) {
    g.fixedUpdate(1 / 60);
    if (!core || core.dead) core = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 398) ?? null;
    if (t % 10 === 0) {
      const pl = g.player;
      trace.push(`t${t}: core=${core ? `ai0=${core.ai0} hp=${core.hp} dead=${core.dead}` : 'GONE'} player(dead=${pl.dead},hp=${pl.hp}) events=${events.length}`);
    }
    // 一出现"被打败"公告立即停
    if (events.some((e2) => e2.text.includes('打败'))) {
      const coreNow = g.entities.enemies.find((n) => n.vanillaId === 398);
      trace.push(`DEFEAT-MSG at t${t}: core=${coreNow ? `ai0=${coreNow.ai0} hp=${coreNow.hp} dead=${coreNow.dead} bossFled=${coreNow.bossFled}` : 'GONE'} player(dead=${g.player.dead},hp=${g.player.hp})`);
      break;
    }
  }
  return { err, trace: trace.slice(0, 20), events: events.slice(0, 8),
    downed: g.world.flags['downed_398'] };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
