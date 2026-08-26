// 一次性:发型列表 904×404 修复实证探针(经 tools/run-diag.mjs 运行)
// 用法:SW_ORIGIN=http://localhost:5241 node tools/run-diag.mjs scripts/_cc-hair404-probe.mjs
// 断言:
//   ①开建号面板→切发型页,全程 /sprites/ 404 数 ≤ 14(仅设计内 Player_2_* 女体缺
//     通道回退键;修复前 = 452 键×2 波全 404)
//   ②404 中不得出现 vanilla-ui/ 前缀外的散键(如 /sprites/Player_Hair_5.png 直发)
//   ③发型网格缩略图挂上烘焙 sheet(背景图 url(data:…) 且 dataURL 尺寸=213 格账面)
//   ④切页二刷零新增 404(uiimages/失败 TTL 命中)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
const OUT = '/tmp/sw-cc-hair404';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errs = [];
const notFound = [];   // {url, stack}
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('response', (r) => {
  if (r.status() === 404) {
    notFound.push({ url: r.url().replace(ORIGIN, ''), frame: r.frame()?.url() ?? '' });
  }
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForSelector('#sw-splash', { hidden: true, timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));
await page.mouse.click(6, 6);   // 音频门真点(探针坑:音频门会吃掉首次 page.click)
await new Promise((r) => setTimeout(r, 300));
const t0 = Date.now();
await page.click('.sw-title-menu [data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
const nfBeforePanel = notFound.length;
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('.sw-char-panel', { timeout: 10000 });

// ---- 发型页:计时到缩略图 sheet 就位 ----
await page.click('.sw-cc-tab[data-tab=hair]');
const sheetInfo = await page.waitForFunction(() => {
  const t = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
  const bg = t?.style.backgroundImage || '';
  return bg.startsWith('url("data:image/png') ? bg : false;
}, { timeout: 60000, polling: 120 }).then((h) => h.jsonValue()).catch(() => null);
const tSheet = Date.now() - t0;
await new Promise((r) => setTimeout(r, 700));

const gridInfo = await page.evaluate(() => {
  const thumbs = [...document.querySelectorAll('.sw-cc-hairbtn .sw-cc-thumb')];
  const bg = thumbs[0]?.style.backgroundImage || '';
  const m = /^url\("data:image\/png;base64,/.test(bg);
  let cells = 0;
  if (m) {
    const img = new Image();
    // 同步量测:借 canvas 从 dataURL 解出 sheet 尺寸(异步 decode 在 evaluate 外做不了,
    // 直接用_img天然异步——waitForFunction 外部已经等过,这里只读 style)
  }
  return {
    thumbCount: thumbs.length,
    withSheet: thumbs.filter((t) => (t.style.backgroundImage || '').startsWith('url(')).length,
    dataUrlHead: bg.slice(0, 30),
    isDataPng: m,
    hairBtns: document.querySelectorAll('.sw-cc-hairbtn').length,
  };
});

// sheet 像素实证:dataURL 解码统计非透明格数(213 格账面,允许个别空格)
let sheetCells = 0, sheetSize = null;
if (gridInfo.isDataPng) {
  sheetCells = await page.evaluate(async () => {
    const bg = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb').style.backgroundImage;
    const url = bg.slice(bg.indexOf('(') + 1).replace(/^[("']+|[)"']+$/g, '');
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const cols = 10, cell = 44;
    const rows = Math.ceil(cv.height / cell);
    let nonEmpty = 0;
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let r0 = 0; r0 < rows; r0++) for (let c0 = 0; c0 < cols; c0++) {
      let opaque = 0;
      for (let y = 0; y < cell && opaque < 8; y++) for (let x = 0; x < cell; x++) {
        const i = (((r0 * cell + y) * cv.width) + c0 * cell + x) * 4;
        if (d[i + 3] > 16) { opaque++; break; }
      }
      if (opaque > 0) nonEmpty++;
    }
    return nonEmpty;
  });
  sheetSize = await page.evaluate(() => {
    const bg = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb').style.backgroundImage;
    const m = bg.match(/data:image\/png;base64,/);
    return m ? 'decoded-in-page' : null;
  });
}

// ---- 二刷:切走再切回,断言零新增 404 ----
const nfBeforeReswitch = notFound.length;
await page.click('.sw-cc-tab[data-tab=look]');
await new Promise((r) => setTimeout(r, 900));
await page.click('.sw-cc-tab[data-tab=hair]');
await new Promise((r) => setTimeout(r, 1600));
const nfAfterReswitch = notFound.length;

const nfSprites = notFound.filter((x) => x.url.includes('/sprites/'));
const nfDirect = nfSprites.filter((x) => /\/sprites\/(?!vanilla-ui\/)[^/]+\.png/.test(x.url));
const nfUrls = [...new Set(nfSprites.map((x) => x.url))];

await page.screenshot({ path: `${OUT}/hair-fixed.png` });
const pass = gridInfo.withSheet === gridInfo.thumbCount
  && gridInfo.thumbCount === 213
  && sheetCells >= 200
  && nfDirect.length === 0
  && nfSprites.length <= 14
  && nfAfterReswitch === nfBeforeReswitch;
console.log(JSON.stringify({
  PASS: pass,
  tSheetMs: tSheet,
  gridInfo, sheetCells,
  nf404: { total: notFound.length, sprites: nfSprites.length, beforePanel: nfBeforePanel, directNonVanillaUi: nfDirect.length, urls: nfUrls.slice(0, 16) },
  reswitch: { before: nfBeforeReswitch, after: nfAfterReswitch, delta: nfAfterReswitch - nfBeforeReswitch },
  errs: errs.slice(0, 6),
}, null, 1));
await browser.close();
process.exit(pass ? 0 : 3);
