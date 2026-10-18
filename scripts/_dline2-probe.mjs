// 双水线现场复现(2026-08-19):用用户存档同种子(12345)重建世界,传送至报告现场
// (湖面 y241,丛林水 waterStyle=3,荷叶/香蒲水面),截图+亮线扫描+间距。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=400000 scripts/_dline2-probe.mjs
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/dline2-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(420000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
console.log('生成种子 12345 世界(与用户存档同源)…');
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 360000 });
console.log('世界就绪,传送至湖面现场 (385, 232)…');
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 385 * 16; g.player.y = 232 * 16;
  window.__lx = 342; window.__ly = 241;
});
await new Promise((r) => setTimeout(r, 12000));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const r = g.renderer;
  const cam = g.camera, cv = r.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 现场验证:湖面几何 + waterStyle
  let l241 = 0, plants = 0;
  for (let x = 342; x <= 425; x++) {
    const i = st.idx(x, 241);
    if (st.liquid[i] > 0) l241++;
    if (st.type[i] && st.flags[i]) plants++;
  }
  // 亮线扫描:湖面上下 6 tile 竖带(世界 x 390..395)
  const [ax0] = w2s(390 * 16, 0);
  const [, ay0] = w2s(0, (241 - 3) * 16);
  const W = Math.round(80 * z), H = Math.round(6 * 16 * z);
  const d = ctx.getImageData(Math.round(ax0), Math.round(ay0), W, H).data;
  const rows = [];
  for (let y = 0; y < H; y++) {
    let lum = 0, n = 0;
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A > 200) { lum += (R + G + B) / 3; n++; }
    }
    if (n > (W / 2) * 0.7) rows.push({ y, lum: Math.round(lum / n) });
  }
  // 亮线峰(比邻行亮 ≥18,绝对 >110)
  const lines = [];
  for (let k = 1; k < rows.length - 1; k++) {
    const a = rows[k - 1].lum, b = rows[k].lum, c2 = rows[k + 1].lum;
    if (b >= a + 18 && b >= c2 + 18 && b > 110) lines.push({ screenY: rows[k].y, lum: b });
  }
  const merged = [];
  for (const l of lines) {
    const last = merged[merged.length - 1];
    if (last && l.screenY - last.screenY <= 2) last.lum = Math.max(last.lum, l.lum);
    else merged.push({ ...l });
  }
  const zpx = 16 * z;
  const gaps = [];
  for (let k = 1; k < merged.length; k++) gaps.push(+((merged[k].screenY - merged[k - 1].screenY) / zpx).toFixed(2));
  const profile = rows.filter((rr) => rr.y % 2 === 0).map((rr) => rr.lum);
  return { 湖面241液体格: l241, 植物格: plants, waterStyle: r.waterStyle, zoom: z,
    lines: merged, gapsInTiles: gaps, rowCount: rows.length,
    profile: profile.slice(0, 40) };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[现场]', JSON.stringify(out).slice(0, 1200));
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync(join(HOME, '.claude/jobs/8405c930/tmp/dline2.png'), shot);
await browser.close();
