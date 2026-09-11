// IIII243 附属:截图通道定谳②——逐 canvas drawImage 后即时数非零,锁定空源层。
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
  await bootstrap(page, ORIGIN);
  await front(page);
  await page.evaluate(() => {
    void window.__swFlow.createWorldProbe({ name: 'shot', seed: 'shot243', size: 0, difficulty: 0, evil: -1, w: 4200, h: 1200 })?.catch?.(() => {});
  });
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await page.evaluate(() => { const u = window.__swGenUi; return !!(u && u.layoutRects.preview && u.layoutRects.tips); }).catch(() => false)) break;
  }
  await front(page);
  await new Promise((r) => setTimeout(r, 300));
  const rep = await page.evaluate(() => {
    const w = innerWidth, h = innerHeight;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const count = () => {
      const d = ctx.getImageData(0, 0, w, h).data;
      let nz = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) nz++;
      return nz;
    };
    const steps = [];
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      let err = null;
      try { ctx.drawImage(c, r.left, r.top, r.width, r.height); } catch (e) { err = String(e?.name ?? e); }
      steps.push({ key: c.id || c.className || c.width + 'x' + c.height, nz: count(), err });
    }
    return { steps, url: out.toDataURL('image/png') };
  });
  console.log(JSON.stringify(rep.steps));
  writeFileSync(join(OUT, 'composite2-1280x720.png'), Buffer.from(rep.url.split(',')[1], 'base64'));
  console.log('saved composite2');
} finally {
  await browser.close();
}
process.exit(0);
