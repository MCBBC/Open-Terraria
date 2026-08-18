// 肉山巫毒娃娃全链验证：丢娃入熔岩 → boss 槽位 → 击杀 → hardMode 旗 + 砖盒 + Pwnhammer 掉落。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const w = g.world;
  // 找一个向导 NPC（没有就先造——娃娃只杀向导,无向导也召不动? 原版 267 烧毁即杀场上全部向导并召）
  const beforeGuides = g.entities.npcs.filter(n => !n.dead && n.vanillaId === 22).length;
  // 地狱找一格岩浆（底部 220 行内扫液体=岩浆）
  let lx = -1, ly = -1;
  const lavaT = st.h - 30;
  outer: for (let y = lavaT; y > st.h - 120; y--) {
    for (let x = Math.floor(st.w / 2) - 100; x < Math.floor(st.w / 2) + 100; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] && st.liquid[i] > 0) { lx = x; ly = y; break outer; }
    }
  }
  if (lx < 0) return { error: 'no lava found' };
  // 丢娃娃：构造 ItemDrop（经模块导入拿类）——或直接调 ItemDrop 池入口
  const mod = await import('/src/entities/ItemDrop.ts');
  const dollKey = Object.keys(window.__swItems).find(k => /^vi_267_/.test(k));
  const dollId = window.__swItems[dollKey];
  const drop = new mod.ItemDrop(lx * 16 + 8, ly * 16 + 8, dollId, 1);
  drop.vx = 0; drop.vy = 0;
  g.entities.add(drop, 'drops');
  // 等岩浆烧毁 → 召唤
  await new Promise(r => setTimeout(r, 2500));
  const wofs = g.entities.enemies.filter(e => !e.dead && e.vanillaId === 113);
  const wof = wofs[0] ?? null;
  const bossSlot = g.boss === wof;
  if (!wof) return { error: 'WoF not spawned', guidesBefore: beforeGuides };
  // 击杀（真实伤害管线）
  const pwnKey = Object.keys(window.__swItems).find(k => /^vi_367_/.test(k));
  const pwnId = window.__swItems[pwnKey];
  const deathX = Math.floor(wof.cx / 16), deathY = Math.floor(wof.cy / 16);
  wof.hurt(9999999, 10, 0, g);
  const dumpDrops = () => (g.entities.drops || []).filter(d => !d.dead).map(d => ({ id: d.itemId, x: Math.round(d.x), y: Math.round(d.y) }));
  const early = dumpDrops();
  await new Promise(r => setTimeout(r, 150));
  const mid = dumpDrops();
  await new Promise(r => setTimeout(r, 1100));
  // 砖盒检查：死亡点 ±4 壳上魔金砖/猩红砖（sheet 140/347）
  const st2 = st;
  const brickAt = [];
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
    const i = st2.idx(deathX + dx, deathY + dy);
    if (st2.flags[i]) {
      const sh = (st2.type[i], null);
      void sh;
    }
  }
  // 简化：数死亡点 9×9 内魔金砖格（type 查 TILE_DEFS 不便——用 sheet 数法）
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  let bricks = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
    const i = st2.idx(deathX + dx, deathY + dy);
    if (st2.flags[i]) {
      const s = TILE_DEFS[st2.type[i]]?.vanilla?.sheet ?? -1;
      if (s === 140 || s === 347) bricks++;
    }
  }
  // 掉落：Pwnhammer 在掉落物表里？
  const drops = g.entities.drops ?? [];
  const pwnDropped = drops.some(d => !d.dead && d.itemId === pwnId);
  return {
    guidesBefore: beforeGuides,
    wofSpawned: true, bossSlot,
    hardMode: !!w.flags.hardMode,
    downed113: !!w.flags['downed_113'],
    brickBoxTiles: bricks, deathX, deathY,
    pwnDropped, early, mid, final: (g.entities.drops || []).filter(d => !d.dead).map(d => d.itemId),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
