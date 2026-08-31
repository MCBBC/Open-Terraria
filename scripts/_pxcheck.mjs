import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise(r=>setTimeout(r,1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const T = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const bx = g.world.spawnX + 4;
  const by0 = Math.max(20, Math.floor(g.world.groundLevel) - 8);
  for (const dx of [0,1]) st.setTile(bx+dx, by0, T.TILE_BY_KEY['stone']);
  const T592 = T.TILE_BY_KEY['v_592_hanging_brazier'];
  for (let dy=0; dy<3; dy++) for (let dx=0; dx<2; dx++) {
    const i2 = st.idx(bx+dx, by0+1+dy);
    st.setTile(bx+dx, by0+1+dy, T592);
    st.frameX[i2] = dx*18; st.frameY[i2] = dy*18;
  }
  g.player.x = bx*16 - 40; g.player.y = (by0+2)*16; g.player.vx=0; g.player.vy=0;
  g.player.hp = g.player.maxHp; g.player.dead=false;
  for (let i=0;i<90;i++) g.fixedUpdate(1/60);
  // 玩家传送后相机跟随 → chunk 区域必在视野
  // 读 chunk 画布像素（吊盆区域 = 玩家左侧 40px、上 0..48px）
  const cc = g.chunks;
  const CH = 16, TL = 16;
  const cx = Math.floor(bx*TL/(CH*TL)), cy = Math.floor((by0+1)*TL/(CH*TL));
  const pair = cc.get(cx, cy);
  if (!pair || !pair.tile) return { err: 'no pair', cx, cy };
  const c2 = document.createElement('canvas'); c2.width = pair.tile.width; c2.height = pair.tile.height;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true });
  ctx2.drawImage(pair.tile, 0, 0);
  // 本地：tile (bx,by0+1) 在 chunk 内 (bx%16, (by0+1)%16)*16
  const lx = (bx % CH) * TL, ly = ((by0+1) % CH) * TL;
  let opaque = 0, brownish = 0;
  const d2 = ctx2.getImageData(lx, ly, 36, 54).data;
  for (let i = 0; i < d2.length; i += 4) {
    const r = d2[i], gg = d2[i+1], b = d2[i+2], a = d2[i+3];
    if (a > 24) { opaque++; if (r > 110 && gg > 70 && gg < 160 && b < 120) brownish++; }
  }
  return { cx, cy, lx, ly, opaque, brownish, total: 36*54, tileW: pair.tile.width,
    idConst: T592, stoneId: T.TILE_BY_KEY['stone'], stoneWritten: st.get(bx, by0),
    typeHere: st.type[st.idx(bx, by0+1)], fx: st.frameX[st.idx(bx, by0+1)], fy: st.frameY[st.idx(bx, by0+1)] };
});
console.log(JSON.stringify(out));
await browser.close();
