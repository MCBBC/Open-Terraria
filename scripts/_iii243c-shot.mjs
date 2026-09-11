// IIII243 附属:创建流截图通道定谳(一次性)——枚举 canvas 清单+逐张读回非零率,
// 定 page.screenshot 黑屏(合成层丢弃)而 backing store 有内容的通道,产合成截图样张。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front, bootstrap } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii243-out';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5296';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({ viewport: { width: 1280, height: 720 } });
try {
  const page = await openPage(browser, {});
  page.__probeOrigin = ORIGIN;
  const boot = await bootstrap(page, ORIGIN);
  console.log('bootstrap', boot.ok);
  await front(page);
  await page.evaluate(() => {
    void window.__swFlow.createWorldProbe({ name: 'shot', seed: 'shot243', size: 0, difficulty: 0, evil: -1, w: 4200, h: 1200 })
      ?.catch?.(() => {});
  });
  // 等预览+提示条同帧
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const ok = await page.evaluate(() => {
      const ui = window.__swGenUi;
      return !!(ui && ui.layoutRects.preview && ui.layoutRects.tips);
    }).catch(() => false);
    if (ok) break;
  }
  await front(page);
  await new Promise((r) => setTimeout(r, 400));
  const inv = await page.evaluate(() => {
    const list = [...document.querySelectorAll('canvas')].map((c, i) => {
      const r = c.getBoundingClientRect();
      let nz = 0;
      try {
        const t = document.createElement('canvas');
        const w = Math.min(160, c.width || 1), h = Math.min(90, c.height || 1);
        t.width = w; t.height = h;
        const ctx = t.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 0) nz++;
      } catch (e) { nz = -1; }
      return { i, id: c.id || null, cls: c.className || null, cw: c.width, ch: c.height,
        css: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`,
        z: getComputedStyle(c).zIndex, nzSample: nz };
    });
    return list;
  });
  console.log(JSON.stringify(inv, null, 1));
  // 合成:DOM 序叠画全部可读 canvas → PNG
  const dataUrl = await page.evaluate(() => {
    const w = window.innerWidth, h = window.innerHeight;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      try { ctx.drawImage(c, r.left, r.top, r.width, r.height); } catch { /* 不可读层跳过 */ }
    }
    return out.toDataURL('image/png');
  });
  writeFileSync(join(OUT, 'composite-1280x720.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('composite saved');
  const buf = await page.screenshot();
  writeFileSync(join(OUT, 'pageshot-1280x720.png'), buf);
  console.log('pageshot saved');
} finally {
  await browser.close();
}
process.exit(0);
