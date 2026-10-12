// ★晨昏色扫 canvas 出生率验证（2026-10-12 tintTex 池化刀复核）:
//   时钟扫过 dawn/dusk 全程色变段,测 tintTex 出生率(池化前≈3-4 band×fps 恒 miss)
//   + 哨兵读数 + 逐栈分布。SW_ORIGIN 指向私有 vite。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('[canvas哨兵]')) console.log('[哨兵警告]', t.slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  window.__bornStacks = new Map();
  window.__bornOn = false;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) {
      const st = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim().replace(/^at\s+/, '')).join(' | ');
      window.__bornStacks.set(st, (window.__bornStacks.get(st) || 0) + 1);
    }
    return orig(tag, ...rest);
  };
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await sleep(2500);   // 烘焙洪峰出窗
await page.evaluate(() => { window.__bornOn = true; });

// 晨昏双色段各扫一遍:timeOfDay 步进驱动 colorOfTheSkies 快速扫(真机晨昏=慢扫,
// 此处加速扫描=同机制高倍率,池化有效性判定面)
const SWEEPS = [
  { name: 'dawn', from: 0.2, to: 0.32 },
  { name: 'dusk', from: 0.72, to: 0.86 },
];
// ×3 往返:第 1 遍=首烘(池空,合法出生);第 2-3 遍=键域跨帽、淘汰喂池——
// 池化生效判定面=第 2/3 遍出生率塌向 0
for (let pass = 1; pass <= 3; pass++) {
  for (const sw of SWEEPS) {
    await page.evaluate((s) => { window.__bornStacks.clear(); }, sw);
    const t0 = Date.now();
    const STEPS = 120;
    for (let i = 0; i <= STEPS; i++) {
      const tod = sw.from + (sw.to - sw.from) * (i / STEPS);
      await page.evaluate((t) => { const c = window.__swGame?.world?.clock; if (c) c.timeOfDay = t; }, tod);
      await sleep(80);   // 步间留渲染拍(总 ~10s/段)
    }
    const wall = (Date.now() - t0) / 1000;
    const stacks = await page.evaluate(() => [...window.__bornStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6));
    const total = stacks.reduce((a, s) => a + s[1], 0);
    console.log(`== P${pass} ${sw.name} 扫 wall=${wall.toFixed(1)}s 出生总数=${total} (${(total / wall).toFixed(1)}/s) ==`);
    for (const [st, n] of stacks.slice(0, 3)) console.log(`  ${String(n).padStart(6)}  ${st.slice(0, 130)}`);
  }
}
const cw = await page.evaluate(() => window.__swCanvasWatch?.() ?? null);
console.log(`[canvas哨兵] ${JSON.stringify(cw)}`);
await browser.close();
