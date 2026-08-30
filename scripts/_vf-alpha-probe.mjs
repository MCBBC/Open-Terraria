// 官方表 alpha 数字取证:sheet 53/40/1 若干帧格的 16×16 内容区 alpha
// ——边一圈 + 中心行/列,判定"内容区透明"是事实还是取样错位。
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
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
const res = await p.evaluate(async () => {
  const atlas = window.__swGame.renderer.atlas;
  const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 512;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const report = [];
  const probe = (sheet, fx, fy) => {
    const img = atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`);
    if (!img) return { sheet, fx, fy, err: 'noimg' };
    c.clearRect(0, 0, 4096, 512);
    c.drawImage(img, 0, 0);
    const ox = Math.floor(fx / 18) * 18, oy = Math.floor(fy / 18) * 18;
    const d = c.getImageData(ox, oy, 18, 18).data;
    // 打印完整 18×18 的 alpha 行(压缩为 . 和 #)
    const rows = [];
    for (let y = 0; y < 18; y++) {
      let s = '';
      for (let x = 0; x < 18; x++) {
        const a = d[(y * 18 + x) * 4 + 3];
        s += a === 0 ? '.' : a < 255 ? '+' : '#';
      }
      rows.push(s);
    }
    return { sheet, fx, fy, imgW: img.width, imgH: img.height, rows };
  };
  report.push(probe(53, 72, 0));   // 标注格用的可疑帧
  report.push(probe(53, 18, 18));  // 全连内帧参照(golden 钉值)
  report.push(probe(53, 0, 54));   // 经典左边缘参照
  return report;
});
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/alpha-report.json', JSON.stringify(res, null, 1));
await b.close();
