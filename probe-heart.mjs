// 心 pickup 验证：掉心→碰触→hp+20 不进背包；满血时也直接消耗（原版语义）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const px = g.player.cx, py = g.player.cy;
  const res = {};
  g.player.hp = 50; // 血不满 → 掉心条件成立
  // 杀僵尸直到掉出心（1/6×1/2≈8%：最多 300 杀）
  let heart = null;
  for (let i = 0; i < 300 && !heart; i++) {
    const e = Enemy.fromVanilla(3, px + 30, py - 10);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hurt(1e9, 0, 0, g);
    heart = g.entities.drops.find((d) => d.pickup === 'heart');
  }
  res.heartDropped = !!heart;
  if (heart) {
    // 把心挪到玩家身上（绕过拾取延迟等待）
    heart.x = g.player.x; heart.y = g.player.y;
    heart.age = 999;
    const hp0 = g.player.hp;
    const invHas = g.player.inv.slots.some((s) => s && ITEM_DEFS[s.id]?.key?.includes('58_Heart'));
    await sleep(300);
    res.healed = g.player.hp - hp0;
    res.heartGone = heart.dead || !g.entities.drops.includes(heart);
    res.inInventory = g.player.inv.slots.some((s) => s && ITEM_DEFS[s.id]?.key?.includes('58_Heart')) || invHas;
  }
  return res;
});
console.log(JSON.stringify(out));
const ok = out.heartDropped && out.healed > 0 && out.heartGone && !out.inInventory;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
