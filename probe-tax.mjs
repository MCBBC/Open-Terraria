// 税务员收税 E2E：入住税务员 → 税款累积(50 铜×入住数/游戏小时) → 收集入包
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  // 移除 bound 税务员（地狱里那个），改为已解救 + 入住状态
  const bound = g.entities.npcs.find((n) => n.npcKey === 'tax_collector');
  if (bound) bound.dead = true;
  g.world.flags.savedTaxCollector = true;
  const tc = new TownNPC('tax_collector', g.player.cx, g.player.cy - 40);
  tc.home = { x: Math.floor(g.player.cx / 16), y: Math.floor(g.player.cy / 16) };
  g.entities.add(tc, 'npcs');
  // 向导也有 home → 入住数 = 2（税务员+向导假 home？向导 homeless——手动给个 home 凑数）
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  guide.home = { x: Math.floor(g.player.cx / 16) + 3, y: Math.floor(g.player.cy / 16) };
  // 快进累积：taxTimer 置 3590，跑 20 tick
  g.player.taxTimer = 3590;
  await new Promise((r) => setTimeout(r, 400));
  const taxMoney = g.player.taxMoney;
  // 收集
  const before = g.coinsOwned();
  g.taxCollect();
  const after = g.coinsOwned();
  const again = g.player.taxMoney;
  return { taxMoneyAfterHour: taxMoney, coinsBefore: before, coinsAfter: after, taxAfterCollect: again };
});
console.log(JSON.stringify(out));
await b.close();
