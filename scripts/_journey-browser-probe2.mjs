// 补充断言：滚到底部 → 半程暗槽可见且不可取；截图核对
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 860 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const setup = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 400));
  const g = window.__swGame;
  g.world.difficulty = 3;
  g.player.appearance = { ...(g.player.appearance ?? {}), difficulty: 3 };
  const need = JSON.parse(await (await fetch('/src/data/vanilla-research.json?raw')).text()).need;
  const ids = Object.keys(need).map(Number);
  for (let i = 0; i < 260; i++) g.research.setSacrificeCountDirectly(ids[i], need[ids[i]]);
  for (const id of ids.slice(260, 263)) g.research.setSacrificeCountDirectly(id, Math.max(0, need[id] - 1));
  const m = await import('/src/ui/JourneyPowersUI.ts');
  m.openJourneyPowersPanel(g);
  document.querySelectorAll('.sw-jp-strip button')[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return ids.slice(260, 263);
});
await new Promise(r => setTimeout(r, 500));
const bottom = await page.evaluate(async () => {
  const scroll = document.querySelector('.sw-jp-scroll');
  scroll.scrollTop = scroll.scrollHeight;
  await new Promise(r => setTimeout(r, 400));
  const partials = [...document.querySelectorAll('.sw-jp-cell.partial')];
  const g = window.__swGame;
  const before = g.player.inv.slots.filter(Boolean).length;
  if (partials[0]) partials[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const after = g.player.inv.slots.filter(Boolean).length;
  return { partialCount: partials.length, titles: partials.map(c => c.title), tookPartial: after - before };
});
console.log('partial:', JSON.stringify(bottom), 'seed ids:', JSON.stringify(setup));
await page.screenshot({ path: '/tmp/journey-browser-bottom.png' });
await browser.close();
