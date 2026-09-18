// 探针（SW-BJ15 2026-09-07）：全屏地图首开偏移定谳——逐帧采样 player 在屏幕上的落点
// （应 = 视口中心），对比首开 vs 二开。合成小世界（快速确定性），只读，不改状态。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(URL + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1800));

// 持续 rAF 采样器：armed 后采 45 帧
await page.evaluate(() => {
  window.__bj15 = { samples: [], armed: false, done: false, n: 0 };
  const step = () => {
    const S = window.__bj15;
    try {
      const game = window.__swGame;
      if (game && game.world && game.renderer) {
        const r = game.renderer, fm = r.fullMap;
        if (S.armed && S.n < 45) {
          S.samples.push({
            i: S.n, open: fm.open, zoom: +fm.zoom.toFixed(4), zt: fm.zoomTarget,
            panX: Math.round(fm.panX * 10) / 10, panY: Math.round(fm.panY * 10) / 10,
            fmW: r._fmWorldW, fmH: r._fmWorldH,
            viewW: r.canvas.width, viewH: r.canvas.height,
            au: +fm.anchorU.toFixed(1), av: +fm.anchorV.toFixed(1),
            amx: fm.anchorMX, amy: fm.anchorMY,
            pcx: game.player.cx, pcy: game.player.cy,
            ww: game.world.w, wh: game.world.h,
          });
          S.n++;
          if (S.n >= 45) { S.armed = false; S.done = true; }
        }
      }
    } catch (e) { /* ignore */ }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

const arm = () => page.evaluate(() => { const S = window.__bj15; S.samples = []; S.n = 0; S.done = false; S.armed = true; });
const collect = async () => {
  await page.waitForFunction(() => window.__bj15.done, { timeout: 20000 });
  return page.evaluate(() => window.__bj15.samples);
};
const closeMap = async () => {
  await page.evaluate(() => { if (window.__swGame.renderer.fullMap.open) window.__swGame.toggleFullMap(); });
  await new Promise((r) => setTimeout(r, 300));
};

const analyze = (tag, samples) => {
  const opened = samples.filter((s) => s.open);
  if (!opened.length) { console.log(`\n===== ${tag}: NO OPEN FRAMES CAPTURED =====`); return; }
  const s0 = opened[0];
  console.log(`\n===== ${tag} (world ${s0.ww}x${s0.wh}, view ${s0.viewW}x${s0.viewH}, preOpenFrames=${samples.length - opened.length}) =====`);
  let worst = 0;
  for (const s of opened) {
    const cx0 = s.viewW / 2 - (s.ww * s.zoom) / 2 + s.panX;
    const cy0 = s.viewH / 2 - (s.wh * s.zoom) / 2 + s.panY;
    const dx = cx0 + (s.pcx / 16) * s.zoom - s.viewW / 2;
    const dy = cy0 + (s.pcy / 16) * s.zoom - s.viewH / 2;
    worst = Math.max(worst, Math.abs(dx), Math.abs(dy));
    const flag = Math.abs(dx) > 4 || Math.abs(dy) > 4 ? '  << OFF-CENTER' : '';
    console.log(`f${String(s.i).padStart(2)} zoom=${s.zoom.toFixed(3)} fmW=${s.fmW} pan=(${s.panX},${s.panY}) off=(${Math.round(dx)},${Math.round(dy)})${flag}`);
  }
  console.log(`worst |off| = ${Math.round(worst)}px`);
};

// ---- 试验 1：首开（M 键，fresh session _fmWorldW=0）----
await closeMap();
await arm();
await page.keyboard.press('KeyM');
analyze('FIRST OPEN (M, fresh session)', await collect());
await closeMap();

// ---- 试验 2：二开 ----
await arm();
await page.keyboard.press('KeyM');
analyze('SECOND OPEN (M)', await collect());
await closeMap();

// ---- 试验 3（★SW-BJ120 2026-09-19 定谳重产）：小地图点击【不开图】——
//      原版无此面（Main.cs:56340-56381 minimap 支无点击处理；开图=专用键/晶塔），
//      点击开图入口已摘除 → 本试验只断言点击后图保持关闭。
const mmClick = async () => {
  const pos = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
  });
  await page.mouse.move(pos.x, pos.y);
  await new Promise((r) => setTimeout(r, 120));
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 100));   // 按住跨帧——down 边沿必须落在某一帧内
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 120));
};
await closeMap();
await mmClick();
const noOpen = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
console.log(`MINIMAP-CLICK NO-OPEN (BJ120): ${noOpen ? 'FAIL (map opened)' : 'PASS (stays closed)'}`);
await closeMap();

console.log('\nprobe done');
await browser.close();
