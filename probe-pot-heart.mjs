// 瓦罐掉心 pickup 验证：受伤玩家砸罐 → 心 pickup（不进背包、触碰回血）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = {};
  g.player.hp = 50; // 受伤 → 心分支可达
  // 直接调 potLoot（私有方法运行时可访问）直至掉出心
  let heart = null;
  for (let i = 0; i < 200 && !heart; i++) {
    g['potLoot'](Math.floor(g.world.w / 2), Math.floor(g.world.groundLevel) + 5);
    heart = g.entities.drops.find((d) => d.pickup === 'heart');
  }
  res.heartFromPot = !!heart;
  if (heart) {
    heart.x = g.player.x; heart.y = g.player.y;
    heart.age = 999;
    const hp0 = g.player.hp;
    await sleep(300);
    res.healed = g.player.hp - hp0;
    res.inInventory = g.player.inv.slots.some((s) => s && ITEM_DEFS[s.id]?.key?.toLowerCase().includes('heart'));
    res.isMushroom = g.player.inv.slots.some((s) => s && ITEM_DEFS[s.id]?.key === 'mushroom_item');
  }
  return res;
});
console.log(JSON.stringify(out));
const ok = out.heartFromPot && out.healed > 0 && !out.inInventory && !out.isMushroom;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
