// BJ376 探针 v3b:704 精灵足迹——无尘跑 + 逐帧 vs 固定参考差分掩码 dump
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj376-tornado-probe3b.mjs
// 环境变量: BJ376_FLAGS='' | 'bgl=0'   BJ376_ANCHOR=air|ground
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.BJ376_FLAGS || '';
const ANCHOR = process.env.BJ376_ANCHOR || 'ground';
const URL_ = ORIGIN + (FLAGS ? '?' + FLAGS : '');
const TAG = ((FLAGS || 'default') + '-' + ANCHOR).replace(/[^a-z0-9]+/gi, '-');
console.log('PROBE URL:', URL_);

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ376V');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

await page.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const img = (await import('/src/entities/Arrow.ts')).projSprite(704);
    if (img && img.width > 0) return true;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return false;
});

const out = await page.evaluate(async (anchorName) => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { chain: g.renderer.bglPathUsed, dpr: g.renderer.dpr, frames: [], pngs: {} };
  R.low = {
    canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height,
    lowW: g.renderer._worldLowW, lowH: g.renderer._worldLowH, lowK: g.renderer._worldLowK,
    autoRungIdx: g.renderer._autoRungIdx, accMode: g.renderer._accMode,
  };
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY['vi_3852_'];
  g.player.inv.slots[2] = { id, stack: 1 };
  g.player.inv.selected = 2;
  const p = g.player;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;

  const px0 = Math.floor(p.x / TILE);
  const st0 = g.world.store;
  let surfRow = null;
  for (let ty = 5; ty < st0.h; ty++) if (st0.isSolid(px0, ty)) { surfRow = ty; break; }
  const PLAYER_SKY = surfRow - 60;
  const grounded = anchorName === 'ground';
  const pinP = () => {
    p.x = px0 * TILE;
    p.y = (grounded ? surfRow : PLAYER_SKY) * TILE - p.h;
    p.vx = 0; p.vy = 0;
  };
  for (let i = 0; i < 3; i++) { pinP(); g.fixedUpdate(1 / 60); }
  for (let i = 0; i < 60; i++) { await new Promise((r) => requestAnimationFrame(r)); pinP(); }
  const anchor = grounded
    ? { cx: (px0 + 14) * TILE, cy: surfRow * TILE - 105 + 5 }
    : { cx: (px0 + 14) * TILE, cy: PLAYER_SKY * TILE };
  R.anchor = anchor; R.surfRow = surfRow;

  const cv = g.renderer.canvas;
  const HW = 170, HH = 230;
  const wcv = document.createElement('canvas');
  const wctx = wcv.getContext('2d', { willReadFrequently: true });
  const grab = (st) => {
    const [sx0, sy0] = g.camera.worldToScreen(st.cx - HW, st.cy - HH);
    const [sx1, sy1] = g.camera.worldToScreen(st.cx + HW, st.cy + HH);
    const dx0 = Math.floor(sx0), dy0 = Math.floor(sy0);
    const dw = Math.ceil(sx1 - sx0), dh = Math.ceil(sy1 - sy0);
    if (dw <= 0 || dh <= 0 || dx0 < 0 || dy0 < 0 || dx0 + dw > cv.width || dy0 + dh > cv.height) return null;
    wcv.width = dw; wcv.height = dh;
    wctx.drawImage(cv, dx0, dy0, dw, dh, 0, 0, dw, dh);
    return { dx0, dy0, dw, dh, d: wctx.getImageData(0, 0, dw, dh).data };
  };

  // 杀旧弹+无尘
  for (const q of g.entities.projectiles) if (q.projId === 704) q.dead = true;
  const savedDust = g.spawnDust;
  g.spawnDust = () => null;
  for (let i = 0; i < 3; i++) { pinP(); g.fixedUpdate(1 / 60); }
  const ref = grab({ cx: anchor.cx, cy: anchor.cy });
  p.useTime = 0; p.itemTime = 0;
  g.input.rightDown = true;
  for (let i = 0; i < 2; i++) { pinP(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
  g.input.rightDown = false;
  g.spawnDust = savedDust;
  let st = g.entities.projectiles.find((q) => q.projId === 704);
  if (!st) return { ...R, err: 'no-spawn' };
  const WANT_T = new Set([10, 20, 40, 80, 160]);
  let lastSavedT = -100;
  for (let f = 1; f <= 200; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    pinP();
    st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) break;
    st.x = anchor.cx - st.w / 2; st.y = anchor.cy - st.h / 2;
    const cur = grab(st);
    if (cur && ref && cur.dw === ref.dw) {
      const n = cur.dw * cur.dh;
      const mask = wctx.createImageData(cur.dw, cur.dh);
      let cnt = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
      for (let px = 0; px < n; px++) {
        const o = px * 4;
        const dv = Math.abs(cur.d[o] - ref.d[o]) + Math.abs(cur.d[o + 1] - ref.d[o + 1]) + Math.abs(cur.d[o + 2] - ref.d[o + 2]);
        if (dv > 20) {
          mask.data[o] = 255; mask.data[o + 1] = 255; mask.data[o + 2] = 255; mask.data[o + 3] = 255;
          cnt++;
          const x = px % cur.dw, y = (px / cur.dw) | 0;
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      R.frames.push({ f, t: st.t, cnt, bboxW: maxX - minX, bboxH: maxY - minY, dw: cur.dw, dh: cur.dh });
      if (st.t >= 7 && st.t - lastSavedT >= (lastSavedT < 0 ? 0 : 15) && !R.pngs['t' + st.t]) {
        lastSavedT = st.t;
        wcv.width = cur.dw; wcv.height = cur.dh;
        wctx.putImageData(mask, 0, 0);
        R.pngs['t' + st.t] = wcv.toDataURL('image/png');
        wctx.drawImage(cv, cur.dx0, cur.dy0, cur.dw, cur.dh, 0, 0, cur.dw, cur.dh);
        R.pngs['raw' + st.t] = wcv.toDataURL('image/png');
      }
    }
    if (st.dead) break;
  }
  return R;
}, ANCHOR);

const fs = await import('node:fs');
const pngs = out.pngs ?? {};
delete out.pngs;
fs.writeFileSync(`/tmp/bj376v3b-${TAG}.json`, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(pngs)) {
  fs.writeFileSync(`/tmp/bj376v3b-${TAG}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
}
console.log('LOW:', JSON.stringify(out.low));
console.log('DONE');
await browser.close();
