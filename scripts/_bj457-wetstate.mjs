// ★BJ457 湿状态逐拍观测:C(平台)场景 wetSticky/inHoney/splashHoneyWet/wetCount 轨迹。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-wetstate.mjs
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
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
  const T_STONE = idBySheet(1), T_HONEYBLOCK = idBySheet(225);
  if (!g.__bj457) g.__bj457 = {};
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, idBySheet(0));
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_HONEYBLOCK); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, idBySheet(19), 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);
});
await new Promise((r) => setTimeout(r, 1000));

// 玩家先进蜂蜜 2s（沾湿+蜜旗）,再传到平台观测 60 拍湿状态轨迹
await page.evaluate(() => {
  const g = window.__swGame, p = g.player, gy = g.__bj457.gy;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
});
await new Promise((r) => setTimeout(r, 2000));
const honeyState = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { inHoney: p.inHoney, wetSticky: p.wetSticky, splashHoneyWet: p.splashHoneyWet, wetCount: p.wetCount, inWater: p.inWater };
});
console.log('A(池中2s) 状态:', JSON.stringify(honeyState));

await page.evaluate(() => {
  const g = window.__swGame, p = g.player, gy = g.__bj457.gy;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
  g.__bj457.trace = [];
});
await runBack();
async function runBack() {
  await page.keyboard.down('a');
  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.up('a');
}
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  g.__bj457.trTimer = setInterval(() => {
    g.__bj457.trace.push({
      t: Date.now(), x: Math.round(p.x / 16), y: Math.round(p.y / 16),
      wetSticky: !!p.wetSticky, inHoney: !!p.inHoney, inWater: !!p.inWater,
      honeyWet: !!p.splashHoneyWet, wetCount: p.wetCount,
      liquidHere: (() => { const st = g.world.store; let s = 0; for (let dx = -1; dx <= 1; dx++) { const tx = Math.round(p.x / 16) + dx, ty = Math.round(p.y / 16); if (st.inBounds(tx, ty)) { const i = st.idx(tx, ty); s = Math.max(s, st.liquid[i]); } } return s; })(),
    });
  }, 100);
});
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => clearInterval(window.__swGame.__bj457.trTimer));
const trace = await page.evaluate(() => window.__swGame.__bj457.trace.slice(0, 40));
console.log('C(平台) 轨迹(前 40 采样,100ms 间隔):');
let prev = '';
for (const s of trace) {
  const line = `x=${s.x} y=${s.y} wetSticky=${s.wetSticky ? 1 : 0} inHoney=${s.inHoney ? 1 : 0} inWater=${s.inWater ? 1 : 0} honeyWet=${s.honeyWet ? 1 : 0} wetCount=${s.wetCount} liq=${s.liquidHere}`;
  if (line !== prev) { console.log(' ', line); prev = line; }
}
await browser.close();
process.exit(0);
