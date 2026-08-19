// 迷雾入场绘制探针 v2：数据链已证正确（idle 即清雾）→ 查【画出来的】东西。
// 静止入场截图(HUD 小地图) → 开全屏地图截图 → 移动后再截图;另采样
// HUD 小地图画布中心像素与 GL 纹理行游标。
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
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 800, H = 300;
  const world = new World(W, H, 777, 'fog-entry-probe2');
  world.spawnX = 400; world.spawnY = 150;
  world.groundLevel = 100; world.rockLevel = 180; world.lavaLine = 260;
  // 地表渐变:草+泥+石,让截图可读
  for (let x = 0; x < W; x++) {
    for (let y = 155; y < 180; y++) world.store.setTile(x, y, 1);
    for (let y = 180; y < H; y++) world.store.setTile(x, y, 2);
    world.store.setTile(x, 154, 3);
  }
  const parts = sf.buildSaveParts(world);
  const json = sf.serializeSave(parts.view, parts.meta, parts.player, 0);
  await window.__swFlow.loadJson(json);
  const g = window.__swGame;
  await new Promise((r2) => setTimeout(r2, 2000));   // 静止 2s
  const rr = g.renderer;
  const hudPix = () => {
    const c = rr._mmHudCanvas;
    if (!c || !c.width) return null;
    const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  const s1 = { hudCenter: hudPix(), rowSeen: rr._mapFogRowSeen, fogH: rr.fogH };
  rr.fullMap.open = true;
  await new Promise((r2) => setTimeout(r2, 500));
  const s2 = { rowSeen: rr._mapFogRowSeen, open: rr.fullMap.open };
  return { s1, s2 };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/fog-map-open-idle.png' });
await page.evaluate(() => { const g = window.__swGame; g.player.x += 300; });
await new Promise((r2) => setTimeout(r2, 900));
await page.screenshot({ path: '/tmp/fog-map-open-moved.png' });
await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
await new Promise((r2) => setTimeout(r2, 400));
await page.screenshot({ path: '/tmp/fog-hud-idle-after.png' });
console.log('shots saved');
await browser.close();
