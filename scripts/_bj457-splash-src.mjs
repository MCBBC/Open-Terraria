// ★BJ457 splashHoneyDust 调用时刻状态快照:判别 A/C 场景 152 走哪一支(翻转拍/掠水 skim)。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-splash-src.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));

await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
  const T_STONE = idBySheet(1), T_HONEYBLOCK = idBySheet(225), T_PLATFORM = idBySheet(19);
  if (!g.__bj457) g.__bj457 = { hlog: [] };
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, idBySheet(0));
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_HONEYBLOCK); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, T_PLATFORM, 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);

  // wrap splashHoneyDust:记录调用时刻状态
  if (!p.__splashWrapped) {
    const proto = Object.getPrototypeOf(p);
    const orig = proto.splashHoneyDust;
    proto.splashHoneyDust = function (game, boxY) {
      g.__bj457.hlog.push({
        x: +(this.x / 16).toFixed(1), y: +(this.y / 16).toFixed(1),
        onGround: !!this.onGround, vy: +this.vy.toFixed(2), vx: +this.vx.toFixed(2),
        wetNowProbe: this.__wetNowProbe ?? null, wetSticky: !!this.wetSticky,
        inHoney: !!this.inHoney, inLava: !!this.inLava, wetCount: this.wetCount,
        skimCd: this._skimSplashCooldown, shimmering: !!this.shimmering,
      });
      return orig.call(this, game, boxY);
    };
    p.__splashWrapped = true;
  }
});

async function runBackForth(msTotal, stepMs = 700) {
  const t0 = Date.now();
  let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
}
const readH = () => page.evaluate(() => { const l = window.__swGame.__bj457.hlog.slice(); window.__swGame.__bj457.hlog.length = 0; return l; });
const gy = await page.evaluate(() => window.__swGame.__bj457.gy);

// A: 池中跑动 2s
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 1000));
await runBackForth(2000);
const hA = await readH();
console.log(`A 池中跑动 2s: splashHoneyDust 调用 ${hA.length} 次`);
for (const s of hA.slice(0, 8)) console.log('  ', JSON.stringify(s));

// C: 平台跑动 2s(从池中直接传)
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 800));
await runBackForth(2000, 500);
const hC = await readH();
console.log(`C 平台跑动 2s: splashHoneyDust 调用 ${hC.length} 次`);
for (const s of hC.slice(0, 8)) console.log('  ', JSON.stringify(s));

// C2: 平台静止 2s 对照
await new Promise((r) => setTimeout(r, 300));
const hC2 = await readH();
await new Promise((r) => setTimeout(r, 2000));
const hC2b = await readH();
console.log(`C2 平台静止 2s: ${hC2b.length} 次`);

await browser.close();
process.exit(0);
