// ★IIIII218 视觉佐证探针：天顶生成屏动效截图 + 进世界后 M 大地图三结构（地牢/神庙/
// 金字塔 tenth 漆面）区域截图。
// SW_ORIGIN=http://localhost:5275 node tools/run-diag.mjs --timeout=600000 scripts/_iii218-shots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5275';
const OUT = '/tmp/iii218-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.bringToFront().catch(() => {});

// ① 生成屏动效（分时三连拍——首 2.5s 是预载/loading 相,覆盖相不明以多拍兜底）
const tG = Date.now();
await page.evaluate((cfg) => {
  void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
}, { seed: 'get fixed boi', size: 0, name: 'iii218v', difficulty: 0, evil: 0 });
for (const at of [12000, 25000, 45000]) {
  const wait = tG + at - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: `${OUT}/shot-iii218-genscreen-${at}.png` }).catch(() => {});
}
await page.evaluate(() => {
  const logo = document.querySelector('.sw-title-logo');
  const day = document.querySelector('.logo-day');
  const night = document.querySelector('.logo-night');
  return {
    transform: logo?.getAttribute('style') ?? null,
    daySrc: day?.src?.split('/').pop(),
    nightOp: night ? getComputedStyle(night).opacity : null,
    dbg: globalThis.__swMenuBg?.genAnimDebug?.() ?? null,
  };
}).then((r) => writeFileSync(`${OUT}/genscreen-state.json`, JSON.stringify(r, null, 2))).catch(() => {});

// ② 等进世界 → 点掉欢迎弹层（我已知晓）→ 传送三结构 → M 大地图截图
const t1 = Date.now();
while (Date.now() - t1 < 300000) {
  const ok = await page.evaluate(() => !!globalThis.__swGame?.renderer?.minimap).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3000));
// 关欢迎弹层：弹层是 VUI 画布绘制（canvas pointer-events:none,DOM 无按钮）→
// 真实鼠标点击「我已知晓」按钮位（屏中 640,644）——DOM 查询点不到（曾误判）
await page.mouse.click(640, 644).catch(() => {});
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 400));

// 直接在页内扫描三类 sheet 的质心并逐个传送截图
for (const [key, sheet, wallSheet] of [['dungeon', 41, null], ['temple', 226, null], ['pyramid', 151, null]]) {
  const spot = await page.evaluate(async (sh) => {
    const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
    const g = globalThis.__swGame;
    const st = g.world.store;
    let sx = 0, sy = 0, n = 0, step = 0;
    for (let y = 0; y < g.world.h && n < 400; y += 3) {
      for (let x = 0; x < g.world.w && n < 400; x += 3) {
        const i = st.idx(x, y);
        if (st.flags[i] && TILE_DEFS[st.type[i]]?.vanilla?.sheet === sh) { sx += x; sy += y; n++; }
      }
    }
    if (!n) return null;
    return { x: Math.round(sx / n), y: Math.round(sy / n), n };
  }, sheet).catch(() => null);
  if (!spot) { console.log('SPOT', key, 'none'); continue; }
  await page.evaluate((p) => {
    const g = globalThis.__swGame;
    g.player.x = p.x * 16; g.player.y = p.y * 16;
    g.camera?.snap?.();
  }, spot).catch(() => {});
  await new Promise((r) => setTimeout(r, 900));
  await page.keyboard.press('m').catch(() => {});
  await new Promise((r) => setTimeout(r, 1100));
  // 滚轮缩放到底（地图默认跟手放大;负 deltaY 若为放大则反转再试一次）
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel({ deltaY: -240 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
  }
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}/shot-iii218-mmap-${key}.png` }).catch(() => {});
  await page.keyboard.press('m').catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  console.log('MMSHOT', key, JSON.stringify(spot));
}
console.log('DONE');
await browser.close();
