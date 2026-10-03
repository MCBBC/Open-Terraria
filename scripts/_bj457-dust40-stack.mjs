// ★BJ457 尘源抓栈:dust 40(JunglePlants)/dust 0 在 A(蜂蜜跑动)/C(平台跑动)场景的发射方调用栈。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-dust40-stack.mjs
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
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));

// 布景（同主探针）
await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
  const T_STONE = idBySheet(1), T_GRASS = idBySheet(2), T_TALLGRASS = idBySheet(19),
    T_PLATFORM = idBySheet(11) === -1 ? idBySheet(19) : idBySheet(11), T_HONEYBLOCK = idBySheet(225);
  g.__bj457 = { T_STONE, T_GRASS, T_TALLGRASS, T_PLATFORM, T_HONEYBLOCK };
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, idBySheet(0));
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_HONEYBLOCK); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  for (let x = 520; x <= 530; x++) { st.setTileSilent(x, gy, T_GRASS); st.setTileSilent(x, gy - 1, 0); }
  for (let x = 521; x <= 529; x += 2) st.setTileSilent(x, gy - 1, T_TALLGRASS, (x % 3) * 18, 0);
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, T_PLATFORM, 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);

  // wrap with stack（只记 type 40 / 0 / 2 / 3）
  if (!g.__bj457wrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.__bj457.stackLog = [];
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      const tx = x / 16, ty = y / 16;
      if (tx >= 480 && tx <= 560 && ty >= 0 && ty <= 400) {
        const st2 = (new Error().stack || '').split('\n').slice(1, 7).map((s) => s.trim().replace(/^at /, ''));
        g.__bj457.stackLog.push({ type, x: Math.round(tx), y: Math.round(ty), stack: st2 });
      }
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    g.__bj457wrap = true;
  }
});
const gy = await page.evaluate(() => window.__swGame.__bj457.gy);
const readStacks = () => page.evaluate(() => {
  const log = window.__swGame.__bj457.stackLog.slice();
  window.__swGame.__bj457.stackLog.length = 0;
  return log;
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

// A: 蜂蜜跑动
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 900));
await runBackForth(3500);
const stacksA = await readStacks();
console.log(`=== A 蜂蜜跑动 stackLog(${stacksA.length})`);
const agg = {};
for (const d of stacksA) {
  const key = (d.stack.find((s) => /src\/(entities|core)\//.test(s) && !/vanillaDust\.spawn|Game\.spawnDust|Game\.fixedUpdate|Game\.frame/.test(s)) || d.stack[1] || d.stack[0]).split(' (')[0];
  const k = `type=${d.type} @${key}`;
  agg[k] = (agg[k] || 0) + 1;
}
for (const [k, n] of Object.entries(agg)) console.log(`  x${n} ${k}`);
for (const d of stacksA.slice(0, 3)) console.log(`  sample type=${d.type} @(${d.x},${d.y})\n    ${d.stack.join('\n    ')}`);

// C: 平台跑动
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 900));
await runBackForth(3500, 500);
const stacksC = await readStacks();
console.log(`=== C 平台跑动 stackLog(${stacksC.length})`);
const aggC = {};
for (const d of stacksC) {
  const key = (d.stack.find((s) => /src\/(entities|core)\//.test(s) && !/vanillaDust\.spawn|Game\.spawnDust|Game\.fixedUpdate|Game\.frame/.test(s)) || d.stack[1] || d.stack[0]).split(' (')[0];
  const k = `type=${d.type} @${key}`;
  aggC[k] = (aggC[k] || 0) + 1;
}
for (const [k, n] of Object.entries(aggC)) console.log(`  x${n} ${k}`);
for (const d of stacksC.slice(0, 3)) console.log(`  sample type=${d.type} @(${d.x},${d.y})\n    ${d.stack.join('\n    ')}`);

await browser.close();
process.exit(0);
