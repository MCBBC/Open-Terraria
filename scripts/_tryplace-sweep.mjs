// tryPlace 直驱扫描:光标持物镜像下,直接调 tryPlace 看哪些格失败(排除鼠标/DOM 变量)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(1000);
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  document.getElementById('sw-welcome-announce')?.remove();
  let spot = null;
  outer:
  for (let x = 200; x < 500; x++) for (let y = 150; y < 400; y++) {
    let air = true;
    for (let dy = -1; dy <= 1 && air; dy++) for (let dx = -1; dx <= 1; dx++) if (st.isActive(x + dx, y + dy)) { air = false; break; }
    if (!air) continue;
    let floor = true;
    for (let dx = -1; dx <= 1; dx++) if (!st.isSolid(x + dx, y + 2)) { floor = false; break; }
    if (floor) { spot = [x, y]; break outer; }
  }
  if (!spot) return { fail: 'no flat spot' };
  const [px, py] = spot;
  g.player.x = px * 16; g.player.y = (py + 2) * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 500));
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const woodId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]];
  const inv = g.player.inv;
  inv.cursorMirror = { id: woodId, stack: 500, favorited: false, prefix: 0 };   // 直接激活镜像(同 syncCursorMirror 产物)
  // 玩家脚下地面上一排 9 格逐一 tryPlace
  const results = [];
  for (let dx = -4; dx <= 4; dx++) {
    const tx = px + dx, ty = py + 1;   // 地面(py+2)上一格
    const before = st.isActive(tx, ty);
    const info = {
      tx, ty, active: before,
      support: st.isActive(tx, ty + 1) && st.isSolid(tx, ty + 1),
      ghostType: st.get(tx, ty),
      wall: st.wallType ? st.wallType(tx, ty) : undefined,
      liquid: st.liquid ? st.liquid[st.idx(tx, ty)] : undefined,
    };
    if (!before) {
      g.player.useTime = 0; g.swing = null;
      g.tryPlace(tx, ty, ITEM_DEFS[woodId]);
      info.placedAfter = st.isActive(tx, ty);
      info.mirrorStackAfter = inv.cursorMirror?.stack ?? null;
      if (info.placedAfter) st.setTile(tx, ty, 0, 0, 0);
    }
    results.push(info);
  }
  return { spot: [px, py], results, pcx: g.player.cx, pcy: g.player.cy };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
