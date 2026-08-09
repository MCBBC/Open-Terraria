// 阶段6 第二轮功能单测:绳索列放置/绳索攀爬/锤子半砖切换
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', () => {});
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'feat2');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const tiles = window.__swTiles, items = window.__swItems;
  const vw = g.camera.viewW, vh = g.camera.viewH;
  const toScreen = (tx, ty) => [
    (tx * 16 + 8 - g.camera.x) * g.camera.zoom + g.camera.viewW / 2,
    (ty * 16 + 8 - g.camera.y) * g.camera.zoom + g.camera.viewH / 2,
  ];
  const clickTile = async (tx, ty) => {
    const [sx, sy] = toScreen(tx, ty);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true;
    await sleep(200);
    g.input.mouseDown = false;
    await sleep(150);
  };
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  const results = {};

  // ===== 1. 绳索列放置 =====
  const ROPE = tiles['v_213_rope'];
  // 在玩家右侧找一列空气(地表上方)
  let rx = px + 4, ry = py - 3;
  inv.add(items['rope'], 5);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['rope']) { inv.selected = i; break; }
  await clickTile(rx, ry);
  let ropeN = 0, ropeBottom = -1;
  for (let y = ry; y < ry + 12; y++) {
    if (st.get(rx, y) === ROPE) { ropeN++; ropeBottom = y; } else break;
  }
  results.ropePlace = { ropeN, ropeBottom };

  // ===== 2. 绳索攀爬 =====
  // 把玩家放到绳上:清绳上障碍,直接传送
  if (ropeN > 2) {
    const midY = ry + 1;
    // 清玩家站位
    for (let dy = 0; dy < 3; dy++) {
      for (let dx2 = 0; dx2 < 2; dx2++) {
        if (st.isActive(rx + dx2, midY + dy) && !TILE_DEFSafe(st.get(rx + dx2, midY + dy))) st.setTile(rx + dx2, midY + dy, 0);
      }
    }
    p.x = rx * 16 + 2; p.y = midY * 16; p.vx = 0; p.vy = 0;
    p.fallStartY = null;
    await sleep(80);
    const onRope1 = p.onRope;
    const yOnRope = p.y;
    // 按 S 下滑
    g.input.keys.add('KeyS');
    await sleep(400);
    g.input.keys.delete('KeyS');
    const yAfterDown = p.y;
    results.ropeClimb = { onRope1, yOnRope: Math.round(yOnRope), yAfterDown: Math.round(yAfterDown), slid: yAfterDown > yOnRope + 4, hp: p.hp };
  }
  function TILE_DEFSafe(t) { return false; } // 站位清理保守:不清任何块(避免误删)

  // ===== 3. 锤子半砖 =====
  // 用新鲜玩家坐标找下方实心块(测试期间玩家会移动)
  const px2 = Math.floor(p.cx / 16), py2 = Math.floor((p.y + p.h) / 16);
  let hx = px2, hy = py2 + 1;
  while (hy < st.h - 2 && !st.flags[st.idx(hx, hy)]) hy++;
  if (st.flags[st.idx(hx, hy)]) {
    inv.add(items['iron_hammer'], 1);
    for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['iron_hammer']) { inv.selected = i; break; }
    const halfBefore = st.half[st.idx(hx, hy)];
    await clickTile(hx, hy);
    const halfAfter = st.half[st.idx(hx, hy)];
    await clickTile(hx, hy);
    const halfAfter2 = st.half[st.idx(hx, hy)];
    results.hammerHalf = { halfBefore, halfAfter, toggled: halfAfter !== halfBefore, back: halfAfter2 === halfBefore };
  }

  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
