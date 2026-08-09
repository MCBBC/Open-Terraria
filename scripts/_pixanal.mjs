import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const result = await page.evaluate(async () => {
  async function analyze(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0, gray = 0, colors = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 40) continue;
      n++;
      const [r, g, b] = [d[i], d[i+1], d[i+2]];
      if (Math.abs(r-g) < 6 && Math.abs(g-b) < 6) gray++;
      const key = ((r>>4)<<8)|((g>>4)<<4)|(b>>4);
      colors.set(key, (colors.get(key)||0)+1);
    }
    const top = [...colors.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([k,v]) => ['#'+k.toString(16).padStart(3,'0'), v]);
    return { src, n, grayPct: Math.round(gray/n*100), topColors: top };
  }
  return Promise.all([
    analyze('sprites/vanilla-ui/Player_Hair_1.png'),
    analyze('sprites/vanilla-ui/HairStyleBack.png'),
    analyze('sprites/vanilla-ui/Player_0_0.png'), analyze('sprites/vanilla-ui/Player_0_1.png'),
  ]);
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
