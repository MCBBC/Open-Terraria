// 岩浆底部渲染回归：池底位于视口底缘（P3 未构建带）时也必须是橙色，不是水蓝
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 造一个岩浆池：密封石腔，底部 3 行岩浆 255
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cx = Math.floor(g.player.cx / 16);
  let gy = 0;
  while (gy < st.h - 10 && !st.isSolid(cx, gy)) gy++;
  const x0 = cx + 50, y0 = gy + 60;
  for (let dy = -1; dy <= 6; dy++) for (let dx = -1; dx <= 10; dx++) {
    st.setTile(x0 + dx, y0 + dy, 2);
    st.liquid[st.idx(x0 + dx, y0 + dy)] = 0;
    st.liquidType[st.idx(x0 + dx, y0 + dy)] = 0;
  }
  for (let dy = 0; dy <= 5; dy++) for (let dx = 0; dx <= 9; dx++) st.setTile(x0 + dx, y0 + dy, 0);
  for (let dy = 3; dy <= 5; dy++) for (let dx = 0; dx <= 9; dx++) {
    st.liquid[st.idx(x0 + dx, y0 + dy)] = 255;
    st.liquidType[st.idx(x0 + dx, y0 + dy)] = 2;
  }
  g.world.explored.fill(1); g.world.exploredVersion++;
  g.renderer.fullbright = true;
  g.camera.zoom = 1.0; g.camera.zoomTarget = 1.0;
  return { x0, y0 };
});

// 池底行 = y0+5。zoom 1.0 下视口半高 25 格。
// 场景 A：主角在池底上方 20 格 → 池底位于屏幕中心下方 5 格
// 场景 B：主角下移到池底上方 10 格 → 池底在中心上方 5 格
// 场景 C：主角在池底上方 23 格 → 池底贴屏幕底边（修复前 P3 未构建带内，原症状病灶位）
for (const [up, label] of [[20, '池底在视口下半(A)'], [10, '池底在视口中部(B)'], [23, '池底贴屏幕底边(C-病灶位)']]) {
  await page.evaluate((s, u) => {
    const g = window.__swGame;
    g.player.x = (s.x0 + 5) * 16;
    g.player.y = (s.y0 + 5 - u) * 16;
  }, scene, up);
  await new Promise((r) => setTimeout(r, 600));
  const c = await page.evaluate((s) => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen((s.x0 + 5) * 16 + 8, (s.y0 + 5) * 16 + 8); // 池底中心
    const d = g.renderer.ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, scene);
  const orange = c[0] > c[2] + 40;
  check(`${label}: 池底渲染色为岩浆橙`, orange, `rgb=${c}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
