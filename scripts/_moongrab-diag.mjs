// 一次性:月/日抓取命中对拍 v2(2026-08-27 用户报"月亮只能 logo 区抓到")——
//  画布自登记 moonScreen/sunScreen(SkyRenderer:4077-4080) = 可见日/月绘制位真值,
//  与 DOM 命中层 rect 中心对拍;再在登记位±像素扫描复核可见性,质心处真实按下
//  验抓取闩。截图存档供目检。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));

const out = { cases: [] };
for (const [tag, t] of [['night-early', 0.9], ['night-mid', 0.05], ['day-am', 0.34375], ['day-noon', 0.5]]) {
  await page.evaluate((tt) => { window.__swMenuBg.setClockT(tt); }, t);
  await new Promise((r) => setTimeout(r, 400));   // 越过 grabUntil 300ms 冻结窗
  const res = await page.evaluate(() => {
    const bg = window.__swMenuBg;
    const sky = bg.sky;
    const el = document.querySelector('.sw-title-celestial');
    const dr = el.getBoundingClientRect();
    const cv = bg.canvas;
    const ctx = cv.getContext('2d');
    // 画布登记位附近 ±90px 窗扫亮斑(阈值 150:夜月白但可能被云遮蔽系数压暗)
    const probe = (cx, cy) => {
      if (cx == null) return null;
      const x0 = Math.max(0, Math.floor(cx - 90)), y0 = Math.max(0, Math.floor(cy - 90));
      const w = Math.min(180, cv.width - x0), h = Math.min(180, cv.height - y0);
      const img = ctx.getImageData(x0, y0, w, h).data;
      let sx = 0, sy = 0, n = 0, mx = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const l = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
        if (l > 150 && img[i + 3] > 128) { sx += x; sy += y; n++; if (l > mx) mx = l; }
      }
      return n > 20 ? { cx: +(x0 + sx / n).toFixed(1), cy: +(y0 + sy / n).toFixed(1), n, maxLuma: Math.round(mx) } : { n, maxLuma: Math.round(mx) };
    };
    return {
      dom: { x: +(dr.x + dr.width / 2).toFixed(1), y: +(dr.y + dr.height / 2).toFixed(1), w: +dr.width.toFixed(1) },
      sunScreen: sky.sunScreen ? { x: +sky.sunScreen.x.toFixed(1), y: +sky.sunScreen.y.toFixed(1) } : null,
      moonScreen: sky.moonScreen ? { x: +sky.moonScreen.x.toFixed(1), y: +sky.moonScreen.y.toFixed(1), r: sky.moonScreen.r } : null,
      blobAtMoon: probe(sky.moonScreen?.x, sky.moonScreen?.y),
      blobAtSun: probe(sky.sunScreen?.x, sky.sunScreen?.y),
      timeOfDay: +bg.clock.timeOfDay.toFixed(5),
    };
  });
  // 在可见斑质心处真实按下 → 抓取闩应咬合
  const aim = res.blobAtMoon?.cx != null ? res.blobAtMoon : (res.blobAtSun?.cx != null ? res.blobAtSun : null);
  let grab = null;
  if (aim) {
    await page.mouse.move(aim.cx, aim.cy);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 120));
    grab = await page.evaluate(() => ({
      latched: document.querySelector('.sw-title-celestial').classList.contains('grabbing'),
      timeOfDay: +window.__swMenuBg.clock.timeOfDay.toFixed(5),
    }));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 120));
  }
  out.cases.push({ tag, t, ...res, grab });
  if (tag === 'night-mid' || tag === 'night-early') {
    await page.screenshot({ path: `/tmp/moongrab-${tag}.png` });
  }
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
