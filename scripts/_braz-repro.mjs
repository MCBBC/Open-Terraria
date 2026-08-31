// 吊挂火盆(tile 592)本体缺失复现：真实放置管线 tryPlace → 渲染烘焙截图取证
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r=>setTimeout(r,1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise(r=>setTimeout(r,1500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  // itemDef 用最小代理（place_v 稳定键命名法，tryPlace 只消费 .tile/.key）
  const itemDef = { key: 'place_v_592_hanging_brazier', tile: 'v_592_hanging_brazier', name: '(proxy)' };
  out.itemFound = true; out.itemKey = itemDef.key;
  // 场景：复现用户世界数据——直接写 mark 快照 (fx 0/18, fy 18/36/54 组)
  const T = await import('/src/data/tiles.ts');
  const st = g.world.store;
  // 场景：出生点旁 6 格高空，吊盆紧贴玩家（chunk 恒载入、相机正中）
  const bx = g.world.spawnX + 4;
  const by0 = Math.max(20, Math.floor(g.world.groundLevel) - 8);   // 高空
  for (const dx of [0,1]) st.setTile(bx+dx, by0, T.TILE_BY_KEY['stone']);   // 天花板
  const T592 = T.TILE_BY_KEY['v_592_hanging_brazier'];
  for (let dy=0; dy<3; dy++) for (let dx=0; dx<2; dx++) {
    const i2 = st.idx(bx+dx, by0+1+dy);
    st.setTile(bx+dx, by0+1+dy, T592);
    st.frameX[i2] = dx*18; st.frameY[i2] = dy*18;
  }
  g.player.x = bx*16 - 40; g.player.y = (by0+2)*16; g.player.vx=0; g.player.vy=0;
  g.player.hp = g.player.maxHp; g.player.dead=false;
  for (let i=0;i<60;i++) g.fixedUpdate(1/60);    // 烘焙
  window.__probeBrazierX = bx; window.__probeBrazierY = by0+1; window.__stRef = st;
  window.__probeBrazierX = bx; window.__probeBrazierY = by0 + 1; window.__stRef = st;
  return out;
});
console.log(JSON.stringify(res));
// 相机以玩家为中心 → 玩家世界位在屏幕中心；吊盆在玩家右上约 (80, -70)px(粗)
await page.waitForFunction(() => window.__swGame?.player && !window.__swGame.paused, { timeout: 60000 });
await new Promise(r=>setTimeout(r,1200));
// 欢迎面板先关（内联监听吞 click 前哨）
try { await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('我已知晓')); b?.click(); }); } catch {}
await new Promise(r=>setTimeout(r,600));
// 直接读烘焙 chunk 画布像素取证（不依赖视口截图）
const pix = await page.evaluate(() => {
  const g = window.__swGame;
  const bx = g.__probeBrazierX, by = g.__probeBrazierY;
  const st = window.__stRef;
  const cc = g.chunks;
  const CH = 16; const TL = 16;
  const cx = Math.floor(bx*TL/(CH*TL)), cy = Math.floor(by*TL/(CH*TL));
  const pair = cc.get(cx, cy);
  if (!pair || !pair.canvas) { console.log('[px]', JSON.stringify({ err: 'no chunk pair', probe: window.__probeBrazierX, hasRef: !!window.__stRef, chunkMapSize: cc.chunks ? cc.chunks.size : -1 })); return { err: 1 }; }
  const c2 = document.createElement('canvas'); c2.width = pair.canvas.width; c2.height = pair.canvas.height;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true });
  ctx2.drawImage(pair.canvas, 0, 0);
  // 本地像素：tile 内 (bx%CH)*TL, (by%CH)*TL 区域 18px
  const lx = (bx % CH) * TL, ly = (by % CH) * TL;
  let opaque = 0, brownish = 0, fireOrange = 0;
  const d2 = ctx2.getImageData(lx - 4, ly - 4, 26, 26).data;
  for (let i = 0; i < d2.length; i += 4) {
    const r = d2[i], gg = d2[i+1], b = d2[i+2], a = d2[i+3];
    if (a > 24) { opaque++; if (r > 100 && gg > 60 && gg < 150 && b < 110) brownish++; }
    if (r > 180 && gg < 160 && b < 120 && a > 60) fireOrange++;
  }
  window.__pxResult = JSON.stringify({ opaque, brownish, fireOrange,
    fx: st.frameX[st.idx(bx, by+1)], fy: st.frameY[st.idx(bx, by+1)],
    imgW: img2.naturalWidth, imgH: img2.naturalHeight, done: true });
  return { chunkW: pair.canvas.width };
});
function vanillaOf(){return 0}
const pxr = await page.evaluate(() => window.__pxResult ?? '(未执行)');
console.log('[px]', pxr);
await browser.close();
console.log('done');
