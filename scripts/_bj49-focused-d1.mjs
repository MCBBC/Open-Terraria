// SW-BJ49 聚焦取证:D1 火把隔断 fixture 逐帧解剖(独立冷启动,无跨场景污染)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { TILE_BY_KEY, T } = await import('/src/data/tiles.ts');
  const TILE = 16;
  const PLAT = TILE_BY_KEY['platform'];
  const STONE = TILE_BY_KEY['stone'];
  const X0 = Math.floor(g.player.x / TILE);
  const F = Math.max(20, (g.world.groundLevel ?? 40) - 60);
  const R = F - 3;
  const clear = (x0, y0, x1, y1) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { if (!st.inBounds(x, y)) continue; const i = st.idx(x, y); st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 0; st.slope[i] = 0; st.half[i] = 0; } };
  clear(X0 - 16, R - 10, X0 + 22, F + 4);
  for (let x = X0 - 14; x <= X0 + 20; x++) st.setTile(x, F, STONE, 0, 0);
  for (let x = X0 - 2; x <= X0; x++) st.setTile(x, R, PLAT, 0, 0);       // 行 X0-2..X0
  st.setTile(X0 + 1, R, T.TORCH, 0, 0);                                   // 火把 X0+1
  g.player.x = X0 * TILE; g.player.y = F * TILE - g.player.h; g.player.vx = 0; g.player.vy = 0;
  const slot = ITEM_DEFS.findIndex((d) => (d.vid ?? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1)) === 94);
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: slot, stack: 999, favorited: false };
  g.player.inv.selected = 0;
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  // 智能开(toggle)
  g.input.keys.add('ControlLeft'); g.fixedUpdate(1 / 60); g.input.keys.delete('ControlLeft'); g.fixedUpdate(1 / 60);
  // 鼠标到 (X0+3, R) —— 行端外 2 格(隔火把)
  const setMouse = (tx, ty) => { const [sx, sy] = g.camera.worldToScreen(tx * TILE + 8, ty * TILE + 8); g.input.mouseX = sx; g.input.mouseY = sy; const [ux, uy] = g.camera.tileUnder(sx, sy); return [ux, uy, g.camera.screenToWorld(sx, sy)]; };
  const under = setMouse(X0 + 3, R);
  const rowDump = [];
  for (let x = X0 - 3; x <= X0 + 5; x++) rowDump.push([x, st.hasTile(x, R) ? st.type[st.idx(x, R)] : 0]);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const frames = [];
  for (let f = 0; f < 6; f++) {
    g.fixedUpdate(1 / 60);
    frames.push({ f, wanted: g.smartCursor.wanted, showing: g.smartCursor.showing,
      target: [g.smartCursor.x, g.smartCursor.y], lock: g.smartCursor.lockedContinuity && [g.smartCursor.lockedContinuity.x, g.smartCursor.lockedContinuity.y],
      dir: g.smartCursor.lockedDirection && [g.smartCursor.lockedDirection.x, g.smartCursor.lockedDirection.y],
      useTime: g.player.useTime });
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const placed = [];
  for (let x = X0 - 3; x <= X0 + 6; x++) if (st.hasTile(x, R) && st.type[st.idx(x, R)] === PLAT && (x < X0 - 2 || x > X0)) placed.push(x);
  return { X0, R, under, rowDump, frames, placed, mouseWorldTile: [Math.floor(g.camera.screenToWorld(g.input.mouseX, g.input.mouseY)[0] / TILE), Math.floor(g.camera.screenToWorld(g.input.mouseX, g.input.mouseY)[1] / TILE)] };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
