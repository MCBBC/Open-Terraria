// 浸润像素级验证:满水(255)邻接方块 → 方块格左上角透明区应显示液体色
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 420000 });
await new Promise((r) => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 封闭单格水(三面实心,不会流失)→ 保证液位恒 255
  for (let x = px - 4; x <= px + 4; x++) for (let y = py - 5; y <= py; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setWall(x, y, 0); }
  for (let x = px - 4; x <= px + 4; x++) st.setTile(x, py, 1); // 地板
  const wallX = px;
  for (let y = py - 4; y <= py - 1; y++) st.setTile(wallX, y, 1); // 左墙
  st.setTile(wallX + 2, py - 1, 1); // 右墙(封住水不让流走)
  st.setLiquid(wallX + 1, py - 1, 255, 1); // 封闭水格=恒 255
  await new Promise((r) => setTimeout(r, 800));
  g.renderer.fullbright = true; // F9:关光照,验证条带本色
  await new Promise((r) => setTimeout(r, 200));
  const ty = py - 1; // 贴水面的石墙格
  const rightLiq = st.liquid[st.idx(wallX + 1, ty)];
  // 主画布左上角采样(tileCanvas 透明圆角处 → 应显示浸润液体色)
  const canvas = g.renderer.canvas;
  const cam = g.camera, z = cam.zoom || 1;
  const mx = Math.floor((wallX * 16 - (cam.x - canvas.width / 2 / z)) * z + canvas.width / 2);
  const my = Math.floor((ty * 16 - (cam.y - canvas.height / 2 / z)) * z + canvas.height / 2);
  const mCtx = canvas.getContext('2d');
  // 采样左上角 4×4 区域 + 右上角 4×4(右上角不贴水,无浸润,对照)
  const corner = mCtx.getImageData(mx, my, Math.floor(4 * z), Math.floor(4 * z)).data;
  const cornerR = mCtx.getImageData(mx + Math.floor(12 * z), my, Math.floor(4 * z), Math.floor(4 * z)).data;
  // 计算左上角平均 RGB(排除 alpha=0 的完全透明)
  let lr = 0, lg = 0, lb = 0, ln = 0;
  for (let i = 0; i < corner.length; i += 4) {
    if (corner[i + 3] > 40) { lr += corner[i]; lg += corner[i + 1]; lb += corner[i + 2]; ln++; }
  }
  let rr = 0, rg = 0, rb = 0, rn = 0;
  for (let i = 0; i < cornerR.length; i += 4) {
    if (cornerR[i + 3] > 40) { rr += cornerR[i]; rg += cornerR[i + 1]; rb += cornerR[i + 2]; rn++; }
  }
  // 调试:检查 Liquid_0 是否已加载
  const atlas = g.renderer.atlas;
  const hasLiq0 = atlas ? atlas.vimages.has('vanilla/Liquid_0.png') : false;
  const liq0Img = atlas ? atlas.ensureVImage('vanilla/Liquid_0.png') : null;
  const liq0Ok = liq0Img ? (liq0Img.complete && liq0Img.naturalWidth > 0) : false;
  return {
    hasLiq0,
    rightLiq,
    leftCorner: ln > 0 ? `rgb(${Math.round(lr / ln)},${Math.round(lg / ln)},${Math.round(lb / ln)}) alpha=${ln}` : 'all transparent',
    rightCorner: rn > 0 ? `rgb(${Math.round(rr / rn)},${Math.round(rg / rn)},${Math.round(rb / rn)}) alpha=${rn}` : 'all transparent',
  };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
