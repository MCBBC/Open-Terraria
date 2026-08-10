// tileCut/瓦罐机制验证：
// 1) 挥击范围内杂草/腐化植物被清除（原版 ItemCheck_CutTiles 语义）
// 2) 瓦罐挥击即整罐碎裂 + 掉落表出 loot（CheckPot+SpawnThingsFromPot 肉前主干）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const keys = window.__swTiles;
  const POT = keys['pot'];
  const TALL = keys['v_3_forest_short_plants'] ?? g.tileByKey['v_3_forest_short_plants'];
  // 地表观测台
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -12; dx <= 12; dx++) for (let dy = -6; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -12; dx <= 12; dx++) st.setTile(px0 + dx, py + 1, 2);
  // 摆放：3 只瓦罐（x+3 / x+6 / x+9）+ 杂草若干
  const pots = [3, 6, 9].map((dx) => {
    st.setTile(px0 + dx, py, POT, 0, 0);
    st.setTile(px0 + dx + 1, py, POT, 18, 0);
    st.setTile(px0 + dx, py - 1, POT, 0, 18);
    st.setTile(px0 + dx + 1, py - 1, POT, 18, 18);
    return [px0 + dx, py];
  });
  const grass = [-6, -5, -4].map((dx) => { st.setTile(px0 + dx, py, TALL, 0, 0); return [px0 + dx, py]; });
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  // 给玩家一把剑：挥击 reach
  const swordKey = Object.keys(g.tileByKey).length ? 'copper_sword' : null;
  const swordId = g.player.inv.add?.(swordKey ? window.__swItems?.[swordKey] ?? 0 : 0, 1);
  // 模拟挥击：直接驱动 updateSwingHits 逻辑——置 swing 并步进（内部 swing.t 逐帧减）
  const beforePot = pots.every(([x, y]) => st.get(x, y) === POT);
  const beforeGrass = grass.every(([x, y]) => st.get(x, y) === TALL);
  // 直接调用 smashPot 等价路径：先测手动 smashPot（带打点）
  const dbg = {
    potId: POT, internalPot: g.tileByKey['pot'],
    inBounds: !!st.inBounds,
    getAt: st.get(pots[0][0], pots[0][1]),
  };
  try { g.smashPot(pots[0][0], pots[0][1]); } catch (err) { dbg.err = String(err); }
  const pot1Gone = st.get(pots[0][0], pots[0][1]) !== POT && st.get(pots[0][0] + 1, pots[0][1] - 1) !== POT;
  // 挥击路径：swing + 面向右 + 步进（砍杂草 + 碎 x+6 罐）
  const dropsBefore = g.entities.drops.length;
  g.player.facing = 1;
  // 模拟一次完整挥击（使用与 updateSwingHits 相同入口：swing 状态由 useItem 生成，这里手动置）
  g.swing = { t: 20, dur: 20, item: -1 };
  g.swingTileCutSet.clear?.();
  for (let i = 0; i < 25 && g.swing; i++) g.fixedUpdate(1 / 60);
  const pot2Gone = st.get(pots[1][0], pots[1][1]) !== POT;
  const grassGone = grass.every(([x, y]) => st.get(x, y) !== TALL);
  const drops = g.entities.drops.slice(dropsBefore).map((d) => d.itemId);
  return {
    dbg, beforePot, beforeGrass, pot1Gone, pot2Gone, grassGone, drops,
    pot3Still: st.get(pots[2][0], pots[2][1]) === POT,
  };
});
console.log(JSON.stringify(out, null, 1));
check('瓦罐已摆放（前置）', out.beforePot);
check('手动 smashPot 整罐清除（2×2 四格）', out.pot1Gone);
check('挥击路径碎罐（swing 扫过范围）', out.pot2Gone);
check('挥击清除杂草（tileCut 语义）', out.grassGone);
check('瓦罐掉落 loot 出现', out.drops.length > 0, `drops=${JSON.stringify(out.drops)}`);
check('范围外瓦罐不受影响', out.pot3Still);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
