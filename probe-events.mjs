// 事件+商人 E2E：①血月对话/商店门 ②旅行商人到访+动态商店 ③骷髅商生成+商店+离屏消散
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
  const { Lang } = await import('/src/i18n/Lang.ts');
  const res = {};

  // ① 血月：向导 170-172；商人商店上恐怖面具(279)
  g.world.clock.bloodMoon = true;
  const guide = g.entities.npcs.find((n) => n.npcKey === 'guide');
  const pool = new Set([170, 171, 172].map((k) => Lang.text('LegacyDialog.' + k)));
  let ok = true;
  for (let i = 0; i < 20; i++) if (!pool.has(g.townNpcChat(guide))) ok = false;
  res.bloodMoonGuideChat = ok;
  const merchStock = g.shopStockFor({ vanillaId: 17, npcKey: 'merchant' });
  res.bloodMoonShopMask = merchStock.some((e) => e[0] === 279);
  g.world.clock.bloodMoon = false;

  // ② 旅行商人：造条件（2+ 入住者+白天上午），循环 roll 到生成
  g.world.clock.timeOfDay = 0.35; // 上午
  const npcs0 = g.entities.npcs;
  for (const n of npcs0) { if ((n.npcKey === 'guide' || n.npcKey === 'old_man') && !n.home) n.home = { x: Math.floor(g.player.cx / 16), y: Math.floor(g.player.cy / 16) }; }
  let spawned = false;
  for (let i = 0; i < 400000 && !spawned; i++) { g.updateTravellingMerchant(); spawned = g.entities.npcs.some((n) => n.npcKey === 'travelling_merchant'); }
  res.travelSpawned = spawned;
  res.travelStock = spawned ? g.travelStock.length : 0;
  res.travelStockSample = spawned ? g.travelStock.slice(0, 6) : [];
  // 对话池 322-330
  if (spawned) {
    const tm = g.entities.npcs.find((n) => n.npcKey === 'travelling_merchant');
    const pool2 = new Set();
    for (let k = 319; k <= 330; k++) pool2.add(Lang.text('LegacyDialog.' + k));
    let ok2 = true;
    for (let i = 0; i < 20; i++) if (!pool2.has(g.townNpcChat(tm))) ok2 = false;
    res.travelChat = ok2;
    // 离场：拨到傍晚+远离 → dead
    g.world.clock.timeOfDay = 0.7;
    g.player.x += 4000;
    for (let i = 0; i < 5; i++) g.updateTravellingMerchant();
    res.travelDeparted = g.entities.npcs.every((n) => n.npcKey !== 'travelling_merchant' || n.dead);
    g.player.x -= 4000;
  }

  // ③ 骷髅商：debug 池强制 453 → trySpawnEnemy 转换
  window.__swSetPool([453]);
  g.enemySpawnEnabled = true;
  let sm = null;
  for (let i = 0; i < 4000 && !sm; i++) { g.trySpawnEnemy(); sm = g.entities.npcs.find((n) => n.npcKey === 'skeleton_merchant'); }
  window.__swSetPool(null);
  res.skeletonSpawned = !!sm;
  if (sm) {
    res.skeletonShop = g.shopStockFor(sm).length;
    const pool3 = new Set([356, 357, 358, 359, 360, 361, 362, 363].map((k) => Lang.text('LegacyDialog.' + k)));
    pool3.add(Lang.chatter('SkeletonMerchantChatter'));
    let ok3 = true;
    for (let i = 0; i < 20; i++) if (!pool3.has(g.townNpcChat(sm))) ok3 = false;
    res.skeletonChat = ok3;
    // 离屏 750t 消散（直接快进计数器）
    sm.x = g.player.x - 4000;
    for (let i = 0; i < 800; i++) g.updateTravellingMerchant();
    res.skeletonDespawned = sm.dead;
  }
  return res;
});
console.log(JSON.stringify(out));
await b.close();
