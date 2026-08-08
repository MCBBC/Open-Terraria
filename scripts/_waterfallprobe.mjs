// 瀑布贴图验证：制造一个"悬崖边水池倾泻"场景，检查 WaterfallRenderer 触发与绘制
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 造场景：空中平台 + 平台上一池水，紧贴悬崖（右侧深井），水会从边缘倾泻
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16);
  let gy = 0;
  while (gy < st.h - 50 && !st.isSolid(cx, gy)) gy++;
  const px = cx + 30, py = gy + 15; // 平台左端
  // 清出大空域
  for (let dy = -5; dy <= 60; dy++) for (let dx = -5; dx <= 15; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
    st.liquidType[st.idx(px + dx, py + dy)] = 0;
  }
  // 平台：x ∈ [px, px+6]，顶在 py；右侧 px+7 起是悬崖（空）
  for (let dx = 0; dx <= 6; dx++) st.setTile(px + dx, py, 2);
  // 池：平台上 8 格深的水（x ∈ [px, px+6]，大水量保证持续倾泻）
  for (let dy = -4; dy <= 3; dy++) for (let dx = 0; dx <= 6; dx++) {
    st.liquid[st.idx(px + dx, py - dy)] = 255;
    st.liquidType[st.idx(px + dx, py - dy)] = 1;
  }
  // 井底：py+50 处放地板接水
  for (let dx = 0; dx <= 14; dx++) st.setTile(px + dx, py + 50, 2);
  g.liquid.waterCheck();
  // 相机对准悬崖边
  g.player.x = (px + 8) * 16;
  g.player.y = (py - 10) * 16;
  return { px, py };
});
console.log('scene:', JSON.stringify(scene));

// 持续采样 count（扫描 30 帧一扫，取最大值）
let wf = { count: 0, active: 0 };
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const s2 = await page.evaluate(() => ({
    count: window.__swGame.renderer.waterfalls.count,
    active: window.__swGame.liquid.numLiquid,
  }));
  console.log('  sample', i, JSON.stringify(s2));
  wf = { count: Math.max(wf.count, s2.count), active: s2.active };
}
check('瀑布触发（倾泻点被识别）', wf.count > 0, JSON.stringify(wf));

// 像素验证：悬崖下方 10 格处应有瀑布贴图像素（非纯背景）
// 重新注水，趁倾泻进行中做像素检查
await page.evaluate((s) => {
  const g = window.__swGame;
  const st = g.world.store;
  // 清掉底部积水，重注平台上方 8 格深
  for (let dy = -5; dy <= 55; dy++) for (let dx = -5; dx <= 15; dx++) {
    st.liquid[st.idx(s.px + dx, s.py + dy)] = 0;
    st.liquidType[st.idx(s.px + dx, s.py + dy)] = 0;
  }
  for (let dy = 1; dy <= 8; dy++) for (let dx = 0; dx <= 6; dx++) {
    st.liquid[st.idx(s.px + dx, s.py - dy)] = 255;
    st.liquidType[st.idx(s.px + dx, s.py - dy)] = 1;
  }
  g.liquid.waterCheck();
  g.camera.x = (s.px + 8) * 16;
  g.camera.y = (s.py + 10) * 16;
  g.camera.zoom = 1.0; g.camera.zoomTarget = 1.0;
  g.renderer.fullbright = true;
}, scene);
await new Promise((r) => setTimeout(r, 900));
const mid = await page.evaluate(() => window.__swGame.renderer.waterfalls.count);
console.log('mid-pour count:', mid);
const px = await page.evaluate((s) => {
  const g = window.__swGame;
  const st = g.world.store;
  // 倾泻列：悬崖右侧有液体的列
  let colX = -1;
  for (let dx = 7; dx <= 13; dx++) {
    for (let dy = -2; dy < 45; dy++) {
      if (st.liquid[st.idx(s.px + dx, s.py + dy)] > 0) { colX = s.px + dx; break; }
    }
    if (colX >= 0) break;
  }
  if (colX < 0) return { colX };
  // 采样倾泻列中段（py+15）：瀑布贴图覆盖处应有半透明亮色像素
  const [sx, sy] = g.camera.worldToScreen(colX * 16 + 8, (s.py + 15) * 16 + 8);
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 16, 16).data;
  let bright = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 30) { bright += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
  }
  return { colX, cover: +(n / (d.length / 4)).toFixed(2), bright: n ? (bright / n) | 0 : 0 };
}, scene);
check('瀑布贴图像素可见（倾泻中段有亮色覆盖）', px.colX >= 0 && px.cover > 0.3, JSON.stringify(px));

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(fail ? 1 : 0);
