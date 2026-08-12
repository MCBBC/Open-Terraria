import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&ab=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const result = await page.evaluate(async () => {
  // A/B：原始帧 vs 镜像帧 与"已知朝向"的语义校验。
  // 人类行走帧的前倾方向 = 面朝方向。取行走帧（帧3），计算"脚带质心-头带质心"。
  // 同时对原始与镜像两个方向都算，取 |lean| 较大者为真实面朝方向
  // （镜像会翻转 lean 符号，但幅度不变——这个方法不解决朝向问题）。
  // 改用另一个客观特征：**下巴/鼻子突出侧** —— 头带下半部（鼻/下巴行）的水平伸出比上半部（额头）更远的一侧为面朝侧。
  const load = (id) => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = `sprites/vanilla/NPC_${id}.png`;
  });
  const FH = 56;
  const out = {};
  for (const id of [3, 17, 18, 22]) {
    const img = await load(id);
    if (!img) { out[id] = 'load fail'; continue; }
    const c = document.createElement('canvas');
    c.width = img.width; c.height = FH; // 帧 0
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, FH).data;
    const rows = (y) => {
      let l = c.width, r = -1;
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 100) { if (x < l) l = x; if (x > r) r = x; }
      }
      return r >= 0 ? [l, r] : null;
    };
    // 额头带（上 4-8）vs 鼻/下巴带（下 12-16）的伸出对比
    let foreL = 99, foreR = -99, chinL = 99, chinR = -99;
    for (let y = 4; y <= 8; y++) { const rr = rows(y); if (rr) { foreL = Math.min(foreL, rr[0]); foreR = Math.max(foreR, rr[1]); } }
    for (let y = 12; y <= 17; y++) { const rr = rows(y); if (rr) { chinL = Math.min(chinL, rr[0]); chinR = Math.max(chinR, rr[1]); } }
    out[id] = { fore: [foreL, foreR], chin: [chinL, chinR], w: c.width };
  }
  return out;
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
