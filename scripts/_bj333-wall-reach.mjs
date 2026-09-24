// BJ333 射程取证：直读 inTileRange/tileReach/玩家盒真实值
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
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const cx = Math.floor(st.w / 2);
  const RX0 = cx - 60, RX1 = cx + 60, RY0 = 20, RY1 = 78;
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
    const i = st.idx(x, y);
    if (st.type[i] !== 0 || st.flags[i] !== 0) st.setTile(x, y, 0);
    if (st.wall[i] !== 0) st.setWall(x, y, 0);
    st.liquid[i] = 0;
  }
  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  const pin = (px, py) => { g.player.x = px * 16; g.player.y = py * 16; g.player.vx = 0; g.player.vy = 0; };
  const settle = (px, py, n = 50) => { for (let i = 0; i < n; i++) { pin(px, py); g.fixedUpdate(1 / 60); } };

  // 站 (cx-23, 34)（=拒锤形态站位），读玩家盒与射程
  settle(cx - 23, 34, 40);
  pin(cx - 23, 34);
  const dump = {
    px: g.player.x, py: g.player.y, pw: g.player.w, ph: g.player.h,
    pcx: g.player.cx, pcy: g.player.cy,
    gravDir: g.player.gravDir,
    tileReach: null, inRange2079_34: null, inRange2077_34: null,
  };
  try { dump.tileReach = g.tileReach ? g.tileReach(0) : ('no-fn:' + typeof g.tileReach); } catch (e) { dump.tileReach = 'err:' + e.message; }
  try { dump.inRange2079_34 = g.inTileRange(2079, 34); } catch (e) { dump.inRange2079_34 = 'err:' + e.message; }
  try { dump.inRange2077_34 = g.inTileRange(2077, 34); } catch (e) { dump.inRange2077_34 = 'err:' + e.message; }

  // 再挥一锤复核 inRange 与 addDamage
  const T = cx - 21;
  for (let y = 34; y <= 47; y++) for (let x = cx - 24; x <= cx - 5; x++) st.setWall(x, y, 200);
  st.setWall(T, 34, 200);
  settle(cx - 23, 34, 30);
  const swing = [];
  for (let i = 0; i < 8; i++) {
    pin(cx - 23, 34);
    g.fixedUpdate(1 / 60);
    const [sx, sy] = g.camera.worldToScreen(T * 16 + 8, 34 * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    swing.push({
      livePos: [g.player.x, g.player.y],
      inRange: g.inTileRange(T, 34),
      dmg: g.hitTiles.getDamage(T, 34, 2),
    });
    g.input.mouseDown = false;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;

  return { dump, swing, wallAfter: st.wall[st.idx(T, 34)] };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
