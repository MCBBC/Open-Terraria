// 阶段6 第七轮单测:矿车(轨道放置→骑乘→驱动加速→跳车)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
await page.type('input', 'feat7');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
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
  // 造轨道:玩家旁边一排水平轨道(5 格)
  const TRACK = tiles['v_314_minecart_track'];
  const ry = py + 1; // 脚下那格
  for (let dx = -3; dx <= 57; dx++) {
    st.setTile(px + dx, ry, TRACK, 0, 0);
    st.setTile(px + dx, ry - 1, 0);
  }
  // 给矿车并右键轨道
  inv.add(items['minecart_item'], 1);
  let mSlot = -1;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['minecart_item']) mSlot = i;
  inv.selected = mSlot;
  (globalThis).__c7 = true;
  await rightClick(px, ry);
  const cart = g.minecart;
  results.mount = { hasCart: !!cart, mounted: cart ? cart.mounted : false };
  if (cart) {
    // 驱动:按 D 500ms
    g.input.keys.add('KeyD');
    await sleep(200);
    results.ixMid = { inputX: p.inputX, keysD: g.input.keys.has('KeyD'), uiBlock: g.input.uiBlocking, cartAlive: !cart.dead, gMinecart: g.minecart !== null, vxMid: cart.vx, cartIsGCart: cart === g.minecart };
    await sleep(100);
    g.input.keys.delete('KeyD');
    const vx = cart.vx;
    // 跳车
    g.input.keys.add('KeyR');
    await sleep(150);
    g.input.keys.delete('KeyR');
    await sleep(200);
    results.ride = { vx: +vx.toFixed(2), accelerated: vx > 0.5 };
    results.dismount = { stillMounted: g.minecart !== null };
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
