// PNG 颜色分析:载入截图 → 每 4px 采样分类 → ASCII 图(stdout)
// 用法: node tools/run-diag.mjs scripts/_pngprobe.mjs <png> [sampleStep]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.filter((a) => !a.startsWith('--'));
const PNG = argv[2] ?? '/tmp/wf5-1.png';
const STEP = parseInt(argv[3] ?? '8', 10);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 400, height: 300 } });
const page = await browser.newPage();
const b64 = readFileSync(PNG).toString('base64');
const lines = await page.evaluate(([b64, STEP]) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  return new Promise((res) => {
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const out = [];
      for (let y = 0; y < img.height; y += STEP) {
        let row = '';
        for (let x = 0; x < img.width; x += STEP) {
          const d = ctx.getImageData(x, y, 1, 1).data;
          const [r, g, b] = [d[0], d[1], d[2]];
          // 分类:水系蓝 / 瀑布亮纹(高亮低饱和) / 花岗岩灰 / 黑暗 / 火把橙
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          let ch = '.';
          if (r < 25 && g < 25 && b < 25) ch = ' ';                      // 黑
          else if (b > r + 30 && b > 70) ch = 'W';                       // 水(蓝)
          else if (mx > 200 && mx - mn < 45) ch = '#';                   // 亮白/灰白(瀑布亮纹)
          else if (r > 140 && g > 60 && g < 160 && b < 80) ch = 'O';     // 橙(火把/岩浆)
          else if (mx - mn < 40 && mx > 45) ch = 'g';                    // 灰(花岗岩)
          else if (mx > 110) ch = '+';                                   // 其它亮
          else ch = ',';
          row += ch;
        }
        out.push(row);
      }
      res(out);
    };
  });
}, [b64, STEP]);
for (const l of lines) console.log(l);
await browser.close();
