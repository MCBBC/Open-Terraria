// ★BJ457 终判探针:C 干净对照 + G 蜜中挥动跑动(MowTheLawn 相=用户场景)+ H 踩草变泥尘。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-final-verdict.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
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
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
  const T_STONE = idBySheet(1), T_GRASS = idBySheet(2), T_HONEYBLOCK = idBySheet(225);
  if (!g.__bj457) g.__bj457 = {};
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, idBySheet(0));
  // 蜂蜜池:x 490..511 内 491..510,池底=草块(用户场景:蜜下是草块)
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_GRASS); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  // 木平台:x 540..550 gy-4 行,两端壁
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, idBySheet(19), 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);

  if (!g.__bj457wrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.__bj457.log = [];
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      const tx = x / 16, ty = y / 16;
      if (tx >= 480 && tx <= 560 && ty >= 0 && ty <= 400) g.__bj457.log.push(type);
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    g.__bj457wrap = true;
  }
});
const gy = await page.evaluate(() => window.__swGame.__bj457.gy);
const readHist = () => page.evaluate(() => {
  const log = window.__swGame.__bj457.log.slice();
  window.__swGame.__bj457.log.length = 0;
  const h = {};
  for (const t of log) h[t] = (h[t] || 0) + 1;
  return { total: log.length, hist: h };
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

// ---- C-clean:玩家先干地(草地锚)放 3s 清状态,再平台跑动 3s ----
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 525 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 2500));
const cleanState = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { wetSticky: !!p.wetSticky, inHoney: !!p.inHoney, honeyWet: !!p.splashHoneyWet };
});
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 1000));
await runBackForth(3000, 500);
const Cc = await readHist();
check('C-clean 干平台跑动(玩家无湿史) 3s:期望零尘', Cc.total === 0,
  `state=${JSON.stringify(cleanState)} total=${Cc.total} hist=${JSON.stringify(Cc.hist)}`);

// ---- H 参照:mowGrassTile 踩草变泥(池底草块)——期望 3 粒 50/50 dust2(绿叶)/dust0 ----
const H = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, gy = g.__bj457.gy;
  const sheetBefore = g.TILE_DEFS ? null : null;
  const ok = g.mowGrassTile(500 * 16 + 8, gy * 16);
  return { ok };
});
const Hh = await readHist();
check('H 参照 mowGrassTile 踩草变泥:尘=3 粒(2=Grass 绿/0=Dirt 棬)', H.ok && Hh.total === 3 && (Hh.hist[2] || 0) + (Hh.hist[0] || 0) === 3,
  `ok=${H.ok} hist=${JSON.stringify(Hh.hist)}`);

// ---- G 用户场景:蜜池里挥武器跑动(伪造 swing 驱动 mowTheLawnTick=原版 MowTheLawn 链) ----
await page.evaluate((gy) => {
  const p = window.__swGame.player, g = window.__swGame;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
  // 伪造挥动窗(mowTheLawnTick 只读 swing.t/dur/item)
  if (!g.swingOrig) {
    g.swingOrig = g.swing;
    Object.defineProperty(g, 'swing', {
      get() { return this._fakeSwing || undefined; },
      set(v) { this._fakeSwing = v; },
      configurable: true,
    });
  }
  g._fakeSwing = { t: 6, dur: 20, item: 0 };
}, gy);
await new Promise((r) => setTimeout(r, 600));
// 挥动+跑动 3s:每 120ms 手动调 mowTheLawnTick(miscCounter%2 门内置,约半数受理)
await runBackForth(3000, 700);
const swingPump = setInterval(() => {
  page.evaluate(() => { window.__swGame.mowTheLawnTick(); }).catch(() => {});
}, 120);
await new Promise((r) => setTimeout(r, 3000));
clearInterval(swingPump);
await page.evaluate(() => { window.__swGame._fakeSwing = undefined; });
const G = await readHist();
const grassDust = (G.hist[2] || 0) + (G.hist[3] || 0);
const mudTo = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const { TILE_DEFS } = window.__bj457defs || {};
  let mud = 0;
  for (let x = 491; x <= 510; x++) {
    const id = st.get(x, window.__swGame.__bj457.gy);
    const sheet = id >= 0 && window.__swGameTILE ? -1 : id;
    mud += sheet === 477 || sheet === 492 ? 1 : 0;
  }
  return mud;
});
check('G 蜜池里挥武器跑动 6s:绿叶尘出现(dust2/3)——原版 MowTheLawn 同相(无液体门)',
  grassDust > 0, `total=${G.total} hist=${JSON.stringify(G.hist)} grassDust=${grassDust} mudTiles=${mudTo}`);

console.log(`\npageerrors=${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ERR:', e);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
