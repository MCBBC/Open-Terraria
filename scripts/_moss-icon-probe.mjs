// _sunflower-icon-probe:多格放置物图标缺损验证(向日葵 276→place_v_536_xenon_moss_block)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const id = 10360;   // place_v_536_xenon_moss_block
  // 走 UI.iconUrl 同链:atlasIconForKey → vrect(27,0,0,32,64)
  const { atlasIconForKey } = await import('/src/assets/SpriteAtlas.ts');
  const def = g.assets ? undefined : undefined;
  let ar = null;
  for (let i = 0; i < 40 && !ar; i++) {   // vmeta 懒加载首调 null,轮询自愈
    ar = atlasIconForKey(g.atlas, 'place_v_536_xenon_moss_block');
    if (!ar) await new Promise((r) => setTimeout(r, 250));
  }
  if (!ar) return { err: 'atlasIconForKey null(40 次轮询后)' };
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, 0, ar.sw, ar.sh);
  // 统计不透明像素(完整向日葵≈760px@1x)
  const d = cx.getImageData(0, 0, ar.sw, ar.sh).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 64) n++;
  return { sw: ar.sw, sh: ar.sh, opaque: n, url: c.toDataURL() };
});
if (res.url) {
  await page.setContent(`<img id="i" src="${res.url}" style="image-rendering:pixelated;transform:scale(3);transform-origin:top left">`);
  await new Promise((r) => setTimeout(r, 500));
  const el = await page.$('#i');
  await el.screenshot({ path: '/tmp/sunflower-icon.png' });
}
console.log(JSON.stringify({ sw: res.sw, sh: res.sh, opaque: res.opaque, err: res.err }));
// 完整向日葵基准 760px;缺损(16×16 左上角)约 100-200px
console.log(`${res.opaque > 500 ? 'PASS' : 'FAIL'}: 图标不透明像素 ${res.opaque}(完整≈760,缺损<250)`);
await browser.close();
process.exit(0);
