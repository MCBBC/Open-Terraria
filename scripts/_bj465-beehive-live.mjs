// ★BJ465 mini3：天然蜂巢实况探针——传送玩家到真实蜂蜜池,浅/深跑动+静止+着火全档
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
// 找天然蜂蜜池（液体 type=3 的最大连通域中心）
const site = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  g.__h = { TD: TILE_DEFS, d: [] };
  if (!g.__hwrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      g.__h.d.push({ type, tx: Math.round(x / 16), ty: Math.round(y / 16) });
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    const op = g.spawnParticles.bind(g);
    g.spawnParticles = function (x, y, color, n, size, opt) {
      g.__h.d.push({ part: String(color), tx: Math.round(x / 16), ty: Math.round(y / 16) });
      return op(x, y, color, n, size, opt);
    };
    g.__hwrap = true;
  }
  const W = st.w, H = st.h;
  let best = null;
  for (let y = 40; y < H - 40; y += 3) {
    let run = 0, x0 = 0;
    for (let x = 40; x < W - 40; x++) {
      const i = st.idx(x, y);
      const isHoney = st.liquid[i] > 100 && st.liquidType[i] === 3;
      if (isHoney) { if (run === 0) x0 = x; run++; }
      else {
        if (run > (best?.run ?? 0)) best = { run, x0: x0 + ((run - 1) >> 1), y };
        run = 0;
      }
    }
  }
  return best;
});
if (!site) { console.log('NO_HONEY_POOL'); await browser.close(); process.exit(0); }
console.log('蜜池锚=', JSON.stringify(site));
const tp = (tx, ty) => page.evaluate(({ tx, ty }) => {
  const g = window.__swGame, p = g.player;
  p.x = tx * 16; p.y = ty * 16; p.vx = 0; p.vy = 0; p.velocityReset?.();
  return { x: Math.round(p.x / 16), y: Math.round(p.y / 16) };
}, { tx, ty });
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const readNear = (tx, ty, rad, gy) => page.evaluate(({ tx, ty, rad }) => {
  const d = window.__swGame.__h.d.slice(); window.__swGame.__h.d.length = 0;
  const near = d.filter((e) => Math.abs(e.tx - tx) <= rad && Math.abs(e.ty - ty) <= rad);
  const hist = {};
  for (const e of near) { const k = e.part ? e.part : `t${e.type}`; hist[k] = (hist[k] || 0) + (e.part ? e.n : 1); }
  return { nearN: near.length, hist, samples: near.slice(0, 10) };
}, { tx, ty, rad });
const runBackForth = async (msTotal, stepMs = 700) => {
  const t0 = Date.now(); let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
};
// 场1：池面（站立在蜜面附近）跑动
await tp(site.x0 + 1, site.y - 4);
await settle(1500);
const st1 = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { x: Math.round(p.x / 16), y: Math.round(p.y / 16), inHoney: !!p.inHoney, wet: !!p.wetSticky, onGround: !!p.onGround };
});
console.log('落点=', JSON.stringify(st1));
await page.evaluate(() => { window.__swGame.__h.d.length = 0; });
await runBackForth(4000);
const r1 = await readNear(st1.x, st1.y, 24);
console.log('R1 蜂池跑动 4s: near=', r1.nearN, 'hist=', JSON.stringify(r1.hist), '样本=', JSON.stringify(r1.samples));
// 场2 静止
await page.evaluate(() => { window.__swGame.__h.d.length = 0; });
await settle(3000);
const r2 = await readNear(st1.x, st1.y, 24);
console.log('R2 蜂池静止 3s: near=', r2.nearN, 'hist=', JSON.stringify(r2.hist));
// 场3 着火跑动
await page.evaluate(async () => {
  const g = window.__swGame;
  const { BuffType } = await import(`/src/stats/Buffs.ts?t=${Date.now()}`);
  g.player.buffs.apply(BuffType.OnFire, 6);
  return g.player.buffs.has(BuffType.OnFire);
});
await page.evaluate(() => { window.__swGame.__h.d.length = 0; });
await runBackForth(4000);
const r3 = await readNear(st1.x, st1.y, 24);
console.log('R3 蜂池+着火跑动 4s: near=', r3.nearN, 'hist=', JSON.stringify(r3.hist));
console.log('pageerrors=', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(0);
