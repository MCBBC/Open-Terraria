// 复现:砍树完成→掉落→自动拾取 的崩溃
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', e => { errs.push(String(e)); console.log('[pageerror]', String(e).slice(0, 300)); });
p.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
await p.evaluate(async () => { const r = await fetch('/tmp-crash-world.json'); await window.__swFlow.loadJson(await r.text()); });
for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 2000)); if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 5000));
// 找出生点附近的树干(sheet 5 等),逐棵连砍 20 棵(带掉落+自动拾取)
const res = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
  const st = g.world.store;
  const trees = [];
  for (let y = 0; y < g.world.h && trees.length < 40; y++) {
    for (let x = 0; x < g.world.w; x++) {
      const t = st.type[st.idx(x, y)];
      if (t && TILE_DEFS[t]?.vanilla?.sheet !== undefined && TRUNK.has(TILE_DEFS[t].vanilla.sheet)) {
        trees.push([x, y]);
        if (trees.length >= 40) break;
      }
    }
  }
  // 传送到第一棵树旁,给玩家斧头(砍树链),连砍
  if (!trees.length) return { err: 'no tree' };
  const [tx, ty] = trees[0];
  g.player.x = tx * 16 - 40; g.player.y = (ty - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  // 直接对每棵树调 breakTile(完整 KillTile 树链→掉落→拾取)
  let chopped = 0;
  for (const [x, y] of trees) {
    try {
      g['breakTile'](x, y, true);
      chopped++;
    } catch (e) {
      return { errAt: [x, y], chopped, err: String(e).slice(0, 400) };
    }
    await new Promise(r => setTimeout(r, 30));
  }
  return { chopped, total: trees.length };
});
console.log('砍树结果:', JSON.stringify(res).slice(0, 400));
// 等拾取发生
await new Promise(r => setTimeout(r, 6000));
const after = await p.evaluate(() => {
  const g = window.__swGame;
  const alive = !!g.running;
  return { alive, errors: (window.__swErrors ?? []).slice(-3).map(e => e.msg.slice(0, 200)), drops: g.entities?.drops?.length ?? -1, tick: g.tickCount };
});
console.log('6s 后状态:', JSON.stringify(after));
console.log(`pageerror 总数: ${errs.length}`);
await b.close(); process.exit(0);
