// 洗掠端到端 A/B:同一入水场景,对比"注入开/关"的水线时间序列——
// 差值即洗掠贡献。关 = 临时把 injectWash/queueRipple* 打成 no-op(页内打桩)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const mapStr = readFileSync(needInput(join(DOWNLOADS, 'map-浮夸的羡慕顶峰 (7).json')), 'utf8');

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wash-profile7'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (txt) => { await window.__swFlow.loadJson(txt); }, mapStr);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 2000));

const run = (washOn) => page.evaluate(async (on) => {
  const g = window.__swGame;
  const st = g.world.store;
  let spot = null;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  outer:
  for (let r = 10; r < 200; r += 4) {
    for (const dx of [-r, r]) {
      for (let dy = -30; dy < 30; dy += 3) {
        const x = px + dx, y = py + dy;
        if (!st.inBounds(x, y)) continue;
        if (st.liquid[st.idx(x, y)] > 200 && st.liquid[st.idx(x - 3, y)] > 200
          && st.liquid[st.idx(x + 3, y)] > 200 && st.liquid[st.idx(x, y - 3)] === 0
          && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 3)]) { spot = { x, y }; break outer; }
      }
    }
  }
  if (!spot) return { err: 'no water' };
  const wwMod = await import('/src/render/WaterWaves.ts');
  const ww = wwMod.waterWaves;
  // 打桩(只影响本次运行;恢复靠刷新,这里 A/B 各跑一次页面级)
  if (!on) {
    ww.injectWash = () => {};
    wwMod.queueRippleRaw = () => {};
    wwMod.queueRippleSized = () => {};
    wwMod.queueRipple = () => {};
  }
  g.player.debugGod = true;
  g.player.x = spot.x * 16; g.player.y = (spot.y - 10) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.follow = function () {};
  g.camera.x = spot.x * 16; g.camera.y = spot.y * 16;
  if (g.world.clock) g.world.clock.timeOfDay = 0.4;
  await new Promise((res) => setTimeout(res, 500));

  const readLineAt = (colX) => {
    const cv = g.renderer.canvas;
    const c2 = cv.getContext('2d');
    const dpr = cv.width / (cv.clientWidth || 1280);
    const z = g.camera.zoom;
    const [sx] = g.camera.worldToScreen(colX * 16, 0);
    const pxX = Math.round((sx + 8 * z) * dpr);
    for (let wy = (spot.y - 3) * 16; wy < (spot.y + 2) * 16; wy += 0.5) {
      const [, sy] = g.camera.worldToScreen(0, wy);
      const yy = Math.round(sy * dpr);
      if (yy >= cv.height) break;
      const d = c2.getImageData(pxX, yy, 1, 1).data;
      if (d[2] > 90 && d[2] > d[0] + 40 && d[0] < 120) return wy;
    }
    return -1;
  };

  const seq = [];
  for (let f = 0; f < 20; f++) await new Promise((res) => requestAnimationFrame(res));
  seq.push({ ph: 'rest', line: readLineAt(spot.x) });
  g.player.y = (spot.y - 12) * 16; g.player.vy = 0;
  for (let f = 0; f < 45; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 3 === 0) seq.push({ ph: 'in', f, line: readLineAt(spot.x), inW: g.player.inWater });
  }
  g.player.vy = -8;
  for (let f = 0; f < 30; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    if (f % 3 === 0) seq.push({ ph: 'out', f, line: readLineAt(spot.x), inW: g.player.inWater });
  }
  return seq;
}, washOn);

const on = await run(true);
// B:恢复注入(重引模块拿原函数不可行——直接刷新波场缓冲并重跑;打桩只覆盖了
//   ww.injectWash 与 queueRipple* 导出引用,Renderer 持有的是模块内闭包引用,
//   queueRipple* 换引用不影响 injectEntity 内部调用——故 B 只需恢复 injectWash)
await page.evaluate(async () => {
  const wwMod = await import('/src/render/WaterWaves.ts');
  // 恢复:重建系统实例不可行,改为把 no-op 换回"透传到内部实现"——
  // 实际上 injectWash 是实例方法,Renderer 调 waterWaves.injectWash(...) 动态查找,
  // 删除自有覆盖即可恢复原型方法
  delete wwMod.waterWaves.injectWash;
});
await new Promise((r) => setTimeout(r, 800));
const off = await run(false);
const cmp = [];
for (let i = 0; i < Math.max(on.length, off.length); i++) {
  const a = on[i], b = off[i];
  cmp.push({ i, ph: a?.ph, on: a?.line, off: b?.line, d: (a?.line >= 0 && b?.line >= 0) ? Math.round((a.line - b.line) * 10) / 10 : null });
}
console.log('idx ph   on      off     diff');
for (const c of cmp) console.log(`${String(c.i).padStart(3)} ${String(c.ph).padEnd(5)} ${String(c.on).padEnd(8)} ${String(c.off).padEnd(8)} ${c.d ?? ''}`);
await browser.close();
