// 平台穿透逐帧追踪:每帧记 y/vy/onGround/脚下两格判定
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }  });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 100)));
await page.goto('http://localhost:5206/?play=small', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame, st = g.world.store, p = g.player;
  const TILE = 16;
  let gy = Math.floor(p.cy / TILE);
  while (gy < st.h - 2 && !st.flags[st.idx(Math.floor(p.cx / TILE), gy)]) gy++;
  const px = Math.floor(p.cx / TILE);
  const py = gy - 6;
  const platId = TILE_BY_KEY['platform'];
  for (let x = px - 2; x <= px + 2; x++) {
    st.flags[st.idx(x, py)] = 0;
    st.setTileSilent(x, py, platId, 0, 0);
  }
  // 清掉平台与放置点之间可能存在的方块(267 与起点之间)
  for (let x = px - 2; x <= px + 2; x++) for (let y = py - 5; y < py; y++) st.flags[st.idx(x, y)] = 0;
  p.x = px * TILE + 8 - p.w / 2; p.y = (py - 3) * TILE;   // 玩家高 42px:放平台上 3 格防嵌格
  p.vx = 0; p.vy = 0;
  const log = [];
  for (let k = 0; k < 90; k++) {
    g.fixedUpdate(1 / 60);
    const feetRow = Math.floor((p.y + p.h) / TILE);
    const cols = [px - 1, px, px + 1].map((c) => ({
      c, type: st.type[st.idx(c, py)], isPlat: st.isPlatform(c, py),
    }));
    log.push({
      k, y: +p.y.toFixed(1), feet: +(p.y + p.h).toFixed(1), vy: +p.vy.toFixed(2),
      onGround: p.onGround, dropThrough: p.dropThrough, feetRow,
      platRowOk: cols.every((o) => o.isPlat),
    });
    if (p.onGround && Math.abs(p.vy) < 0.01 && k > 3) break;
  }
  return { py, pw: p.w, ph: p.h, finalY: Math.round(p.y / TILE), log: log.slice(0, 40) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
