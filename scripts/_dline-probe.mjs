// 双水线实证探针(2026-08-19,用户实报"两条水面线正好差 1 格"):
// 造一个静态水池(平地凹槽灌满),截图逐行扫"亮线"(高亮度水平行),数线与间距。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_dline-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dline-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const setup = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.4;
  const dirt = window.__swTileByKey('dirt');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 12;
  // 平台 + 中间挖 12 宽 6 深凹槽,槽内灌满水(封底封两壁防漏)
  for (let x = sx - 2; x < sx + 18; x++) {
    for (let dy = -6; dy <= 0; dy++) st.setTile(x, sy + dy, 0, 0);
    st.setWall(x, sy, 0);
    st.setTile(x, sy + 1, dirt, 0);  // 底
  }
  for (let y = sy - 5; y <= sy; y++) { st.setTile(sx - 2, y, dirt, 0); st.setTile(sx + 17, y, dirt, 0); }
  for (let x = sx - 1; x < sx + 17; x++) for (let y = sy - 5; y <= sy; y++) st.setLiquid(x, y, 255, 1);
  g.player.x = (sx + 8) * 16; g.player.y = (sy - 10) * 16;
  window.__sx = sx; window.__sy = sy;
  return { ok: true, sy };
});
console.log('场景:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 6000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sx = window.__sx, sy = window.__sy;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 扫水池中央 60px 宽竖带(世界 x = (sx+3)*16 .. +60):每行平均亮度
  const [ax0] = w2s((sx + 3) * 16, 0);
  const [, ay0] = w2s(0, (sy - 6) * 16);
  const W = Math.round(60 * z), H = Math.round(8 * 16 * z);
  const d = ctx.getImageData(Math.round(ax0), Math.round(ay0), W, H).data;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let lum = 0, n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A > 200) { lum += (R + G + B) / 3; n++; }
    }
    if (n > W * 0.7) rows.push({ y, lum: Math.round(lum / n) });
  }
  // 亮线 = 局部亮度峰(比上下行都高 ≥25)
  const lines = [];
  for (let k = 1; k < rows.length - 1; k++) {
    const a = rows[k - 1].lum, b = rows[k].lum, c2 = rows[k + 1].lum;
    if (b >= a + 25 && b >= c2 + 25 && b > 140) lines.push({ screenY: rows[k].y, lum: b });
  }
  // 相邻合并(2px 线的次行)
  const merged = [];
  for (const l of lines) {
    const last = merged[merged.length - 1];
    if (last && l.screenY - last.screenY <= 2) last.lum = Math.max(last.lum, l.lum);
    else merged.push({ ...l });
  }
  const zpx = 16 * z;  // 1 tile 的屏幕像素
  const gaps = [];
  for (let k = 1; k < merged.length; k++) gaps.push(+( (merged[k].screenY - merged[k-1].screenY) / zpx ).toFixed(2));
  const profile = rows.filter((r) => r.y % 2 === 0).map((r) => r.lum);
  return { H, lines: merged, gapsInTiles: gaps, z, rowCount: rows.length, profile };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[亮线扫描]', JSON.stringify(out));
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync('/Users/vinlic/.claude/jobs/8405c930/tmp/dline.png', shot);
await browser.close();
