// 浸润效果验证：双 pass 水体（背景不透明 pass 画在方块层前）
// 场景：水盆中放平台（贴图下半透明）与火把，平台透明区域应显示水色而非墙色
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

// 造水盆：石壁围 6×5 内腔，注满水；中间放平台（T=11）与火把（T=12）半淹没
// T 常量：PLATFORM=11 TORCH=12（src/data/tiles.ts 顺序注册）
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16);
  let gy = 0;
  while (gy < st.h - 50 && !st.isSolid(cx, gy)) gy++;
  const x0 = cx + 40, y0 = gy + 25;
  for (let dy = -1; dy <= 6; dy++) for (let dx = -1; dx <= 8; dx++) {
    st.setTile(x0 + dx, y0 + dy, 2); // 石壁
    st.liquid[st.idx(x0 + dx, y0 + dy)] = 0;
    st.liquidType[st.idx(x0 + dx, y0 + dy)] = 0;
  }
  for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx <= 6; dx++) {
    st.setTile(x0 + dx, y0 + dy, 0);
    st.liquid[st.idx(x0 + dx, y0 + dy)] = 255;
    st.liquidType[st.idx(x0 + dx, y0 + dy)] = 1;
  }
  // 平台放在水中（第 2 行），火把贴在墙上（第 1 行）
  st.setTile(x0 + 2, y0 + 2, 11);
  st.setTile(x0 + 4, y0 + 1, 12);
  g.liquid.waterCheck();
  // 相机对准水盆中心
  g.player.x = (x0 + 3) * 16;
  g.player.y = (y0 - 12) * 16;
  g.camera.zoom = 1.0; g.camera.zoomTarget = 1.0;
  g.renderer.fullbright = true;
  return { x0, y0 };
});
await new Promise((r) => setTimeout(r, 1500));

// 采样：平台格下半部（平台贴图下半透明，应显示水）
const s = await page.evaluate((sc) => {
  const g = window.__swGame;
  const sample = (tx, ty, ox, oy) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + ox, ty * 16 + oy);
    const d = g.renderer.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  return {
    // 平台格：上半（木板贴图）与下半（透明区）
    platTop: sample(sc.x0 + 2, sc.y0 + 2, 8, 3),
    platBottom: sample(sc.x0 + 2, sc.y0 + 2, 8, 13),
    // 火把格（墙前、水中）
    torchCell: sample(sc.x0 + 4, sc.y0 + 1, 2, 13),
    // 纯水格中段（不透明水体参照）
    openWater: sample(sc.x0 + 1, sc.y0 + 3, 8, 8),
    // 水面格（表层）
    surface: sample(sc.x0 + 1, sc.y0 + 0, 8, 8),
  };
}, scene);
console.log('samples:', JSON.stringify(s, (k, v) => Array.isArray(v) ? v.join(',') : v));

// 判定：平台下半透明区应为水色（蓝 > 红，且接近纯水参照色）
const waterish = (px) => px[2] > px[0] + 20 && px[2] > 60;
check('平台透明区域显示水色（浸润）', waterish(s.platBottom), `platBottom=${s.platBottom} openWater=${s.openWater}`);
check('平台本体贴图仍可见（上半非水色）', !waterish(s.platTop), `platTop=${s.platTop}`);
check('水面可见（表层有水色）', s.surface[2] + s.surface[1] > s.surface[0], `surface=${s.surface}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(fail ? 1 : 0);
