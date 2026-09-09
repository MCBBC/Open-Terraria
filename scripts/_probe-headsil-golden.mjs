import puppeteer from 'puppeteer-core';
// 金标 harness:drawHead 描边路径 hoist 改造(刀1)的逐像素等价性验证。
// OLD = 交错式(每次 blit 前重制剪影,单 scratch);NEW = hoist 式(双槽各生成一次)。
// 断言:同输入同状态(含 globalAlpha a² 语义、24×22/40×32 槽位复用)下 ImageData 逐字节相等。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try { await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
  catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

const result = await page.evaluate(() => {
  // 合成头像:含半透明像素与非整像素边缘(source-in 语义敏感)
  const mkHead = (w, h, tag) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#c88'; g.fillRect(2, 6, w - 4, h - 10);
    g.fillStyle = 'rgba(80,40,120,0.55)'; g.beginPath(); g.arc(w / 2, h / 2, h / 2.4, 0, 7); g.fill();
    g.fillStyle = '#535'; g.fillRect(w * 0.3, 0, w * 0.4, 8);
    g.fillStyle = `rgba(${tag},${(tag * 7) % 200},60,0.8)`; g.fillRect(0, h - 4, w, 3);
    return c;
  };
  // OLD:交错单槽(改造前逐行复刻)
  const oldSilScratch = document.createElement('canvas');
  const oldSil = (img, sw, sh, color) => {
    const sc = oldSilScratch;
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const c = sc.getContext('2d');
    c.clearRect(0, 0, sw, sh);
    c.drawImage(img, 0, 0, sw, sh, 0, 0, sw, sh);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'source-over';
    return sc;
  };
  const OLD = (ctx, img, sw, sh, border) => {
    const a = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = a * a;
    for (const [dx, dy] of [[-4, 0], [-2, -2], [0, -4], [2, -2], [4, 0], [2, 2], [0, 4], [-2, 2]]) {
      const s = oldSil(img, sw, sh, '#000000');
      ctx.drawImage(s, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
    }
    for (const [dx, dy] of [[-2, 0], [0, -2], [2, 0], [0, 2]]) {
      const s = oldSil(img, sw, sh, border);
      ctx.drawImage(s, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
    }
    ctx.globalAlpha = a;
  };
  // NEW:双槽 hoist(改造后逐行复刻)
  const newSilScratch = [null, null];
  const newSil = (img, sw, sh, color, slot) => {
    const sc = newSilScratch[slot] ??= document.createElement('canvas');
    if (sc.width !== sw || sc.height !== sh) { sc.width = sw; sc.height = sh; }
    const c = sc.getContext('2d');
    c.clearRect(0, 0, sw, sh);
    c.drawImage(img, 0, 0, sw, sh, 0, 0, sw, sh);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, sw, sh);
    c.globalCompositeOperation = 'source-over';
    return sc;
  };
  const NEW = (ctx, img, sw, sh, border) => {
    const a = ctx.globalAlpha;
    if (a < 1) ctx.globalAlpha = a * a;
    const silB = newSil(img, sw, sh, '#000000', 0);
    const silC = newSil(img, sw, sh, border, 1);
    for (const [dx, dy] of [[-4, 0], [-2, -2], [0, -4], [2, -2], [4, 0], [2, 2], [0, 4], [-2, 2]]) {
      ctx.drawImage(silB, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
    }
    for (const [dx, dy] of [[-2, 0], [0, -2], [2, 0], [0, 2]]) {
      ctx.drawImage(silC, -sw / 2 + dx, -sh / 2 + dy, sw, sh);
    }
    ctx.globalAlpha = a;
  };
  const render = (fn, img, sw, sh, border, a) => {
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200;
    const ctx = cv.getContext('2d');
    ctx.save(); ctx.translate(100, 100); ctx.scale(1.1, 1.1);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = a;
    fn(ctx, img, sw, sh, border);
    ctx.globalAlpha = a;
    ctx.drawImage(img, 0, 0, sw, sh, -sw / 2, -sh / 2, sw, sh);  // 本体(共同尾部)
    ctx.restore();
    return ctx.getImageData(0, 0, 200, 200).data;
  };
  const cases = [];
  for (const a of [1, 0.6, 0.15]) {
    for (const [sw, sh] of [[40, 32], [24, 22]]) {
      const img = mkHead(sw, sh, sw + sh);
      const oldD = render(OLD, img, sw, sh, 'rgb(255,50,50)', a);
      const newD = render(NEW, img, sw, sh, 'rgb(255,50,50)', a);
      let diff = 0;
      for (let i = 0; i < oldD.length; i++) if (oldD[i] !== newD[i]) diff++;
      cases.push({ a, sw, sh, diffBytes: diff, equal: diff === 0 });
    }
  }
  // 槽位复用序列:40×32 后接 24×22(验证 resize 门),旧单槽 vs 新双槽
  {
    const imgA = mkHead(40, 32, 72), imgB = mkHead(24, 22, 46);
    const oldD = render(OLD, imgA, 40, 32, 'rgb(50,200,50)', 0.8);
    const newD = render(NEW, imgA, 40, 32, 'rgb(50,200,50)', 0.8);
    const oldD2 = render(OLD, imgB, 24, 22, 'rgb(50,200,50)', 0.8);
    const newD2 = render(NEW, imgB, 24, 22, 'rgb(50,200,50)', 0.8);
    let d1 = 0, d2 = 0;
    for (let i = 0; i < oldD.length; i++) { if (oldD[i] !== newD[i]) d1++; if (oldD2[i] !== newD2[i]) d2++; }
    cases.push({ case: '槽位复用 40x32→24x22', diffBytes: d1 + d2, equal: d1 + d2 === 0 });
  }
  return cases;
});
console.log(JSON.stringify(result, null, 1));
const allEq = result.every(r => r.equal);
console.log(allEq ? 'GOLDEN PASS: 逐像素全等' : 'GOLDEN FAIL');
await browser.close();
process.exit(allEq ? 0 : 2);
