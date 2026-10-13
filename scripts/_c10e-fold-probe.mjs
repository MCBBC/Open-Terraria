// ★c10e 折叠触发面活机判决（2026-10-12 侦察;Trace-230353 c10eCompositeIntoHud
//   56ms/s 但源码门=xform 条件帧——矛盾判决）:
//   夜晚站桩(活人)10s → 钩 c10eFullXformCond/c10eCompositeIntoHud 计数+条件值
//   分解(gravDir/dead/immune) → 折叠是否常态触发定谳。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--use-gl=angle', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await sleep(2500);

// 钉夜+站桩
await page.evaluate(() => {
  const c = window.__swGame?.world?.clock;
  if (c) c.timeOfDay = 0.75;   // 夜初
});
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const proto = Object.getPrototypeOf(r);
  window.__foldN = 0; window.__condN = 0; window.__condTrue = 0;
  window.__condWhy = [];
  const origFold = proto.c10eCompositeIntoHud;
  proto.c10eCompositeIntoHud = function (...a) { window.__foldN++; return origFold.apply(this, a); };
  const origCond = proto.c10eFullXformCond;
  proto.c10eFullXformCond = function (...a) {
    window.__condN++;
    const v = origCond.apply(this, a);
    if (v) {
      window.__condTrue++;
      if (window.__condWhy.length < 4) {
        const p = arguments[0] ?? window.__swGame.player;
        window.__condWhy.push({ gravDir: p.gravDir, dead: p.dead, immune: p.immuneAlpha, ghost: (() => { try { return p.isGhostPhase(window.__swGame.world); } catch { return '?'; } })() });
      }
    }
    return v;
  };
});
console.log('夜晚站桩计量 10s…');
await sleep(10000);
const out = await page.evaluate(() => ({
  foldN: window.__foldN,
  condN: window.__condN,
  condTrue: window.__condTrue,
  condWhy: window.__condWhy,
  gravDir: window.__swGame.player.gravDir,
  dead: window.__swGame.player.dead,
  tod: window.__swGame.world.clock.timeOfDay,
}));
console.log('VERDICT', JSON.stringify(out, null, 1));
await browser.close();
