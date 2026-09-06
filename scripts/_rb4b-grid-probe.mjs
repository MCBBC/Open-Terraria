// SW-RB4b 2026-09-06 红队复核探针:烘焙管线「满格」之谜(BB1 声称 HEAD 8/10·20/30 vs BB1 10/10·30/30)。
// 方法:真实开面板 → 等 sheet blob 落地 → 静置窗(retry 链+变体预抢全走完) → 取 blob
// 逐格采样 alpha(>16 计为画了内容)→ 输出 look 页 10 格 / hair 页 213 格实画数。
// 另录:toBlob 编码序列(宽×高)与时间线,判定 D1 落地账/键变语义在实机的表现。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: '/tmp/rb4b-grid-' + (Date.now() % 100000),
  args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
}
await page.click('[data-act=sp]');
for (let i = 0; i < 20; i++) { if (await page.$('[data-act=new]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('[data-act=new]');
for (let i = 0; i < 20; i++) { if (await page.$('.sw-cc-tab[data-tab=look]')) break; await new Promise((r) => setTimeout(r, 250)); }

await page.evaluate(() => {
  const W = window;
  W.__rb4b = { tob: [], t0: performance.now() };
  const A = W.__rb4b;
  const oTB = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    const t = performance.now();
    return oTB.call(this, (b) => { A.tob.push({ at: +(performance.now() - A.t0).toFixed(0), ms: +(performance.now() - t).toFixed(1), w: this.width, h: this.height }); cb(b); }, ...a);
  };
});

// 取某 blob URL 的逐格实画数
const sampleSheet = (url, cols, cellW, cellH, rows) => page.evaluate(async (url, cols, cellW, cellH, rows) => {
  const im = new Image();
  im.src = url;
  await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('img fail')); });
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const painted = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let hit = 0;
      const x0 = c * cellW, y0 = r * cellH;
      for (let y = y0; y < Math.min(y0 + cellH, cv.height); y += 2) {
        for (let x = x0; x < Math.min(x0 + cellW, cv.width); x += 2) {
          if (d[(y * cv.width + x) * 4 + 3] > 16) hit++;
        }
      }
      painted.push(hit > 0 ? 1 : 0);
    }
  }
  return { total: painted.length, painted: painted.reduce((a, b) => a + b, 0), misses: painted.map((p, i) => p ? null : i).filter((v) => v !== null) };
}, url, cols, cellW, cellH, rows);

const waitSheet = async (w, h, timeoutMs) => page.evaluate(async (w, h, timeoutMs) => {
  const A = window.__rb4b;
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const hit = A.tob.find((e) => e.w === w && e.h === h);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}, w, h, timeoutMs);

// blob URL:thumb 的 backgroundImage 抓取
const thumbUrl = () => page.evaluate(() => {
  const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb, .sw-cc-hairbtn .sw-cc-thumb');
  const m = (th?.style.backgroundImage ?? '').match(/url\("?([^")]+)"?\)/);
  return m ? m[1] : null;
});

console.log('--- look 页 ---');
await page.evaluate(() => document.querySelector('.sw-cc-tab[data-tab=look]').click());
const lookEnc = await waitSheet(440, 80, 30000);
console.log('look 首次编码:', JSON.stringify(lookEnc));
await new Promise((r) => setTimeout(r, 7000));   // 静置:retry 链(700ms×6)+800ms 预抢全走完
const lookUrl = await thumbUrl();
if (lookUrl) console.log('look 静置后满格采样:', JSON.stringify(await sampleSheet(lookUrl, 10, 44, 80, 1)));
const lookEncodes = await page.evaluate(() => window.__rb4b.tob.filter((e) => e.w === 440 && e.h === 80));
console.log('look 编码序列:', JSON.stringify(lookEncodes));

console.log('--- hair 页 ---');
await page.evaluate(() => document.querySelector('.sw-cc-tab[data-tab=hair]').click());
const hairEnc = await waitSheet(440, 968, 40000);
console.log('hair 首次编码:', JSON.stringify(hairEnc));
await new Promise((r) => setTimeout(r, 7000));
const hairUrl = await thumbUrl();
if (hairUrl) {
  const s = await sampleSheet(hairUrl, 10, 44, 44, 22);
  console.log('hair 静置后满格采样: total=' + s.total + ' painted=' + s.painted + ' missIdx=' + JSON.stringify(s.misses));
}
const allEnc = await page.evaluate(() => window.__rb4b.tob);
console.log('全编码时间线:', JSON.stringify(allEnc));
await browser.close();
process.exit(0);
