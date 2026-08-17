// 平台站立诊断:现场放木平台→读 frameY→站上去→报 onGround
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }  });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 100)));
await page.goto('http://localhost:5206/?play=small', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame, st = g.world.store, p = g.player;
  const TILE = 16;
  // 找玩家脚下地面
  let gy = Math.floor(p.cy / TILE);
  while (gy < st.h - 2 && !st.flags[st.idx(Math.floor(p.cx / TILE), gy)]) gy++;
  const px = Math.floor(p.cx / TILE);
  // 玩家上方 6 格清空,放一排 5 宽木平台(sheet 19)
  const py = gy - 6;
  let platId = TILE_BY_KEY['platform'];
  if (platId == null) {
    // 兜底:sheet 19 扫描
    platId = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 19 && d.platform);
  }
  if (platId == null || platId < 0) return { ok: false, why: 'no platform tile def found' };
  for (let x = px - 2; x <= px + 2; x++) {
    // 先清掉上面两格防撞
    st.flags[st.idx(x, py)] = 0;
    st.setTileSilent(x, py, platId, 0, 0);
  }
  const i0 = st.idx(px, py);
  const info = {
    platKey: TILE_DEFS[platId]?.key, platId,
    type: st.type[i0], flags: st.flags[i0], frameY: st.frameY[i0],
    wire: st.wire[i0], isPlatform: st.isPlatform(px, py),
  };
  // 把玩家放上平台上方
  p.cx = px * TILE + 8; p.cy = (py - 2) * TILE; p.x = p.cx - p.w / 2; p.y = p.cy - p.h / 2;
  p.vx = 0; p.vy = 0;
  // 跑 120 帧
  for (let k = 0; k < 120; k++) g.fixedUpdate(1 / 60);
  return { ok: true, info, py, playerY: Math.round(p.cy / TILE), onGround: p.onGround, vy: +p.vy.toFixed(2), dropThrough: p.dropThrough };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
