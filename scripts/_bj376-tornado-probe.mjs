// BJ376 探针:704 风暴龙卷 空中相 vs 落地相 逐帧隔离绘制取证(私有实例 5201)
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj376-tornado-probe.mjs
// 环境变量: BJ376_FLAGS='' (缺省 acc/shim 链) | 'bgl=0' (2D 全链)
//           BJ376_CASE=A|G|BOTH (A=高空射出落地全程 / G=平地即落 / 缺省 BOTH)
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.BJ376_FLAGS || '';
const CASES = process.env.BJ376_CASE || 'BOTH';
const URL_ = ORIGIN + (FLAGS ? '?' + FLAGS : '');
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

const runCase = await page.evaluate(async (caseName) => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { case: caseName, frames: [], pngs: {}, chain: null };
  R.chain = {
    bglPathUsed: g.renderer.bglPathUsed,
    bglPathStats: g.renderer.bglPathStats,
    shim: g.renderer.bglShimStats?.() ?? null,
    accMode: g.renderer._accMode ?? null,
    dpr: g.renderer.dpr,
  };
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY['vi_3852_'];
  g.player.inv.slots[2] = { id, stack: 1 };
  g.player.inv.selected = 2;
  const p = g.player;
  const sy = g.world.groundLevel;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  // 场地:平地柱(把玩家脚下整平)——防浮岛/树干扰
  const px = Math.floor(p.x / TILE);
  for (let dx = -30; dx <= 30; dx++) {
    for (let dy = sy; dy < sy + 6; dy++) g.world.store.setTile(px + dx, dy, 1, 0, 0, true);
    for (let dy = sy - 8; dy < sy; dy++) g.world.store.setTile(px + dx, dy, 0, 0, 0, true);
  }
  const SKY = sy - 120;                        // A 案=高空场地
  const pinGround = () => { p.x = px * TILE; p.y = sy * TILE - p.h; p.vx = 0; p.vy = 0; };
  const pinSky = () => { p.x = px * TILE; p.y = SKY * TILE - p.h; p.vx = 0; p.vy = 0; };
  const pin = caseName === 'G' ? pinGround : pinSky;
  for (let i = 0; i < 8; i++) { pin(); g.fixedUpdate(1 / 60); }
  p.useTime = 0; p.itemTime = 0;
  p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;

  const cv = g.renderer.canvas;
  const dpr = g.renderer.dpr || 1;
  // 工作画布(区域裁剪+度量)
  const wcv = document.createElement('canvas');
  const wctx = wcv.getContext('2d', { willReadFrequently: true });
  const HW = 150, HH = 190;                    // 区域半宽/半高(世界 px;盖住 210 高柱+尘)
  let ref = null;                              // 开火前同区域参考帧
  let lastMask = null;

  const grab = (st) => {
    const [sx0, sy0] = g.camera.worldToScreen(st.cx - HW, st.cy - HH);
    const [sx1, sy1] = g.camera.worldToScreen(st.cx + HW, st.cy + HH);
    const dx0 = Math.floor(sx0), dy0 = Math.floor(sy0);
    const dw = Math.ceil(sx1 - sx0), dh = Math.ceil(sy1 - sy0);
    if (dw <= 0 || dh <= 0 || dx0 < 0 || dy0 < 0 || dx0 + dw > cv.width || dy0 + dh > cv.height) return null;
    wcv.width = dw; wcv.height = dh;
    wctx.drawImage(cv, dx0, dy0, dw, dh, 0, 0, dw, dh);
    const d = wctx.getImageData(0, 0, dw, dh).data;
    return { dx0, dy0, dw, dh, d };
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
    // 行剖面(掩码行宽,设备 px)——按区域高度分带
    const bands = 10;
    const rowWLo = new Array(bands).fill(0), rowWHi = new Array(bands).fill(0);
    let cntLo = 0, cntHi = 0;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < cur.dh; y++) {
      const band = Math.min(bands - 1, Math.floor(y / cur.dh * bands));
      for (let x = 0; x < cur.dw; x++) {
        const i = y * cur.dw + x;
        if (mLo[i]) { rowWLo[band]++; cntLo++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        if (mHi[i]) { rowWHi[band]++; cntHi++; }
      }
    }
    // churn=与上帧掩码差异率(旋转⇒持续高)
    let churn = -1;
    if (lastMask && lastMask.length === n) {
      let ch = 0;
      for (let i = 0; i < n; i++) if (mLo[i] !== lastMask[i]) ch++;
      churn = ch / n;
    }
    lastMask = mLo;
    // 玩家屏域剔除计数(信息面)
    return {
      bbox: [minX, minY, maxX, maxY],
      worldW: +((maxX - minX) / (dpr * (g.camera.zoom ?? 1))).toFixed(1),
      worldH: +((maxY - minY) / (dpr * (g.camera.zoom ?? 1))).toFixed(1),
      cntLo, cntHi, churn: +churn.toFixed(4),
      rowWLo: rowWLo.map((v) => v / (cur.dh / bands)),
      rowWHi: rowWHi.map((v) => v / (cur.dh / bands)),
    };
  };
  // 参考帧(开火前)
  {
    const fake = { cx: p.cx, cy: p.cy - 100 };
    const cur = grab(fake);
    ref = cur;
  }
  // 开火一发
  p.useTime = 0; p.itemTime = 0;
  g.input.rightDown = true;
  for (let i = 0; i < 3; i++) { pin(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
  g.input.rightDown = false;
  let st = g.entities.projectiles.find((q) => q.projId === 704);
  if (!st) return { ...R, err: 'no-704-spawned' };
  R.spawn = { x: +st.cx.toFixed(0), y: +st.cy.toFixed(0), t: st.t };

  const PNG_AT = new Set([1, 8, 20, 45, 90, 150, 210, 268]);
  for (let f = 1; f <= 270; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    pin();
    st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) break;
    const cur = grab(st);
    const m = metrics(cur);
    R.frames.push({
      f, t: st.t, x: +st.cx.toFixed(1), y: +st.cy.toFixed(1), vy: +st.vy.toFixed(2),
      la0: st.localAI0, dead: !!st.dead, m,
    });
    if (PNG_AT.has(f) && cur) R.pngs['f' + f] = wcv.toDataURL('image/png');
    if (st.dead && f > 30) break;
  }
  R.chainAfter = {
    bglPathUsed: g.renderer.bglPathUsed,
    bglPathStats: g.renderer.bglPathStats,
    shim: g.renderer.bglShimStats?.() ?? null,
  };
  return R;
}, CASES === 'BOTH' ? 'A' : CASES);

