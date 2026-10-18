// ★BJ583 电线可见性终版物证探针：cavern 层受控暗室（干燥+lightAt=[0,0,0] 直读验证）
//  × 16×16 整格裁剪采样（偏移免疫:格内任一 wire 红像素即判可见——g.camera.worldToScreen
//  与渲染器 round 变换有亚像素差,单点采样会脱靶,勿回退单点式）× mode0/1/3 同格跨档对拍
//  （setMode 带 wireModes 落地重试——注入走 Game.render,pump 计数滞后,采前必须验证
//  renderer.wireModes[0]===m,否则读到陈旧档=假阳性,首版三探针全栽在这）。
//  判据：mode0(Bright,透镜缺省)格内红像素>0=暗区恒亮②;mode1(Normal)=0 红像素+maxR<20
//  =吃乘光暗处不可见③（原版 Lighting.GetColor 相）;mode3(Hidden)=0。
//  用法：SW_ORIGIN=http://localhost:<私有端口> node tools/run-diag.mjs scripts/_bj583-wire-visibility-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5267';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260909 });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; }
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_3611_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  window.__cropReds = (tx, ty) => {
    const c = g.renderer.canvas;
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const t = document.createElement('canvas'); t.width = 16; t.height = 16;
    const cx = t.getContext('2d', { willReadFrequently: true });
    cx.drawImage(c, (sx | 0) - 8, (sy | 0) - 8, 16, 16, 0, 0, 16, 16);
    const d = cx.getImageData(0, 0, 16, 16).data;
    let reds = 0, maxR = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 140 && d[i] - d[i+1] > 60 && d[i] - d[i+2] > 60) reds++;
      if (d[i] > maxR) maxR = d[i];
    }
    return [reds, maxR];
  };
  window.__carve = (tx, ty) => {
    const st = g.world.store;
    const i = st.idx(tx, ty);
    st.type[i] = 0; st.flags[i] = 0; st.wire[i] = 0;
    if (st.liquid) st.liquid[i] = 0;
  };
  window.__lightAt = (tx, ty) => g.lighting.lightAt(tx, ty);
});
await pump(page, 40);

const chamber = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const bty = Math.floor(st.h * 0.55);
  for (let cand = 0; cand < 60; cand++) {
    const ptx = Math.floor(g.player.cx / 16) + 40 + cand * 14;
    let dry = true;
    for (let dy = -5; dy <= 2 && dry; dy++)
      for (let dx = -6; dx <= 6 && dry; dx++)
        if (st.liquid && st.liquid[st.idx(ptx + dx, bty + dy)] > 0) dry = false;
    if (!dry) continue;
    for (let dy = -5; dy <= 1; dy++)
      for (let dx = -6; dx <= 6; dx++) window.__carve(ptx + dx, bty + dy);
    if (!(st.flags[st.idx(ptx, bty + 2)] !== 0 && st.type[st.idx(ptx, bty + 2)] !== 0)) continue;
    return { ptx, bty, spawn: [ptx, bty - 4] };
  }
  return null;
});
await page.evaluate((z) => {
  const g = window.__swGame;
  g.player.x = z.spawn[0] * 16 + 8 - 10;
  g.player.y = z.spawn[1] * 16;
  g.player.vx = 0; g.player.vy = 0;
}, chamber);
await pump(page, 300);
await page.evaluate(() => { const g = window.__swGame; g.paused = true; g._uiPausedByAutoPause = false; });
await pump(page, 4);
const light = await page.evaluate((z) => [window.__lightAt(z.ptx, z.bty - 2), window.__lightAt(z.ptx, z.bty + 2)], chamber);
console.log('BJ583 LIGHT:', JSON.stringify(light));

const cells = await page.evaluate((z) => {
  const floor = [[z.ptx - 2, z.bty + 2], [z.ptx - 1, z.bty + 2], [z.ptx, z.bty + 2]];
  const air = [[z.ptx + 1, z.bty - 2], [z.ptx + 2, z.bty - 2], [z.ptx + 3, z.bty - 2]];
  for (const [tx, ty] of [...floor, ...air]) { const st = window.__swGame.world.store; st.wire[st.idx(tx, ty)] |= 1; }
  return [...floor, ...air];
}, chamber);
await pump(page, 30);

async function setMode(m) {
  await page.evaluate((mm) => { window.__swGame.player.builderAccStatus[4] = mm; }, m);
  for (let i = 0; i < 20; i++) {
    await pump(page, 4);
    const ok = await page.evaluate((mm) => window.__swGame.renderer.wireModes[0] === mm && window.__swGame.renderer.wireModes[1] === 0, m);
    if (ok) break;
  }
  await pump(page, 6);
}
const res = {};
for (const mode of [0, 1, 3, 0]) {
  await setMode(mode);
  res[`mode${mode}`] = {
    wireModes0: await page.evaluate(() => window.__swGame.renderer.wireModes[0]),
    crops: await page.evaluate((c) => c.map(([tx, ty]) => window.__cropReds(tx, ty)), cells),
  };
}
console.log('BJ583 DARK-FINAL:', JSON.stringify(res));
await browser.close();
