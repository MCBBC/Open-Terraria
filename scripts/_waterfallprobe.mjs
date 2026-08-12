// 瀑布贴图验证（原版 halfBrick 唇缘触发）：找生成期唇缘 → 触发 → 像素验证水柱
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

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

// 找生成期唇缘（原版条件：half + 上干/上实 + 一侧水>160 + 对侧空）
const lip = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (let y = 30; y < st.h - 30; y++) {
    for (let x = 30; x < st.w - 30; x++) {
      const i = st.idx(x, y);
      if (!st.half[i]) continue;
      const uq = st.liquid[i - st.w];
      if (!(uq < 16 || st.isSolid(x, y - 1))) continue;
      const lq = st.liquid[i - 1], rq = st.liquid[i + 1];
      const lOpen = lq === 0 && !st.isSolid(x - 1, y);
      const rOpen = rq === 0 && !st.isSolid(x + 1, y);
      if ((lq > 160 || rq > 160) && (lOpen || rOpen)) {
        // 唇缘下方要有落程（至少 8 格净空）才有可见水柱
        let drop = 0;
        while (drop < 8 && y + 1 + drop < st.h - 2 && !st.isSolid(x, y + 1 + drop)) drop++;
        if (drop >= 8) return { x, y, drop };
      }
    }
  }
  return null;
});
console.log('lip:', JSON.stringify(lip));
check('找到带落程的生成期唇缘', !!lip);
if (!lip) { console.log(`\n0 passed, 1 failed`); await browser.close(); process.exit(1); }

// 相机对准唇缘（主角在上方，跟随）
await page.evaluate((l) => {
  const g = window.__swGame;
  g.world.explored.fill(1); g.world.exploredVersion++;
  g.renderer.fullbright = true;
  g.player.x = l.x * 16 - 8;
  g.player.y = (l.y - 8) * 16;
}, lip);
await new Promise((r) => setTimeout(r, 1200)); // 等瀑布扫描（30 帧节流）
const count = await page.evaluate(() => window.__swGame.renderer.waterfalls.count);
check('瀑布唇缘触发（原版 halfBrick 条件）', count > 0, `count=${count}`);

// 像素验证：唇缘下方 6 格处应有瀑布贴图覆盖（非纯背景）
const px = await page.evaluate((l) => {
  const g = window.__swGame;
  const st = g.world.store;
  // 落柱列：唇缘格或其空侧列
  const colX = !st.isSolid(l.x, l.y + 1) ? l.x : (st.liquid[st.idx(l.x - 1, l.y)] > 0 ? l.x + 1 : l.x - 1);
  const [sx, sy] = g.camera.worldToScreen(colX * 16 + 8, (l.y + 6) * 16 + 8);
  const d = g.renderer.ctx.getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 16, 16).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++;
  return { colX, cover: +(n / (d.length / 4)).toFixed(2) };
}, lip);
check('瀑布水柱像素可见（唇缘下方有贴图覆盖）', px.cover > 0.3, JSON.stringify(px));

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(fail ? 1 : 0);