const fs = await import('node:fs');
const tag = (FLAGS || 'default').replace(/[^a-z0-9]+/gi, '-');
const save = (out, suffix) => {
  const pngs = out.pngs ?? {};
  delete out.pngs;
  fs.writeFileSync(`/tmp/bj376-${tag}-${suffix}.json`, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(pngs)) {
    fs.writeFileSync(`/tmp/bj376-${tag}-${suffix}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  }
  console.log(`SAVED /tmp/bj376-${tag}-${suffix}.json frames=${out.frames?.length ?? 0}`);
};
save(runCase, 'A');
console.log(JSON.stringify({ ...runCase, frames: undefined }, null, 1).slice(0, 1500));

if (CASES === 'BOTH' || CASES === 'G') {
  // G 案=平地即落(重进页面状态直接复用——玩家已持械,只挪位置)
  const outG = await page.evaluate(async () => {
    const g = window.__swGame;
    const TILE = 16;
    const R = { case: 'G', frames: [], pngs: {} };
    const p = g.player;
    const sy = g.world.groundLevel;
    const px = Math.floor(p.x / TILE);
    const pinGround = () => { p.x = px * TILE; p.y = sy * TILE - p.h; p.vx = 0; p.vy = 0; };
    for (let i = 0; i < 8; i++) { pinGround(); g.fixedUpdate(1 / 60); }
    p.useTime = 0; p.itemTime = 0;
    p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;
    const cv = g.renderer.canvas;
    const dpr = g.renderer.dpr || 1;
    const wcv = document.createElement('canvas');
    const wctx = wcv.getContext('2d', { willReadFrequently: true });
    const HW = 150, HH = 190;
    let ref = null, lastMask = null;
    const grab = (st) => {
      const [sx0, sy0] = g.camera.worldToScreen(st.cx - HW, st.cy - HH);
      const [sx1, sy1] = g.camera.worldToScreen(st.cx + HW, st.cy + HH);
      const dx0 = Math.floor(sx0), dy0 = Math.floor(sy0);
      const dw = Math.ceil(sx1 - sx0), dh = Math.ceil(sy1 - sy0);
      if (dw <= 0 || dh <= 0 || dx0 < 0 || dy0 < 0 || dx0 + dw > cv.width || dy0 + dh > cv.height) return null;
      wcv.width = dw; wcv.height = dh;
      wctx.drawImage(cv, dx0, dy0, dw, dh, 0, 0, dw, dh);
      const d = wctx.getImageData(0, 0, dw, dh).data;
      return { dx0, dy0, dw, dh, d };
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
        rowWLo: rowWLo.map((v) => v / (cur.dh / bands)),
        rowWHi: rowWHi.map((v) => v / (cur.dh / bands)),
      };
    };
    ref = grab({ cx: p.cx, cy: p.cy - 100 });
    p.useTime = 0; p.itemTime = 0;
    g.input.rightDown = true;
    for (let i = 0; i < 3; i++) { pinGround(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    let st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) return { ...R, err: 'no-704-spawned' };
    R.spawn = { x: +st.cx.toFixed(0), y: +st.cy.toFixed(0), t: st.t };
    const PNG_AT = new Set([1, 8, 20, 45, 90, 150, 210, 268]);
    for (let f = 1; f <= 270; f++) {
      await new Promise((r) => requestAnimationFrame(r));
      pinGround();
      st = g.entities.projectiles.find((q) => q.projId === 704);
      if (!st) break;
      const cur = grab(st);
      const m = metrics(cur);
      R.frames.push({ f, t: st.t, x: +st.cx.toFixed(1), y: +st.cy.toFixed(1), vy: +st.vy.toFixed(2), la0: st.localAI0, dead: !!st.dead, m });
      if (PNG_AT.has(f) && cur) R.pngs['f' + f] = wcv.toDataURL('image/png');
      if (st.dead && f > 30) break;
    }
    return R;
  });
  save(outG, 'G');
}
await browser.close();
console.log('DONE');
