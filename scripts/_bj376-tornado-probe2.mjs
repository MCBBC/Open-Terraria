// BJ376 探针 v2:704 龙卷 定位钉扎 + 尘/精灵三变体分账 + 双链对拍(私有实例 5201)
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj376-tornado-probe2.mjs
// 环境变量: BJ376_FLAGS='' (缺省 acc/shim 链) | 'bgl=0' (2D 全链)
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.BJ376_FLAGS || '';
const URL_ = ORIGIN + (FLAGS ? '?' + FLAGS : '');
const TAG = (FLAGS || 'default').replace(/[^a-z0-9]+/gi, '-');
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

// 预热贴图(704 sprite)——保证首帧起 draw 拿得到图
await page.evaluate(async () => {
  for (let i = 0; i < 60; i++) {
    const img = (await import('/src/entities/Arrow.ts')).projSprite(704);
    if (img && img.width > 0) return img.width + 'x' + img.height;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return 'never-loaded';
});

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { runs: {}, chain: null, dpr: g.renderer.dpr, sprite: null };
  R.chain = {
    bglPathUsed: g.renderer.bglPathUsed,
    bglPathStats: g.renderer.bglPathStats,
    accMode: g.renderer._accMode ?? null,
  };
  R.sprite = (await import('/src/entities/Arrow.ts')).projSprite(704)?.width ?? null;
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY['vi_3852_'];
  g.player.inv.slots[2] = { id, stack: 1 };
  g.player.inv.selected = 2;
  const p = g.player;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;

  // 玩家钉在出生点上空(净空),相机稳住
  const px0 = Math.floor(p.x / TILE);
  let surfRow = null;                       // 真实地表行(自上而下首个固块)
  const findSurf = (tx) => {
    const st = g.world.store;
    for (let ty = 5; ty < g.world.store.h; ty++) if (st.isSolid(tx, ty)) return ty;
    return null;
  };
  surfRow = findSurf(px0);
  const PLAYER_SKY = surfRow - 60;          // 玩家悬空 60 格(空中案)
  const pinP = (grounded) => {
    p.x = px0 * TILE;
    p.y = (grounded ? surfRow : PLAYER_SKY) * TILE - p.h;
    p.vx = 0; p.vy = 0;
  };
  for (let i = 0; i < 30; i++) { pinP(false); g.fixedUpdate(1 / 60); }

  const cv = g.renderer.canvas;
  const dpr = g.renderer.dpr || 1;
  const HW = 130, HH = 190;

  async function subRun(variant, anchor, grounded) {
    // variant: 'N'=常态 | 'D'=无尘 | 'S'=无精灵
    // anchor: {cx, cy} 龙卷钉扎点(世界 px);grounded=玩家钉地表(相机跟到地面)
    const wcv = document.createElement('canvas');
    const wctx = wcv.getContext('2d', { willReadFrequently: true });
    let ref = null, lastMask = null;
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
    const metrics = (cur) => {
      if (!ref || !cur || cur.dw !== ref.dw || cur.dh !== ref.dh) return null;
      const n = cur.dw * cur.dh;
      const mLo = new Uint8Array(n), mHi = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const dv = Math.abs(cur.d[o] - ref.d[o]) + Math.abs(cur.d[o + 1] - ref.d[o + 1]) + Math.abs(cur.d[o + 2] - ref.d[o + 2]);
        if (dv > 24) mLo[i] = 1;
        if (dv > 90) mHi[i] = 1;
      }
      const bands = 10;
      const rowWLo = new Array(bands).fill(0), rowWHi = new Array(bands).fill(0);
      let cntLo = 0, cntHi = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
      for (let y = 0; y < cur.dh; y++) {
        const band = Math.min(bands - 1, Math.floor(y / cur.dh * bands));
        for (let x = 0; x < cur.dw; x++) {
          const i = y * cur.dw + x;
          if (mLo[i]) { rowWLo[band]++; cntLo++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          if (mHi[i]) { rowWHi[band]++; cntHi++; }
        }
      }
      let churn = -1;
      if (lastMask && lastMask.length === n) {
        let ch = 0;
        for (let i = 0; i < n; i++) if (mLo[i] !== lastMask[i]) ch++;
        churn = ch / n;
      }
      lastMask = mLo;
      return {
        bbox: [minX, minY, maxX, maxY],
        worldW: +((maxX - minX) / (dpr * (g.camera.zoom ?? 1))).toFixed(1),
        worldH: +((maxY - minY) / (dpr * (g.camera.zoom ?? 1))).toFixed(1),
        cntLo, cntHi, churn: +churn.toFixed(4),
        rowWLo, rowWHi,
      };
    };
    // 杀掉上一发
    for (const q of g.entities.projectiles) if (q.projId === 704) q.dead = true;
    for (let i = 0; i < 3; i++) { pinP(grounded); g.fixedUpdate(1 / 60); }
    const savedDust = g.spawnDust;
    if (variant === 'D') g.spawnDust = () => null;
    ref = grab({ cx: anchor.cx, cy: anchor.cy });
    // 开火
    p.useTime = 0; p.itemTime = 0;
    g.input.rightDown = true;
    for (let i = 0; i < 2; i++) { pinP(grounded); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    if (variant === 'D') g.spawnDust = savedDust;
    let st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) return { err: 'no-spawn' };
    if (variant === 'S') st.draw = () => {};
    const frames = [];
    const pngs = {};
    const PNG_AT = new Set([6, 20, 40, 80]);
    for (let f = 1; f <= 110; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      pinP(grounded);
      // 钉扎龙卷位置(渲染前改 x/y——AI 只推进 t/vy)
      st = g.entities.projectiles.find((q) => q.projId === 704);
      if (!st) break;
      st.x = anchor.cx - st.w / 2; st.y = anchor.cy - st.h / 2;
      const cur = grab(st);
      const m = metrics(cur);
      frames.push({ f, t: st.t, vy: +st.vy.toFixed(1), la0: st.localAI0, m });
      if (PNG_AT.has(f) && cur) pngs['f' + f] = wcv.toDataURL('image/png');
      if (st.dead) break;
    }
    return { variant, anchor: { ...anchor }, spawnY: anchor.cy, frames, pngs };
  }

  // 锚点:空中=玩家同高右侧 220px;地面=地表行(盒底贴地,玩家钉地表旁)
  const AIR = { cx: (px0 + 14) * TILE, cy: PLAYER_SKY * TILE };
  const GND = { cx: (px0 + 14) * TILE, cy: surfRow * TILE - 105 + 5 };   // 盒底=地表+5px(原版出生重叠量)
  R.surfRow = surfRow;
  for (const [name, anchor, grounded] of [['air', AIR, false], ['ground', GND, true]]) {
    for (const variant of ['N', 'D', 'S']) {
      R.runs[`${name}-${variant}`] = await subRun(variant, anchor, grounded);
    }
  }
  R.chainAfter = { bglPathUsed: g.renderer.bglPathUsed, bglPathStats: g.renderer.bglPathStats };
  return R;
});

const fs = await import('node:fs');
for (const [name, run] of Object.entries(out.runs)) {
  const pngs = run.pngs ?? {};
  delete run.pngs;
  fs.writeFileSync(`/tmp/bj376v2-${TAG}-${name}.json`, JSON.stringify(run, null, 1));
  for (const [k, v] of Object.entries(pngs)) {
    fs.writeFileSync(`/tmp/bj376v2-${TAG}-${name}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  }
  const fr = run.frames ?? [];
  const good = fr.filter((x) => x.m);
  console.log(`RUN ${name}: frames=${fr.length} metricsOk=${good.length} err=${run.err ?? '-'}`);
}
fs.writeFileSync(`/tmp/bj376v2-${TAG}-meta.json`, JSON.stringify({ ...out, runs: undefined }, null, 1));
console.log('META:', JSON.stringify({ ...out, runs: undefined }));
await browser.close();
console.log('DONE');
