// _blue-icon-probe:蓝方块回退取证(place_v_179/382/477/205 + 阿比盖尔花)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5214') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const keys = [
    'place_v_179_green_moss_block',
    'place_v_382_flower_vines',
    'place_v_477_mowed_grass_block',
    'place_v_205_crimson_vines',
    'place_v_517_abigails_flower',
  ];
  const { atlasIconForKey } = await import('/src/assets/SpriteAtlas.ts');
  const res = [];
  for (const key of keys) {
    const id = g.itemId(key);
    let ar = null;
    for (let i = 0; i < 30 && !ar; i++) {
      ar = atlasIconForKey(g.atlas, key);
      if (!ar) await new Promise((r) => setTimeout(r, 200));
    }
    let px = null;
    if (ar) {
      const c = document.createElement('canvas');
      c.width = ar.sw; c.height = ar.sh;
      const cx = c.getContext('2d');
      cx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 0, 0, ar.sw, ar.sh);
      const d = cx.getImageData(0, 0, ar.sw, ar.sh).data;
      const cnt = {};
      let n = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 64) { n++; const k2 = d[i - 3] + ',' + d[i - 2] + ',' + d[i - 1]; cnt[k2] = (cnt[k2] || 0) + 1; }
      }
      px = { sw: ar.sw, sh: ar.sh, opaque: n, top: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3) };
      res.push({ key, px, url: c.toDataURL() });
    } else {
      res.push({ key, ar: 'null(30 次轮询)' });
    }
  }
  return res;
});
for (const r of out) {
  console.log(r.key, JSON.stringify(r.px || r.ar));
  if (r.url) {
    await page.setContent(`<img src="${r.url}" style="image-rendering:pixelated;transform:scale(4);transform-origin:top left">`);
    await new Promise((s) => setTimeout(s, 300));
    const el = await page.$('img');
    await el.screenshot({ path: `/tmp/blue-${r.key.match(/place_v_(\d+)/)[1]}.png` });
  }
}
console.log('errors:', errors.slice(0, 2).join(' | '));
await browser.close();
