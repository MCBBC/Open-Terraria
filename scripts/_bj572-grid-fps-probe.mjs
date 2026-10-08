// ★BJ572 面①卡面定谳探针 v2：vsync 封顶下 FPS 不可判别 → 改函数级 CPU 时长。
//  测 renderer.render 总时长与 drawBuilderRulers 独立时长（grid 开/关 × 视口大小）。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj572-grid-fps-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${origin}/?play=small&bj572=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  if (!key) return { ok: false };
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1;   // 标尺线关（隔离网格面）
  g.player.builderAccStatus[1] = 1;   // 网格先关
  // 函数级时长账（wrap,只计时）
  const r = g.renderer;
  window.__t = { ruler: 0, rulerN: 0, render: 0, renderN: 0 };
  if (!window.__wrapDone) {
    window.__wrapDone = true;
    const oRuler = r.drawBuilderRulers.bind(r);
    r.drawBuilderRulers = function (...a) { const t0 = performance.now(); const v = oRuler(...a); window.__t.ruler += performance.now() - t0; window.__t.rulerN++; return v; };
    const oRender = r.render.bind(r);
    r.render = function (...a) { const t0 = performance.now(); const v = oRender(...a); window.__t.render += performance.now() - t0; window.__t.renderN++; return v; };
  }
  return { ok: true, cvw: g.renderer.mainCanvas?.width ?? 0 };
});
console.log('SETUP:', JSON.stringify(setup));
if (!setup.ok) { console.error('FAIL grant'); await browser.close(); process.exit(2); }

const measure = async (tag) => {
  const r = await page.evaluate(() => new Promise((res) => {
    window.__t.ruler = 0; window.__t.rulerN = 0; window.__t.render = 0; window.__t.renderN = 0;
    const t0 = performance.now();
    const n0 = window.__t.renderN;
    const tick = () => {
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      else res({
        wall: Math.round(performance.now() - t0),
        renderMs: Math.round((window.__t.render / Math.max(1, window.__t.renderN)) * 1000) / 1000,
        rulerMs: Math.round((window.__t.ruler / Math.max(1, window.__t.rulerN)) * 1000) / 1000,
        rulerN: window.__t.rulerN, renderN: window.__t.renderN,
      });
    };
    requestAnimationFrame(tick);
  }));
  console.log(tag, JSON.stringify(r));
};

await measure('GRID-OFF 1920x1080:');
await page.evaluate(() => { window.__swGame.player.builderAccStatus[1] = 0; });
await new Promise((r) => setTimeout(r, 500));
await measure('GRID-ON  1920x1080:');
await page.evaluate(() => { window.__swGame.player.builderAccStatus[1] = 1; });
await new Promise((r) => setTimeout(r, 500));
await measure('GRID-OFF#2:');
await page.evaluate(() => { window.__swGame.player.builderAccStatus[1] = 0; });
await new Promise((r) => setTimeout(r, 500));
await measure('GRID-ON#2:');
// 网格开 + 视频期淡出连续变化（走两步模拟 gridDist 漂移）
const gridInfo = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const br = r.builderRulers;
  return br ? { nx: Math.round((window.innerWidth / 1 + 100) / 16), ny: Math.round((window.innerHeight / 1 + 100) / 16), gridOn: br.gridOn, dist: Math.round(br.gridDist * 100) / 100 } : null;
});
console.log('GRIDINFO:', JSON.stringify(gridInfo));
console.log('PAGEERRORS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
