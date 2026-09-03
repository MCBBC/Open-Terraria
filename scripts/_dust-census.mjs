// 池普查：统计活跃尘的 type×alpha 分布（定位"黑实心方块"尘的真实 type 与 alpha 档）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const vd = window.__swGame.vanillaDust;
  const pool = vd.pool;
  const byType = new Map();
  for (const d of pool) {
    if (!d.active) continue;
    const k = d.type;
    const e = byType.get(k) ?? { n: 0, alphas: [], scales: [] };
    e.n++; e.alphas.push(d.alpha); e.scales.push(+d.scale.toFixed(2));
    byType.set(k, e);
  }
  const rows = [...byType.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20)
    .map(([t, e]) => ({ type: t, n: e.n, alpha: [...new Set(e.alphas)].slice(0, 4), scale: [...new Set(e.scales)].slice(0, 3) }));
  return { total: rows.reduce((s, r) => s + r.n, 0), rows };
});
console.log(JSON.stringify(out));
await browser.close();
