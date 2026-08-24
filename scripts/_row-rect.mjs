// 一次性:列表行内部矩形测量——info/sub/btns 实际位置 vs 预期分区。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1200));
await new Promise((r) => setTimeout(r, 1500));
const clouds = await page.evaluate(() => {
  const sky = window.__swMenuBg.sky;
  const v = sky.vclouds;
  return {
    count: v.length,
    scales: v.slice(0, 8).map((c) => +c.scale.toFixed(2)),
    ys: v.slice(0, 8).map((c) => Math.round(c.y)),
    xs: v.slice(0, 8).map((c) => Math.round(c.x)),
    alphas: v.slice(0, 4).map((c) => +c.alpha.toFixed(2)),
    surfaceY: sky.fx.surfaceY,
    weatherRef: !!sky.weatherRef,
  };
});
console.log('CLOUDS:', JSON.stringify(clouds));
  // 夜空连拍:切深夜(vTime=16200)等坠星,三帧间隔 250ms 截天空区
  await page.evaluate(() => {
    const mb = window.__swMenuBg;
    mb.vTime = 16200; mb.dayTime = false;
  });
  await new Promise((r) => setTimeout(r, 1500));
  for (let k = 0; k < 3; k++) {
    await page.screenshot({ path: `/tmp/meteor-${k}.png`, clip: { x: 0, y: 0, width: 1280, height: 500 } });
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log('meteor shots saved');
  const vals = await page.evaluate(() => {
    const sky = window.__swMenuBg.sky;
    const cv = window.__swMenuBg.canvas;
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 150, cv.width, 300).data;
    let lit = 0;
    for (let y = 0; y < 300; y += 4) {
      for (let x = 0; x < cv.width; x += 4) {
        const i = (y * cv.width + x) * 4;
        if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) lit++;
      }
    }
    // 隔离测试:独立画布手动调 drawVanillaClouds,数非透明像素
    const iso = await new Promise((res) => {
      const cv = document.createElement('canvas');
      cv.width = 1280; cv.height = 800;
      const ctx = cv.getContext('2d');
      const sky2 = window.__swMenuBg.sky;
      sky2['drawVanillaClouds'](ctx, 1280, 800, false, 16.7, 0, 3500);
      const d = ctx.getImageData(0, 0, 1280, 800).data;
      let opaque = 0; const rows = {};
      for (let y = 0; y < 800; y += 8) {
        let n = 0;
        for (let x = 0; x < 1280; x += 8) {
          if (d[(y * 1280 + x) * 4 + 3] > 40) n++;
        }
        if (n > 0) rows[y] = n;
        opaque += n;
      }
      res({ opaque, rows });
    });
    console.log('ISO:', JSON.stringify(iso));
    const types = {};
    for (const c of sky.vclouds) types[c.type] = (types[c.type] || 0) + 1;
    const texReady = sky.cloudTexs.map((t) => (t && t.width > 0) ? 1 : 0);
    return { cots: sky.cots, lit, types, texReady: texReady.join(''),
      useGL: sky.useGLClouds, glLayer: !!sky.cloudGlLayer };
  });
  console.log('VALS:', JSON.stringify(vals));
await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === '单人模式');
  el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el?.click();
});
await new Promise((r) => setTimeout(r, 1500));
// 现建一个角色(默认外观)再量
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')].find((x) => !x.textContent.includes('返回'));
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const b = document.querySelector('.sw-char-panel [data-act=create]');
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const item = document.querySelector('.sw-vitem');
  if (!item) return { err: 'no item' };
  const ir = item.getBoundingClientRect();
  const q = (sel) => {
    const e = item.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { sel, x: +(r.x - ir.x).toFixed(0), y: +(r.y - ir.y).toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), text: e.textContent.trim().slice(0, 12) };
  };
  return {
    item: { w: +ir.width.toFixed(0), h: +ir.height.toFixed(0) },
    parts: ['.sw-vitem-doll', '.sw-vitem-info', '.sw-vitem-info .name', '.sw-vitem-info .sub', '.sw-vitem-btns', '.sw-vitem-del'].map(q),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
