// ★BJ465 mini：dust 3 坐标直方图——实验场内 vs 世界背景分辨
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const g = window.__swGame;
  g.__m = { d: [] };
  if (!g.__mwrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      if (type === 3 || type === 2 || type === 31) g.__m.d.push({ type, tx: Math.round(x / 16), ty: Math.round(y / 16) });
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    g.__mwrap = true;
  }
});
// 布场（与主探针同参）
await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (s) => (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === s);
  const T_DIRT = idBySheet(0), T_STONE = idBySheet(1), T_GRASS = idBySheet(2), T_TALLGRASS = idBySheet(3);
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__m.gy = gy;
  for (let x = 486; x <= 516; x++) for (let y = gy - 10; y <= gy + 4; y++) { st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = 489; x <= 513; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, T_DIRT);
  for (let x = 490; x <= 511; x++) st.setTileSilent(x, gy, T_GRASS);
  for (let x = 492; x <= 509; x += 2) st.setTileSilent(x, gy - 1, T_TALLGRASS, (x % 3) * 18, 0);
  for (let y = gy - 7; y <= gy; y++) { st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); }
  for (let x = 490; x <= 511; x++) for (let y = gy - 2; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3);
  const p = g.player;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0; p.velocityReset?.();
  return gy;
});
await new Promise((r) => setTimeout(r, 1500));
// 静止 3.5s——背景基线
await page.evaluate(() => { window.__swGame.__m.d.length = 0; });
await new Promise((r) => setTimeout(r, 3500));
const base = await page.evaluate(() => {
  const d = window.__swGame.__m.d.slice(); window.__swGame.__m.d.length = 0;
  const gy = window.__swGame.__m.gy;
  const inField = d.filter((e) => e.tx >= 490 && e.tx <= 511 && e.ty >= gy - 6 && e.ty <= gy + 2);
  const out = d.filter((e) => !(e.tx >= 490 && e.tx <= 511 && e.ty >= gy - 6 && e.ty <= gy + 2));
  const hist = {};
  for (const e of out) { const k = `t${e.type}`; hist[k] = (hist[k] || 0) + 1; }
  return { fieldDust: inField.slice(0, 20), fieldN: inField.length, outN: out.length, outHist: hist, gy };
});
console.log('静止 3.5s 基线: 场内=', base.fieldN, '场外=', base.outN, '场外谱=', JSON.stringify(base.outHist), 'gy=', base.gy);
console.log('场内样本=', JSON.stringify(base.fieldDust));
// 跑动 4s
const runBackForth = async (msTotal, stepMs = 700) => {
  const t0 = Date.now(); let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
};
await runBackForth(4000);
const run = await page.evaluate(() => {
  const d = window.__swGame.__m.d.slice(); window.__swGame.__m.d.length = 0;
  const gy = window.__swGame.__m.gy;
  const inField = d.filter((e) => e.tx >= 490 && e.tx <= 511 && e.ty >= gy - 6 && e.ty <= gy + 2);
  const out = d.filter((e) => !(e.tx >= 490 && e.tx <= 511 && e.ty >= gy - 6 && e.ty <= gy + 2));
  const hist = {};
  for (const e of out) { const k = `t${e.type}`; hist[k] = (hist[k] || 0) + 1; }
  return { fieldDust: inField.slice(0, 30), fieldN: inField.length, outN: out.length, outHist: hist };
});
console.log('跑动 4s: 场内=', run.fieldN, '场外=', run.outN, '场外谱=', JSON.stringify(run.outHist));
console.log('场内样本=', JSON.stringify(run.fieldDust));
console.log('pageerrors=', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(0);
