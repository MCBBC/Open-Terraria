// 云渲染审计(2026-08-18):用户报"好多云不渲染"。两个证据面:
//  ① cloudTintCache 逐条目 alpha 审计(空画布 = 污染色桶 = 云不可见)
//  ② 截图天空区域云覆盖度(与纯天空渐变对比)
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_cloudaudit-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/cloudaudit-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,等资产+云稳定 15s…');
await sleep(15000);

// ① 缓存条目 alpha 审计 + 云可见性各门读数
const audit = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const cache = sky.cloudTintCache;
  let empty = 0, total = 0;
  const emptyKeys = [];
  for (const [k, c] of cache) {
    total++;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let alpha = 0;
    for (let i = 3; i < d.length; i += 40) alpha += d[i];
    if (alpha === 0) { empty++; emptyKeys.push(k); }
  }
  // 可见性门实时读数(drawCloudPass 同式)
  const wr = sky.weatherRef;
  const basis = wr ? Math.max(wr.cloudAlpha, (wr.graveyardVisual ?? 0) * 0.92) : 0;
  const atmo = sky.atmoValue(g.player.y);
  const globalCloudAlpha = basis * atmo;
  // 云按 pass 分桶的屏内统计(x 是屏幕空间 0..viewW)
  const vw = 1280;
  let onScreen = 0;
  for (const c of sky.vclouds) {
    const w = (sky.cloudTex(c.type)?.width ?? 200) * c.scale;
    if (c.x + w > 0 && c.x < vw && !c.kill) onScreen++;
  }
  return { cacheSize: total, emptyEntries: empty, emptyKeys: emptyKeys.slice(0, 6),
    vclouds: sky.vclouds.length, onScreen,
    numCloudsTarget: wr?.numClouds ?? '无weatherRef',
    cloudAlpha: wr?.cloudAlpha, cloudBGActive: wr?.cloudBGActive,
    graveyardVisual: wr?.graveyardVisual, atmo, basis, globalCloudAlpha,
    towerCloudMul: sky.towerCloudMul, lastSkyTop: sky.lastSkyTop,
    surfaceGate: g.player.y - 400 < sky.fx.surfaceY + 16,
    isDay: g.world.clock?.isDay ?? '未知' };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[审计]', JSON.stringify(audit));

// ② 主画布(取最大)天空区域覆盖度
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) {
  fs.writeFileSync(`${TMP}/cloudaudit-sky.png`, shot);
  const cover = await page.evaluate(() => {
    const cv = [...document.querySelectorAll('canvas')]
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!cv) return { err: '无画布' };
    const ctx = cv.getContext('2d');
    const w = cv.width, h = Math.floor(cv.height * 0.25);
    const d = ctx.getImageData(0, 0, w, h).data;
    let deviant = 0;
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x += 2) {
        const i = (y * w + x) * 4;
        const r2 = (y * w + x + 2) * 4, d2 = ((y + 2) * w + x) * 4;
        const dr = Math.abs(d[i] - d[r2]) + Math.abs(d[i + 1] - d[r2 + 1]) + Math.abs(d[i + 2] - d[r2 + 2]);
        const dv = Math.abs(d[i] - d[d2]) + Math.abs(d[i + 1] - d[d2 + 1]) + Math.abs(d[i + 2] - d[d2 + 2]);
        if (dr > 30 || dv > 30) deviant++;
      }
    }
    return { w, h, deviant, deviantPct: +(deviant / ((w / 2) * (h - 4)) * 100).toFixed(2) };
  }).catch((e) => ({ err: String(e).slice(0, 160) }));
  console.log('[天空覆盖度]', JSON.stringify(cover), '(纯渐变 ≈ 0-0.5%,有云通常 >2%)');
}
await browser.close();
