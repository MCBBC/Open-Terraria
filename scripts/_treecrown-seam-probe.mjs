// 树冠-树干接缝实证探针：强风下逐相位采样冠底/干顶交界像素，
// 检测干宽带内是否出现背景漏缝（用户报"摆动偶尔露缝"）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('树缝');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [], samples: [] };
  const ok = (name, cond, extra) => { out.steps.push({ name, cond: !!cond, extra }); return !!cond; };
  try {
    const st = g.world.store;
    const T = 16;
    // 找一棵普通树（type 5 顶冠标记 fx=22 fy=198）：从出生点向右扫 300 格
    const TREE = 5;
    let found = null;
    const ptx = Math.floor(g.player.cx / T);
    outer:
    for (let dx = -40; dx < 300; dx++) {
      const x = ptx + dx;
      if (x < 5 || x >= st.w - 5) continue;
      for (let y = 4; y < Math.floor(g.world.groundLevel) + 30; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === TREE && st.frameX[i] === 22 && st.frameY[i] === 198) {
          // 干顶=标记格正下方
          found = { x, y };
          break outer;
        }
      }
    }
    ok('找到普通树顶冠标记', !!found, JSON.stringify(found));
    if (!found) return out;
    const { x, y } = found;
    // 相机对准接缝：标记格底 = y*16+16；放大
    g.camera.x = x * T + 8; g.camera.y = y * T + 24;
    g.camera.zoom = 4;
    g.player.x = x * T; g.player.y = (y + 6) * T;   // 玩家挪开避免画进采样区
    // 强风：WindForVisuals 拉满（weather.windSpeedCurrent→windSway.wind 采样源）
    g.world.weather.windSpeedCurrent = 1;
    g.world.weather.windSpeedTarget = 1;
    const canvas = g.renderer.canvas;
    const ctx = canvas.getContext('2d');
    const z = 4;
    // 逐相位扫一个完整风摆周期：在标记格边界线附近 [y*16-4, y*16+8] 范围，
    // 干带宽 [x*16+2, x*16+14]（干 20px 中对齐格中心 ±8 内），逐行找"全透明行"
    // （干正上方本应有冠或干像素；若出现整行 alpha=0 → 漏缝）
    const seamRows = [];
    for (let f = 0; f < 120; f++) {
      for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const [sx0] = g.camera.worldToScreen(x * T + 2, 0);
      const rows = [];
      for (let py = y * T - 6; py <= y * T + 10; py++) {
        const [, sy] = g.camera.worldToScreen(0, py);
        const img = ctx.getImageData(Math.round(sx0), Math.round(sy), Math.round(12 * z), 2).data;
        let opaque = 0, total = 0;
        for (let j = 3; j < img.length; j += 4) { total++; if (img[j] > 60) opaque++; }
        rows.push({ py: py - y * T, opaqueRatio: +(opaque / total).toFixed(2) });
      }
      // 找干顶边界(=0 行)附近：0 行上方 1-3 行内出现 opaqueRatio=0 的行 = 漏缝
      const row0 = rows.find((r) => r.py === 0);
      const gapRow = rows.find((r) => r.py >= -3 && r.py <= 3 && r.opaqueRatio === 0);
      if (gapRow) seamRows.push({ frame: f, row: gapRow.py, rows });
      out.samples.push(rows.map((r) => `${r.py}:${r.opaqueRatio}`).join(' '));
    }
    ok('强风全周期：干顶中带 [-3,+3] 行无全透明漏缝行', seamRows.length === 0,
      seamRows.length ? `漏缝帧数=${seamRows.length} 首例=${JSON.stringify(seamRows[0].row)}` : '120 帧全过');
    // 落一帧截图供人工核
    out.shot = true;
  } catch (err) { out.steps.push({ name: 'ERR ' + String(err && err.stack || err).slice(0, 300), cond: false }); }
  return out;
});

for (const s of res.steps) check(s.name, s.cond, s.extra ?? '');
check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
console.log('SAMPLE(首帧行:透明比):', res.samples?.[0]);
console.log('SAMPLE(中帧):', res.samples?.[60]);
await page.screenshot({ path: '/tmp/sw-treeseam.png' });
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
