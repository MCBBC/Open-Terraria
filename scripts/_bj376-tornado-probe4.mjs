// BJ376 探针 v4:同一龙卷 运行时翻旗 A/B/C——acc quad / bridged quad / 纯 2D
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj376-tornado-probe4.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const { Renderer } = await import('/src/render/Renderer.ts');
  const R = { shots: {}, notes: [] };
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
  const pinP = () => { p.x = px0 * TILE; p.y = surfRow * TILE - p.h; p.vx = 0; p.vy = 0; };
  for (let i = 0; i < 3; i++) { pinP(); g.fixedUpdate(1 / 60); }
  for (let i = 0; i < 60; i++) { await new Promise((r) => requestAnimationFrame(r)); pinP(); }
  const anchor = { cx: (px0 + 14) * TILE, cy: surfRow * TILE - 105 + 5 };

  const cv = g.renderer.canvas;
  const HW = 120, HH = 170;
  const wcv = document.createElement('canvas');
  const wctx = wcv.getContext('2d', { willReadFrequently: true });
  const grab = () => {
    const [sx0, sy0] = g.camera.worldToScreen(anchor.cx - HW, anchor.cy - HH);
    const [sx1, sy1] = g.camera.worldToScreen(anchor.cx + HW, anchor.cy + HH);
    const dx0 = Math.floor(sx0), dy0 = Math.floor(sy0);
    const dw = Math.ceil(sx1 - sx0), dh = Math.ceil(sy1 - sy0);
    if (dx0 < 0 || dy0 < 0 || dx0 + dw > cv.width || dy0 + dh > cv.height) return null;
    wcv.width = dw; wcv.height = dh;
    wctx.drawImage(cv, dx0, dy0, dw, dh, 0, 0, dw, dh);
    return wcv.toDataURL('image/png');
  };
  const chain = () => ({
    acc: g.renderer._accMode, path: g.renderer.bglPathUsed,
    shim: g.renderer.bglShimStats?.()?.active ?? null,
  });

  // 开火(常态 acc 链)
  p.useTime = 0; p.itemTime = 0;
  g.input.rightDown = true;
  for (let i = 0; i < 2; i++) { pinP(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
  g.input.rightDown = false;
  let st = g.entities.projectiles.find((q) => q.projId === 704);
  if (!st) return { ...R, err: 'no-spawn' };
  // 等到 t≈40(env=1 结构完整)再开始三连拍
  for (let i = 0; i < 140; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    pinP();
    st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) return { ...R, err: 'died-early' };
    st.x = anchor.cx - st.w / 2; st.y = anchor.cy - st.h / 2;
    if (st.t >= 40) break;
  }
  // A: acc quad(缺省)
  R.shots.A = { png: grab(), t: st.t, chain: chain() };
  R.notes.push('A=' + JSON.stringify(R.shots.A.chain));
  // B: b2b=false → bridged shim quad
  Renderer.b2bSetForTest(false);
  for (let i = 0; i < 6; i++) { await new Promise((r) => requestAnimationFrame(r)); pinP(); }
  st = g.entities.projectiles.find((q) => q.projId === 704);
  R.shots.B = { png: grab(), t: st.t, chain: chain() };
  R.notes.push('B=' + JSON.stringify(R.shots.B.chain));
  // C: bglShim=false → 纯 2D 实体
  Renderer.bglShimSetForTest(false);
  for (let i = 0; i < 6; i++) { await new Promise((r) => requestAnimationFrame(r)); pinP(); }
  st = g.entities.projectiles.find((q) => q.projId === 704);
  R.shots.C = { png: grab(), t: st.t, chain: chain() };
  R.notes.push('C=' + JSON.stringify(R.shots.C.chain));
  // 回翻 A 复验(排除时间漂移)
  Renderer.b2bSetForTest(true); Renderer.bglShimSetForTest(true);
  for (let i = 0; i < 6; i++) { await new Promise((r) => requestAnimationFrame(r)); pinP(); }
  st = g.entities.projectiles.find((q) => q.projId === 704);
  R.shots.A2 = { png: grab(), t: st.t, chain: chain() };
  R.notes.push('A2=' + JSON.stringify(R.shots.A2.chain));
  return R;
});

const fs = await import('node:fs');
for (const [k, v] of Object.entries(out.shots ?? {})) {
  fs.writeFileSync(`/tmp/bj376v4-${k}.png`, Buffer.from(v.png.split(',')[1], 'base64'));
  delete v.png;
}
console.log('NOTES:', JSON.stringify(out.notes));
console.log('DONE');
await browser.close();
