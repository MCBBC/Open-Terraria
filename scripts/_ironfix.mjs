// 验证：铁甲三件（槽位序号 2/2/2）渲染后头部/躯干颜色 = 铁灰，且躯干区无翅膀状大像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199/?vuidemo=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swVUI?.ui?.current, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
const result = await page.evaluate(async () => {
  const { compositePaperDoll } = await import('/src/player/PaperDoll.ts');
  const { defaultAppearance } = await import('/src/player/Appearance.ts');
  const a = defaultAppearance('t');
  // 槽位序号（原版语义）：铁盔 head=2、铁甲 body=2、铁胫 legs=2
  const iron = compositePaperDoll(a, { head: 2, body: 2, legs: 2 });
  const wrong = compositePaperDoll(a, { head: 90, body: 81, legs: 77 });
  if (!iron || !wrong) return { fail: true };
  const region = (doll, y0, y1) => {
    const d = doll.getContext('2d').getImageData(0, 0, 40, 56).data;
    let n = 0, r = 0, g = 0, b = 0;
    for (let y = y0; y < y1; y++) for (let x = 8; x < 32; x++) {
      const i = (y * 40 + x) * 4;
      if (d[i + 3] > 40) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    }
    return n ? { n, avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] } : { n: 0, avg: [0, 0, 0] };
  };
  return {
    headIron: region(iron, 2, 16), headWrong: region(wrong, 2, 16),
    torsoIron: region(iron, 18, 34), torsoWrong: region(wrong, 18, 34),
  };
});
console.log(JSON.stringify(result));
await browser.close();
