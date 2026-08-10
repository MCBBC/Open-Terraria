// 税务员收税 E2E（用游戏侧实体：解救 bound 税务员，避免双实例 instanceof 坑）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  // 游戏侧解救 bound 税务员并安家
  const bound = g.entities.npcs.find((n) => n.npcKey === 'tax_collector' && n.bound);
  if (!bound) return { error: 'no bound tax collector' };
  g.freeBoundNpc(bound);
  bound.home = { x: Math.floor(g.player.cx / 16), y: Math.floor(g.player.cy / 16) };
  bound.x = g.player.cx; bound.y = g.player.cy - 60;
  // 向导也安家凑入住数(=2)
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  guide.home = { x: Math.floor(g.player.cx / 16) + 3, y: Math.floor(g.player.cy / 16) };
  g.player.taxTimer = 3590;
  await new Promise((r) => setTimeout(r, 800));
  const taxMoney = g.player.taxMoney;
  const before = g.coinsOwned();
  g.taxCollect();
  const after = g.coinsOwned();
  return { taxMoneyAfterHour: taxMoney, coinsBefore: before, coinsAfter: after, taxAfterCollect: g.player.taxMoney };
});
console.log(JSON.stringify(out));
await b.close();
