import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => { errs.push(String(e)); console.log('[pageerror]', String(e).slice(0, 500)); });
p.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 250)); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-crash-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
// 贴脸连砍:玩家站在树旁,每砍一棵把玩家挪到下一棵(掉落必然拾取)
const res = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 323]);
  const st = g.world.store;
  const trees = [];
  for (let y = 0; y < g.world.h && trees.length < 25; y++) {
    for (let x = 0; x < g.world.w; x++) {
      const t = st.type[st.idx(x, y)];
      const sheet = t && TILE_DEFS[t]?.vanilla?.sheet;
      if (sheet !== undefined && TRUNK.has(sheet)) trees.push([x, y, sheet]);
      if (trees.length >= 25) break;
    }
  }
  let picked = 0, lastDrop = 0;
  for (const [x, y, sheet] of trees) {
    // 贴脸(拾取半径内)
    g.player.x = x * 16 - 24; g.player.y = (y - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    try { g['breakTile'](x, y, true); } catch (e) { return { errAt: [x, y, sheet], err: String(e).slice(0, 400) }; }
    // 等掉落生成+飞向玩家被拾取
    for (let k = 0; k < 12; k++) {
      await new Promise(r => setTimeout(r, 50));
    }
    const dropsNow = g.entities.drops.length;
    if (dropsNow < lastDrop || dropsNow === 0) picked++;
    lastDrop = dropsNow;
  }
  return { trees: trees.length, sheets: [...new Set(trees.map(t => t[2]))], remainingDrops: g.entities.drops.length };
});
console.log('贴脸砍:', JSON.stringify(res));
await new Promise(r => setTimeout(r, 5000));
const alive = await p.evaluate(() => ({ alive: !!window.__swGame.running, tick: window.__swGame.tickCount, hp: window.__swGame.player.hp, wood: JSON.stringify(window.__swGame.player.inv.slots.filter(s => s && (s.id === 9 || String(s.id) === '9')).map(s => s.stack)) }));
console.log('5s 后:', JSON.stringify(alive));
console.log('pageerror:', errs.length);
await b.close(); process.exit(0);
