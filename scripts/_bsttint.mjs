import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1800));
await page.evaluate(async () => {
  const mod = await import('/src/data/Bestiary.ts');
  mod.bestiaryGating.unlockAll = true;
  let best = null, bestN = 0;
  document.querySelectorAll('.sw-panel').forEach((p) => {
    const n = p.querySelectorAll('.sw-slot').length;
    if (n > bestN) { bestN = n; best = p; }
  });
  if (best) best.style.display = 'block';
});
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent ?? '') === '图鉴');
  if (b) b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 1600));
const out = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.sw-bst-cell'));
  const target = cells.find(c => (c.querySelector('.sw-bst-name')?.textContent ?? '') === '绿史莱姆');
  if (!target) return { found: false, n: cells.length, sample: cells.slice(0, 12).map(c => c.querySelector('.sw-bst-name')?.textContent) };
  const stat = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let green = 0, gray = 0, semi = 0, minY = 1e9, maxY = -1;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (d[i + 3] < 40) continue;
      semi++;
      const x = p % cv.width, y = (p / cv.width) | 0;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 25) green++;
      else if (Math.abs(d[i] - d[i + 1]) < 14 && Math.abs(d[i + 1] - d[i + 2]) < 14) gray++;
    }
    return { semi, green, gray, hSpan: maxY - minY };
  };
  const slime = stat(target.querySelector('canvas'));
  const zom = cells.find(c => (c.querySelector('.sw-bst-name')?.textContent ?? '') === '僵尸');
  const zombie = zom ? stat(zom.querySelector('canvas')) : null;
  return { found: true, slime, zombie };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: '/tmp/bst-panel.png' });
console.log('shot saved');
await browser.close();
