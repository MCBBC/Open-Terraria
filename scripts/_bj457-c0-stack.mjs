// ★BJ457 C-clean 尘 0 抓栈 + G 重做(swing 伪造+同步泵)。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-c0-stack.mjs
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

await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
  const T_STONE = idBySheet(1), T_GRASS = idBySheet(2), T_PLATFORM = idBySheet(19);
  window.__idBy = { T_STONE, T_GRASS, T_PLATFORM, T_MUD: idBySheet(59), T_MOWED: idBySheet(477) };
  if (!g.__bj457) g.__bj457 = {};
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, idBySheet(0));
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_GRASS); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, T_PLATFORM, 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);

  if (!g.__bj457wrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.__bj457.log = [];
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      const tx = x / 16, ty = y / 16;
      if (tx >= 480 && tx <= 560 && ty >= 0 && ty <= 400) {
        g.__bj457.log.push({
          type, x: Math.round(tx), y: Math.round(ty),
          stack: (new Error().stack || '').split('\n').slice(1, 8).map((s) => s.trim().replace(/^at /, '').split(' (')[0]),
        });
      }
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    g.__bj457wrap = true;
  }
});
const readAll = () => page.evaluate(() => {
  const log = window.__swGame.__bj457.log.slice();
  window.__swGame.__bj457.log.length = 0;
  return log;
});
async function runBackForth(msTotal, stepMs = 500) {
  const t0 = Date.now();
  let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
}
const gy = await page.evaluate(() => window.__swGame.__bj457.gy);

// ---- C-clean 重跑 + 0 抓栈 ----
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 525 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 1000));
await runBackForth(3000);
const cLog = await readAll();
console.log(`C-clean 平台跑动 3s: ${cLog.length} 粒`);
const seen = new Set();
for (const d of cLog) {
  const key = d.stack.filter((s) => /src\/(entities|core|fx|world)\//.test(s)).join(' <- ');
  if (!seen.has(key)) {
    seen.add(key);
    console.log(`  type=${d.type} @(${d.x},${d.y})\n    ${key}`);
  }
}

// ---- G 重做:蜜池里挥武器跑动(同步泵) ----
const G = await page.evaluate(async (gy) => {
  const g = window.__swGame, p = g.player;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
  if (!g.swingOrig) {
    g.swingOrig = true;
    let fake = undefined;
    Object.defineProperty(g, 'swing', { get() { return fake; }, set(v) { fake = v; }, configurable: true });
  }
  g._fakeSwing = { t: 6, dur: 20, item: 0 };
  const before = g.__bj457.log.length;
  await new Promise((r) => setTimeout(r, 800));
  // 模拟 6s 挥动跑动:每 2 拍(≈33ms×2)调一次 mowTheLawnTick,miscCounter%2 门约半数受理
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    g.mowTheLawnTick();
    await new Promise((r) => setTimeout(r, 33));
  }
  g._fakeSwing = undefined;
  const log = g.__bj457.log.slice(before);
  g.__bj457.log.length = 0;
  const h = {};
  for (const d of log) h[d.type] = (h[d.type] || 0) + 1;
  // 变泥统计(sheet 477=修剪草)
  const ids = window.__idBy;
  let mud = 0, grass = 0;
  for (let x = 491; x <= 510; x++) {
    const id = g.world.store.get(x, gy);
    if (id === ids.T_MOWED) mud++;
    else if (id === ids.T_GRASS) grass++;
  }
  return { total: log.length, hist: h, mud, grass, inHoney: !!p.inHoney };
}, gy);
console.log(`G 蜜池挥武器跑动 6s: total=${G.total} hist=${JSON.stringify(G.hist)} 变泥=${G.mud} 留草=${G.grass} inHoney=${G.inHoney}`);
const gStack = await readAll();
for (const d of gStack.slice(0, 2)) {
  console.log(`  G sample type=${d.type} @(${d.x},${d.y}) ${d.stack.filter((s) => /src\//.test(s)).join(' <- ')}`);
}

console.log(`pageerrors=${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ERR:', e);
await browser.close();
process.exit(0);
