// tileCut/瓦罐机制验证：
// 1) 挥击范围内杂草被清除（原版 ItemCheck_CutTiles 语义），无掉落（不可收集）
// 2) 瓦罐整罐 2×2 一次碎裂 + 掉落一次 loot（CheckPot+SpawnThingsFromPot 肉前主干）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
// HMR 全页重载窗口防抖：句柄可能随 reload 失效，校验存活
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const POT = window.__swTiles['pot'];
  const TALL = g.tileByKey['v_3_forest_short_plants'];
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -12; dx <= 42; dx++) for (let dy = -6; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -12; dx <= 42; dx++) st.setTile(px0 + dx, py + 1, 2);
  const pots = [-6, 1, 40].map((dx) => {
    st.setTile(px0 + dx, py, POT, 0, 0);
    st.setTile(px0 + dx + 1, py, POT, 18, 0);
    st.setTile(px0 + dx, py - 1, POT, 0, 18);
    st.setTile(px0 + dx + 1, py - 1, POT, 18, 18);
    return [px0 + dx, py];
  });
  const grass = [3, 4].map((dx) => { st.setTile(px0 + dx, py, TALL, 0, 0); return [px0 + dx, py]; });
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.player.facing = 1;
  // 铜剑入包并放 0 号格选中（heldItem 为空时 updateSwingHits 直接 return）
  const swordId = window.__swItems['copper_sword'];
  g.player.inv.add(swordId, 1);
  const slots = g.player.inv.slots;
  const si = slots.findIndex((it) => it && it.id === swordId);
  if (si > 0) { const t = slots[0]; slots[0] = slots[si]; slots[si] = t; }
  g.player.inv.selected = 0;
  const beforePot = pots.every(([x, y]) => st.get(x, y) === POT);
  const beforeGrass = grass.every(([x, y]) => st.get(x, y) === TALL);
  // 手动 smashPot（整罐碎裂 + loot 一次）
  const drops0 = g.entities.drops.length;
  g.smashPot(pots[0][0], pots[0][1]);
  const pot1Gone = [[0, 0], [1, 0], [0, -1], [1, -1]].every(([dx, dy]) => st.get(pots[0][0] + dx, pots[0][1] + dy) !== POT);
  const loot1 = g.entities.drops.length - drops0;
  // 挥击路径：swing 扫过 → 砍杂草 + 碎 x+6 罐
  const dropsBefore = g.entities.drops.length;
  g.swing = { t: 20, dur: 20, item: swordId };
  for (let i = 0; i < 25 && g.swing; i++) g.fixedUpdate(1 / 60);
  const pot2Gone = [[0, 0], [1, 0], [0, -1], [1, -1]].every(([dx, dy]) => st.get(pots[1][0] + dx, pots[1][1] + dy) !== POT);
  const grassGone = grass.every(([x, y]) => st.get(x, y) !== TALL);
  const swingDrops = g.entities.drops.slice(dropsBefore).map((d) => d.itemId);
  // 无限刷验证：已碎的罐位（pots[0] 手动碎）再次 smashPot 不再产生 loot
  const dropsAfter = g.entities.drops.length;
  g.smashPot(pots[0][0], pots[0][1]);
  const refillLoot = g.entities.drops.length - dropsAfter;
  return {
    beforePot, beforeGrass, pot1Gone, loot1, pot2Gone, grassGone,
    swingDrops, refillLoot,
    pot3Still: st.get(pots[2][0], pots[2][1]) === POT,
  };
});
console.log(JSON.stringify(out, null, 1));
check('瓦罐已摆放（前置）', out.beforePot);
check('手动 smashPot 整罐清除（2×2 四格）', out.pot1Gone);
check('smashPot 掉落一次 loot', out.loot1 > 0, `loot=${out.loot1}`);
check('挥击路径碎罐（swing 扫过范围）', out.pot2Gone);
check('挥击清除杂草（tileCut 语义）', out.grassGone);
check('挥击碎罐掉落 loot', out.swingDrops.length > 0, `drops=${JSON.stringify(out.swingDrops)}`);
check('已碎罐位不可重复刷 loot（无限刷修复）', out.refillLoot === 0, `refill=${out.refillLoot}`);
check('范围外瓦罐不受影响', out.pot3Still);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
