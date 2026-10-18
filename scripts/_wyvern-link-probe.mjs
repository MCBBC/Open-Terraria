// 飞龙链节间距实测（2026-09-02 用户报"节间拉开 55-70px"）:生产式生成后缠斗 30s,
// 逐秒采样每节 wormFollow 中心距(应恒 42±头速瞬态),并在 10s/25s 截图。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  g.entities.enemies.length = 0;
  const spec = Enemy.wormChainSpec(87, () => Math.random());
  const head = Enemy.fromVanilla(87, g.player.cx + 300, g.player.cy - 240);
  head.id = g.entities.nextId++;
  g.entities.enemies.push(head);
  const segs = Enemy.spawnWormChain(head, spec.count, spec.segIds, true);
  for (const s of segs) { s.id = g.entities.nextId++; g.entities.enemies.push(s); }
  window.__wlinks = () => {
    const chain = g.entities.enemies.filter((e) => !e.dead && e.vanillaId >= 87 && e.vanillaId <= 92);
    const out = [];
    for (const e of chain) {
      if (e.wormFollow) out.push(Math.round(Math.hypot(e.wormFollow.cx - e.cx, e.wormFollow.cy - e.cy)));
    }
    return { links: out, headAlive: chain.some((e) => e.vanillaId === 87 && !e.dead), n: chain.length };
  };
});
const trace = [];
for (let s = 0; s < 30; s++) {
  await new Promise((r) => setTimeout(r, 1000));
  // 每秒给玩家回血防撞死冻结
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.statLife = g.player.statLifeMax2 ?? 400;
  });
  const st = await page.evaluate(() => window.__wlinks());
  trace.push(st);
  if (s === 10) await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/wlinks-10s.png') });
  if (s === 25) await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/wlinks-25s.png') });
}
const maxLink = Math.max(...trace.flatMap((t) => t.links));
const minLink = Math.min(...trace.flatMap((t) => t.links.filter((x) => x > 0)));
const headAlwaysAlive = trace.every((t) => t.headAlive);
console.log('样本秒数:', trace.length, '链节数:', trace[0].n, '头恒活:', headAlwaysAlive);
console.log('链距 min/max:', minLink, '/', maxLink);
console.log('末5秒:', JSON.stringify(trace.slice(-5).map((t) => t.links)));
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
