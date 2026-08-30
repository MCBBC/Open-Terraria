// 全表孔洞地图:sheet53 每格(18 栅格)内容区透明像素数,字符图输出。
// 目的:判定链帧值落进的是"过渡镂空区"还是"实心平铺区"。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (6).json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 90; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(2500);
for (const SHEET of [53, 40]) {
  const out = await p.evaluate(async (sheet) => {
    const atlas = window.__swGame.renderer.atlas;
    const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
    const meta = atlas.vmeta(sheet);
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height).data;
    const cols = Math.floor(img.width / 18), rows = Math.floor(img.height / 18);
    const grid = [];
    for (let gy = 0; gy < rows; gy++) {
      let s = '';
      for (let gx = 0; gx < cols; gx++) {
        let holes = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          if (d[((gy * 18 + y) * img.width + gx * 18 + x) * 4 + 3] === 0) holes++;
        }
        s += holes === 0 ? '#' : holes <= 8 ? '8' : holes <= 32 ? 'x' : ' ';
      }
      grid.push(s.padEnd(cols) + `   row${gy}(fy=${gy * 18})`);
    }
    return { sheet, cols, rows, dims: `${img.width}x${img.height}`, metaCols: meta?.cols, metaRows: meta?.rows, grid };
  }, SHEET);
  console.log(`\n=== sheet ${out.sheet} ${out.dims} meta(${out.metaCols}x${out.metaRows}) ===`);
  for (const g of out.grid) console.log(g.replace(/ /g, '·'));
}
fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/sheet-map.txt', 'done');
await b.close();
