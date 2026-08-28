// 飞猪真实鼠标事件复现（用户报:右键开面板瞬间被识别为左键→重新唤起猪）。
// 真实事件链 = Input 监听(canvas mousemove + window mousedown)→updateUse。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(300, 180, 777, 'pigrmb');
  world.spawnX = 150; world.spawnY = 90;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  for (let i = 0; i < 40 && !window.__swItems; i++) await new Promise((r2) => setTimeout(r2, 50));
  document.getElementById('sw-boot-prime')?.remove();   // 幕吃 canvas mousemove(探针直进不撤)
  const g = window.__swGame;
  if (g.player.dead) g.respawnPlayer?.();
  g.player.hp = 99999;
  g.player.inv.slots[0] = { id: window.__swItems[window.__swVANILLA_ITEM_KEY_BY_ID[3213]], stack: 1 };
  g.cb.onInventoryChanged?.();
  // 间谍
  g.__log = [];
  const oi = g.interactContainerPet.bind(g);
  g.interactContainerPet = (hit) => { g.__log.push('interact:' + hit.kind); oi(hit); };
  const oc = g.openChest;
  g.openChest = (c) => { g.__log.push('openChest:' + (c ? c.x : 'null')); oc?.(c); };
});
const countPigs = () => page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) n++;
  return { pigs: n, panel: window.__swUI.openChest ? window.__swUI.openChest.x : null };
});

// ① 真实左键掷出（瞄准玩家右下 40,20——屏内）
const a0 = await page.evaluate(() => window.__swGame.camera.worldToScreen(window.__swGame.player.cx + 40, window.__swGame.player.cy + 20));
// loadJson 重建 Game 后 Input 挂旧 canvas(探针环境特有,真机无此问题)——mousemove 直发
const mm = (x, y) => page.evaluate((cx2, cy2) => {
  document.querySelectorAll('canvas').forEach((cv) => cv.dispatchEvent(
    new MouseEvent('mousemove', { clientX: cx2, clientY: cy2, bubbles: true })));
}, x, y);
await mm(a0[0], a0[1]);
await page.mouse.down(); await new Promise((r) => setTimeout(r, 60)); await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
console.log('after throw:', JSON.stringify(await countPigs()));

// ② 等 hover 稳定,真实右键飞猪
const a1 = await page.evaluate(() => {
  const g = window.__swGame;
  let pig = null;
  for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) pig = e;
  if (!pig) return null;
  for (let i = 0; i < 120 && pig.phase === 0; i++) g.fixedUpdate(1 / 60);
  const [sx, sy] = g.camera.worldToScreen(pig.cx, pig.cy);
  return { sx, sy, cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom, vw: g.camera.viewW, vh: g.camera.viewH } };
});
console.log('aim:', JSON.stringify(a1));
if (a1 && Number.isFinite(a1.sx)) {
  await mm(a1.sx, a1.sy);
  await new Promise((r) => setTimeout(r, 100));
  const pre = await page.evaluate(() => {
    const g = window.__swGame;
    let pig = null;
    for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) pig = e;
    const [wx, wy] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY);
    return {
      mx: g.input.mouseX, my: g.input.mouseY,
      contains: pig ? (wx >= pig.x && wx < pig.x + pig.w && wy >= pig.y && wy < pig.y + pig.h) : null,
      inRange: pig ? g.petInRange(pig) : null,
      uiBlocking: g.input.uiBlocking,
    };
  });
  console.log('pre:', JSON.stringify(pre));
  await page.mouse.down({ button: 'right' }); await new Promise((r) => setTimeout(r, 80)); await page.mouse.up({ button: 'right' });
  await new Promise((r) => setTimeout(r, 200));
  console.log('log:', JSON.stringify(await page.evaluate(() => window.__swGame.__log ?? [])));
  console.log('after rmb:', JSON.stringify(await countPigs()));
  // 60 tick 后是否出现"迟到的重新唤起"
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__swGame.fixedUpdate(1 / 60); });
  console.log('after 60t:', JSON.stringify(await countPigs()));
  // ③ 智能光标选圈态：wanted 开 → 光标命中 2 / 移开 1；关 → 0
  await page.evaluate(() => { window.__swGame.smartCursor.wanted = true; });
  await mm(a1.sx, a1.sy);
  await page.evaluate(() => { window.__swGame.fixedUpdate(1 / 60); window.__swGame.fixedUpdate(1 / 60); });
  const st1 = await page.evaluate(() => {
    const g = window.__swGame;
    let st = null;
    for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) st = e.interactState;
    return st;
  });
  await mm(100, 700);
  await page.evaluate(() => { window.__swGame.fixedUpdate(1 / 60); window.__swGame.fixedUpdate(1 / 60); });
  const st2 = await page.evaluate(() => {
    const g = window.__swGame;
    let st = null;
    for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) st = e.interactState;
    return st;
  });
  await page.evaluate(() => { window.__swGame.smartCursor.wanted = false; });
  await page.evaluate(() => { window.__swGame.fixedUpdate(1 / 60); });
  const st3 = await page.evaluate(() => {
    const g = window.__swGame;
    let st = null;
    for (const e of g.entities.projectiles) if (!e.dead && e.timeLeft > 10000 && e.w === 30) st = e.interactState;
    return st;
  });
  console.log('sel states:', JSON.stringify({ hover: st1, away: st2, off: st3 }));
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
    }
    const g = window.__swGame;
    if (g.player.dead) g.respawnPlayer?.();
    g.player.hp = 99999;
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/flying-pig.png' });
} else {
  console.log('aim NaN — 相机字段:', JSON.stringify(a1));
}
await browser.close();
