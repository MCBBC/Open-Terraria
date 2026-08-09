// TrapShot 贴图诊断:vimages 是否加载 + 各 PNG 内容分布(padding 定位)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 180000 });

const out = await page.evaluate(async () => {
  const res = {};
  // 进世界后 atlas 才挂载
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  // 等世界生成完毕(最多 240s)
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  res.waitMs = Date.now() - t0;
  res.hasGame = !!window.__swGame;
  res.hasWorld = !!(window.__swGame && window.__swGame.world);
  const g = window.__swGame;
  const atlas = g?.renderer?.atlas;
  res.atlasLoaded = !!atlas;
  if (atlas) {
    for (const p of ['vanilla/Projectile_98.png', 'vanilla/Projectile_99.png', 'vanilla/Projectile_184.png', 'vanilla/Projectile_185.png', 'vanilla/Projectile_187.png', 'vanilla/Projectile_654.png']) {
      res[p] = atlas.vimages.has(p);
    }
  }
  // 2) 内容分布:每行不透明像素数(定位 sprite 在图内的实际位置)
  res.rows = {};
  for (const n of [98, 184, 185]) {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = `sprites/vanilla/Projectile_${n}.png`; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, im.width, im.height).data;
    const rows = [];
    for (let y = 0; y < im.height; y++) {
      let n2 = 0;
      for (let x = 0; x < im.width; x++) if (d[(y * im.width + x) * 4 + 3] > 30) n2++;
      rows.push(n2);
    }
    res.rows[n] = { w: im.width, h: im.height, perRow: rows };
  }
  return res;
});
console.log(JSON.stringify(out, (k, v) => k === 'perRow' ? v.join(',') : v, 1));
await browser.close();
