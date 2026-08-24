// 一次性:cloudTint 微基准(命中/未命中单次成本)+缓存键分布+屏外云占比。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_menu-tint-micro.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 900 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__swMenuBg', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  const sky = mb.sky;
  const proto = Object.getPrototypeOf(sky);
  const N = 20000;
  // 找一张已就绪云贴图
  let tex = null;
  for (let i = 0; i < sky.cloudTexs.length; i++) if (sky.cloudTexs[i] && sky.cloudTexs[i].width > 0) { tex = sky.cloudTexs[i]; break; }
  if (!tex) return { err: 'no cloud tex ready' };
  // 命中路径:固定色预热一次再循环
  proto.cloudTint.call(sky, tex, 128, 128, 128);
  let t0 = performance.now();
  for (let i = 0; i < N; i++) proto.cloudTint.call(sky, tex, 128, 128, 128);
  const hitUs = (performance.now() - t0) / N * 1000;
  // 未命中路径:每循环换色(步进 8 内不重键 → 用 +8 跳桶保证 miss)
  sky.cloudTintCache.clear();
  t0 = performance.now();
  for (let i = 0; i < 3000; i++) proto.cloudTint.call(sky, tex, (i * 8) % 256, 64, 96);
  const missUs = (performance.now() - t0) / 3000 * 1000;
  // 键分布(当前实况)
  const keys = [...sky.cloudTintCache.keys()];
  const byTex = new Map();
  for (const k of keys) { const t = k.split('|')[0]; byTex.set(t, (byTex.get(t) || 0) + 1); }
  // 云实况:屏内/屏外 + 每朵颜色量化后是否互相撞键
  const W = mb.canvas.width;
  let offX = 0;
  const colorSet = new Set();
  for (const c of sky.vclouds) {
    const t2 = sky.cloudTexs[c.type];
    const w = (t2 ? t2.width : 200) * c.scale;
    if (c.x + w < -8 || c.x > W + 8) { offX++; continue; }
    colorSet.add(c.type + ':' + c.scale.toFixed(2) + ':' + c.alpha.toFixed(2));
  }
  return {
    hitUs: +hitUs.toFixed(2), missUs: +missUs.toFixed(2),
    cacheSize: sky.cacheSize ?? keys.length, distinctTexInCache: [...byTex.entries()],
    clouds: sky.vclouds.length, offX, distinctScaleAlpha: colorSet.size,
    texSize: [tex.width, tex.height],
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
