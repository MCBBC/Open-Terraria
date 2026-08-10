// 读档沉降诊断：模拟"存档里已沉降的水"再跑一遍 settle（等价 loadWorld 路径），
// 统计 QuickWater/WaterCheck 后的 numLiquid、每轮收敛迭代数与耗时
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // 手搓与 settleLiquids 同构的循环（可观测内部状态）
  const LiquidSim = g.liquid.constructor;
  const sim = new LiquidSim(g.world);
  const t0 = performance.now();
  const tQuick0 = performance.now();
  sim.quickWater();
  const tQuick = performance.now() - tQuick0;
  sim.waterCheck();
  const afterCheck = sim.numLiquid;
  sim.quickSettle = true;
  const rounds = [];
  let totalIter = 0;
  for (let round = 0; round < 10; round++) {
    const r0 = performance.now();
    let n = 0;
    while (sim.numLiquid > 0 && n < 100000) { sim.updateLiquid(); n++; }
    const tR = performance.now() - r0;
    sim.waterCheck();
    rounds.push({ round, iter: n, ms: Math.round(tR), leftAfter: sim.numLiquid });
    totalIter += n;
    if (sim.numLiquid === 0) break;
  }
  sim.quickSettle = false;
  sim.waterCheck();
  const finalActive = sim.numLiquid;
  sim.dispose();
  const totalMs = Math.round(performance.now() - t0);
  return {
    quickWaterMs: Math.round(tQuick),
    activeAfterCheck: afterCheck,
    rounds, totalIter, totalMs, finalActive,
    worldLiquidCells: (() => {
      const st = g.world.store; let n = 0;
      for (let i = 0; i < st.liquid.length; i++) if (st.liquid[i] > 0) n++;
      return n;
    })(),
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
