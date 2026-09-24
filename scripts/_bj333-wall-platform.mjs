// BJ333 平台终审：真实平台站底（纯重力落稳,无 pin 无 embed）扫 A 顶部 4 行
// 判据:真实邻站下顶行可清=链 1:1 无罪;仍拒=真 bug
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
    st.liquid[i] = 0; st.liquidType[i] = 0;
  }
  // A 补丁 20×14 @ rows 34-47 + 平台 tile @ row 38（玩家站 row 37 底,瞄 rows 34-37）
  const A = { x0: cx - 24, y0: 34, x1: cx - 5, y1: 47 };
  for (let y = A.y0; y <= A.y1; y++) for (let x = A.x0; x <= A.x1; x++) st.setWall(x, y, 200);
  const PLAT = 38;
  for (let x = A.x0 - 2; x <= A.x1; x++) st.setTile(x, PLAT, 2);

  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  const wallAt = (x, y) => (x >= 0 && y >= 0 && x < st.w && y < st.h) ? st.wall[st.idx(x, y)] : 0;

  // 真实落稳:放到平台上空 2 格,纯重力落 60 tick（无 pin）
  const dropAndSettle = (sx) => {
    g.player.x = sx * 16; g.player.y = (PLAT - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
  };

  const results = [];
  for (const ry of [37, 36, 35, 34]) {           // 从平台上方一行开始逐行向上瞄
    dropAndSettle(A.x0 + 3);
    const restRow = +(g.player.y / 16).toFixed(2);
    for (let i = 0; i < 14; i++) {
      g.fixedUpdate(1 / 60);
      const [sx, sy] = g.camera.worldToScreen(A.x0 + 3 + (ry === 37 ? 2 : ry - 37), ry * 16 + 8);
      // 站位不动,瞄 (T+dx, ry):dx=2 时站 (T,37) 瞄 (T+2,ry)——水平 2 ≤ reach5
      g.input.mouseX = sx; g.input.mouseY = sy;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    // 该行 20 格:逐格移动玩家(重落稳)扫全行
    let cleared = 0;
    for (let x = A.x0; x <= A.x1; x++) {
      dropAndSettle(x - 2 < A.x0 - 2 ? A.x0 - 1 : x - 2);
      for (let i = 0; i < 14; i++) {
        g.fixedUpdate(1 / 60);
        const [sx, sy] = g.camera.worldToScreen(x * 16 + 8, ry * 16 + 8);
        g.input.mouseX = sx; g.input.mouseY = sy;
        g.input.mouseDown = true; g.input.mouseHeld = true;
        g.fixedUpdate(1 / 60);
        g.input.mouseDown = false;
      }
      g.input.mouseDown = false; g.input.mouseHeld = false;
      if (wallAt(x, ry) === 0) cleared++;
    }
    results.push({ row: ry, restRow, cleared, of: 20 });
  }

  return {
    finalWallsRows34to37: [34, 35, 36, 37].map((ry) => [ry, [...Array(20)].filter((_, k) => wallAt(A.x0 + k, ry) !== 0).length]),
    results,
    playerDead: g.player.dead,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
