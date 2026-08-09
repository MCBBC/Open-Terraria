// 阶段6 第六轮b:锁定宝箱(金钥匙消耗)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat6b');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  const items = window.__swItems, tiles = window.__swTiles;
  const vw = g.camera.viewW, vh = g.camera.viewH;
  const toScreen = (tx, ty) => [(tx * 16 + 8 - g.camera.x) * g.camera.zoom + vw / 2, (ty * 16 + 8 - g.camera.y) * g.camera.zoom + vh / 2];
  const rightClick = async (tx, ty) => {
    const [sx, sy] = toScreen(tx, ty);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.rightDown = true;
    await sleep(150);
    g.input.rightDown = false;
    await sleep(100);
  };
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  const results = {};
  // 造一个锁定箱
  const CHEST = tiles['chest'];
  const cx2 = px + 4, cy2 = py - 2;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(cx2 + dx, cy2 + dy, 0);
  st.setTile(cx2, cy2, CHEST, 0, 0);
  g.world.chests.push({ x: cx2, y: cy2, items: Array(10).fill(null), locked: true });
  // 1) 无钥匙 → 拒绝
  await rightClick(cx2, cy2);
  results.lockedNoKey = { stillLocked: g.world.chests[g.world.chests.length - 1].locked };
  // 2) 给钥匙 → 开启消耗
  p.inv.add(items['vi_327_golden_key'], 2);
  const keySlot = p.inv.slots.findIndex((s) => s && s.id === items['vi_327_golden_key']);
  const before = p.inv.slots[keySlot].stack;
  await rightClick(cx2, cy2);
  const after = p.inv.slots[keySlot] ? p.inv.slots[keySlot].stack : 0;
  results.lockedWithKey = { before, after, unlocked: !g.world.chests[g.world.chests.length - 1].locked, ok: after === before - 1 };
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
