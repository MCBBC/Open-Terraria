// 浸润带新三门终验(2026-08-19):挡水族(玻璃54 平面不透带)/格栅546透带/
// 土块对照。场景=地上悬空平台+日光(探针四坑规约:相机实时投影/强制白天)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_watergates-probe.mjs
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/watergates-profile'),
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
  const glass = window.__swTileByKey('v_328_confetti_block');  // 不透明挡水族(玻璃透明会透水体干扰判据)
  const grate = window.__swTileByKey('v_546_grate');
  const dirt = window.__swTileByKey('dirt');
  if (!(glass > 0 && grate > 0 && dirt > 0)) return { err: 'id 缺失', glass, grate, dirt };
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 14;
  // 清出 20×6 空域 + 铺三组方块行
  for (let x = sx; x < sx + 20; x++) {
    // ★只清到本行(保留下方 sy+1 实地形)——清穿则水从平台下漏光(上一版 0% 根因)
    for (let dy = -4; dy <= 0; dy++) st.setTile(x, sy + dy, 0, 0);
    st.setWall(x, sy, 0); st.setWall(x, sy - 1, 0);
    st.setLiquid(x, sy, 0, 1); st.setLiquid(x, sy - 1, 0, 1);
  }
  // A 玻璃×3(左侧灌水=侧向浸润被挡) | B 格栅×3(自身格灌水 200) | C 土×3(左侧灌水=对照)
  for (let k = 0; k < 3; k++) st.setTile(sx + k, sy, glass, 0);
  for (let k = 4; k < 7; k++) st.setTile(sx + k, sy, grate, 0);
  for (let k = 8; k < 11; k++) st.setTile(sx + k, sy, dirt, 0);
  st.setLiquid(sx + 3, sy, 250, 1);   // 玻璃组右侧邻水(也顺带格栅组左侧)
  for (let k = 4; k < 7; k++) st.setLiquid(sx + k, sy, 200, 1);  // 格栅自液体
  st.setLiquid(sx + 7, sy, 250, 1);   // 土组左侧邻水(格栅右侧)
  g.player.x = (sx + 5) * 16; g.player.y = (sy - 4) * 16;
  window.__sx = sx; window.__sy = sy;
  return { ok: true, sy };
});
console.log('场景:', JSON.stringify(setup));
if (setup.err) { console.log('FAIL'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 5000));
const out = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const sx = window.__sx, sy = window.__sy;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 三组各方块格中心 8×12 区域的"水感像素"(B 分量占优)计数
  const waterish = (tx) => {
    const [ax, ay] = w2s(tx * 16 + 2, sy * 16 + 2);
    const d = ctx.getImageData(Math.round(ax), Math.round(ay), Math.round(12 * z), Math.round(12 * z)).data;
    let blue = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      n++;
      const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (A > 120 && B > 80 && B > R + 20 && B >= G) blue++;
    }
    return +(blue / n * 100).toFixed(1);
  };
  return {
    玻璃组: [waterish(sx), waterish(sx + 1), waterish(sx + 2)],
    格栅组: [waterish(sx + 4), waterish(sx + 5), waterish(sx + 6)],
    土块组: [waterish(sx + 8), waterish(sx + 9), waterish(sx + 10)],
  };
}).catch((e) => ({ err: String(e).slice(0, 160) }));
console.log('[水感像素%]', JSON.stringify(out));
let pass = 0, fail = 0;
const chk = (name, ok, extra) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} ${extra ?? ''}`); ok ? pass++ : fail++; };
if (!out.err) {
  chk('玻璃(挡水族)无带', out.玻璃组.every((v) => v < 8), JSON.stringify(out.玻璃组));
  chk('格栅透带(自液体)', out.格栅组.some((v) => v > 15), JSON.stringify(out.格栅组));
  chk('土块对照有带', out.土块组.some((v) => v > 15), JSON.stringify(out.土块组));
} else chk('探针', false, out.err);
await browser.close();
process.exit(fail ? 1 : 0);
