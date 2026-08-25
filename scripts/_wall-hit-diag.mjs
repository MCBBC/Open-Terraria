// 一次性:锤墙路径插桩——铺墙→神锤挥一击→读墙值/hitTiles 转储
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  for (let dy = -16; dy <= 2; dy++) for (let dx = -20; dx <= 20; dx++) st.setTile(px + dx, py + dy, 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(px + dx, py + 1, 2);
  const wc = { x: px - 2, y: py - 4 };
  st.setWall(wc.x, wc.y, 1);
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  idle: for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
  const [sx, sy] = g.camera.worldToScreen(wc.x * 16 + 8, wc.y * 16 + 8);
  g.input.mouseX = sx; g.input.mouseY = sy;
  for (let i = 0; i < 14; i++) {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  }
  return {
    wallAfter: st.wall[st.idx(wc.x, wc.y)],
    targetScreen: [sx, sy],
    canvasSize: [g.renderer.canvas.width, g.renderer.canvas.height],
    hitSize: g.hitTiles.size(),
    top: g.hitTiles.dumpTop(6),
    lastMineHitTick: g.lastMineHitTick,
    tickCount: g.tickCount,
    mining: g.mining,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
