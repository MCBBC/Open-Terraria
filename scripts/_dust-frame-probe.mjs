// 尾迹尘"方块化"定案探针：spawn 参数读回 + bake pair 逐 texel dump。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, R = g.renderer;
  const vd = g.vanillaDust;
  const res = {};
  // ① spawn 参数读回（尾焰参数仿 Arrow :3629：type31 alpha100 scale1.5；type6 alpha100）
  for (const ty of [6, 31]) {
    const d = vd.spawn(100, 100, 8, 8, ty, 0, 0, 100, null, 1.5, { perfect: true });
    if (d) { d.noGravity = true; d.active = false; }   // 取参数即杀（不污染画面）
    res['spawn' + ty] = d ? { alpha: d.alpha, fx: d.fx, fy: d.fy, scale: +d.scale.toFixed(2) } : null;
  }
  // ② bake pair dump（31 号帧、alpha=100 → m=(155/255)）
  const img = R.atlas.ensureVImage('vanilla/Dust.png');
  const m = Math.round(155 / 255 * 255);
  const pair = R.dustPremulPair(img, 310, 0, m / 255, m / 255, m / 255, 155 / 255);
  const pc = pair.add.getContext('2d', { willReadFrequently: true });
  const pd = pc.getImageData(0, 0, 8, 8).data;
  const ec = pair.erase.getContext('2d', { willReadFrequently: true });
  const ed = ec.getImageData(0, 0, 8, 8).data;
  const dump = (d) => {
    const rows = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 8; x++) {
        const i = (y * 8 + x) * 4;
        row.push(`${d[i]},${d[i + 1]},${d[i + 2]},${d[i + 3]}`);
      }
      rows.push(row.join(' '));
    }
    return rows;
  };
  res.addDump = dump(pd);
  res.eraseDump = dump(ed);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
