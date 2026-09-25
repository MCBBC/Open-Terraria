// ★浸没透明案 A/B 探针：完全浸没 vs 半截,shim 开/关,玩家区域像素抓帧
// 用法: SW_ORIGIN=http://localhost:5223 node tools/run-diag.mjs scripts/_swimmer-bglshim-ab.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_OUT ?? '/tmp/swimmer-probe';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.world && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 2500));

// ---- 造池:地表刻 9×7 坑,注满水,传送玩家入坑 ----
const pool = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const T = 16;
  const px = Math.floor((g.player.x + g.player.w / 2) / T);
  let surf = -1;
  for (let y = 10; y < 500; y++) { const i = st.idx(px, y); if ((st.flags[i] & 1) && st.type[i]) { surf = y; break; } }
  if (surf < 0) return { err: 'no surface' };
  const top = surf, bot = surf + 7;
  for (let x = px - 4; x <= px + 4; x++) {
    for (let y = top; y < bot; y++) {
      const i = st.idx(x, y);
      st.flags[i] = 0; st.type[i] = 0; st.half[i] = 0; st.slope[i] = 0;
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  // 坑壁同排清理,防边缘坡面半砖
  return { surf, px, top, bot };
});
console.log('POOL=' + JSON.stringify(pool));
if (pool.err) { await browser.close(); process.exit(1); }

// ---- shim 面 instrument:rasterizeDrawImage 计数+filter 状态 ----
await page.evaluate(() => {
  const g = window.__swGame;
  window.__probe = { raster: 0, filterSeen: [], fb: 0 };
  const hook = () => {
    const shim = g.renderer.bglEntShim;
    if (!shim) return;
    if (!shim.__patched) {
      shim.__patched = true;
      const or = shim.rasterizeDrawImage.bind(shim);
      shim.rasterizeDrawImage = function (...a) {
        window.__probe.raster++;
        if (window.__probe.filterSeen.length < 6 && this.filterV !== 'none') window.__probe.filterSeen.push(String(this.filterV).slice(0, 50));
        return or(...a);
      };
    }
  };
  window.__probeHook = hook;
  const wrapF = () => { hook(); requestAnimationFrame(wrapF); };
  requestAnimationFrame(wrapF);
});

const settle = async (ms) => { await new Promise(r => setTimeout(r, ms)); };

// 传送入坑沉底(完全浸没)
await page.evaluate(({ surf }) => {
  const g = window.__swGame;
  const p = g.player;
  const T = 16;
  p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
  p.x = 0; // 占位防 NaN
  const px = Math.floor((p.x + p.w / 2) / T);
  void px;
}, { surf: pool.surf });

// 真传送:坑中心
await page.evaluate((pool) => {
  const g = window.__swGame;
  const p = g.player;
  const T = 16;
  const cx = (pool.px + 0.5) * T;
  p.x = cx - p.w / 2;
  p.y = (pool.top + 1) * T + 40 - p.h;   // 坑内,头顶距水面 40px → 完全浸没
  p.vx = 0; p.vy = 0;
}, pool);
await settle(2600);

const state = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  return {
    inWater: p.inWater, headUnderwater: p.headUnderwater, wet: p.wetSticky ?? p.wet,
    x: p.x, y: p.y, dead: p.dead,
    pathUsed: g.renderer.bglPathUsed, pathStats: g.renderer.bglPathStats,
    shimStats: g.renderer.bglShimStats ? g.renderer.bglShimStats() : null,
    probe: window.__probe,
  };
});
console.log('STATE_FULL=' + JSON.stringify(state));

// ---- 截帧:玩家区域 CSS 裁剪 ----
const clipFor = async () => page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const [sx, sy] = cam.worldToScreen(g.player.cx, g.player.cy);
  return { x: r.left + sx - 80, y: r.top + sy - 96, width: 160, height: 192 };
});

const snapA = await clipFor();
await page.screenshot({ path: OUT + '/A-shim-full.png', clip: snapA });

// A2: shim 关(2D 对照)
await page.evaluate(() => { window.__swGame.renderer.constructor.bglShimSetForTest(false); window.__probe.raster = 0; });
await settle(700);
await page.screenshot({ path: OUT + '/B-2d-full.png', clip: snapA });
await page.evaluate(() => { window.__swGame.renderer.constructor.bglShimSetForTest(true); });
await settle(400);

// C: 半截入水(头上浮出水 12px) — shim 开
await page.evaluate((pool) => {
  const g = window.__swGame;
  const p = g.player;
  const T = 16;
  p.y = (pool.top) * T - p.h + 34;   // 头部在水线上方
  p.vx = 0; p.vy = 0;
}, pool);
await settle(900);
const stateC = await page.evaluate(() => {
  const g = window.__swGame; const p = g.player;
  return { headUnderwater: p.headUnderwater, inWater: p.inWater, pathUsed: g.renderer.bglPathUsed, probe: window.__probe };
});
console.log('STATE_HALF=' + JSON.stringify(stateC));
await page.screenshot({ path: OUT + '/C-shim-half.png', clip: snapA });

// D: shim 关 半截(对照)
await page.evaluate(() => { window.__swGame.renderer.constructor.bglShimSetForTest(false); });
await settle(700);
await page.screenshot({ path: OUT + '/D-2d-half.png', clip: snapA });

console.log('SNAP=' + JSON.stringify(snapA));
await browser.close();
console.log('DONE → ' + OUT);
