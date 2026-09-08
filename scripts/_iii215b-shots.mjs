// ★IIIII215b 一次性验收探针③：anniversary 生成屏 HotPink 视觉取证（小世界 gen ~40-60s,
//   15/30/45s 三连拍 + zenith 反写帧取证）。
//   SW_ORIGIN=http://localhost:5273 node tools/run-diag.mjs --timeout=300000 scripts/_iii215b-shots.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5273';
const OUT = '/tmp/iii215b-out';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });

async function shots(key, seed, at) {
  await page.evaluate((cfg) => {
    void window.__swFlow.createWorldProbe(cfg)?.catch?.(() => {});
  }, { seed, size: 0, name: 'iii215b', difficulty: 0, evil: 0 });
  const t0 = Date.now();
  let i = 0;
  while (i < at.length) {
    const wait = at[i] - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 500)));
    const has = await page.evaluate(() => !!globalThis.__swGenUi && !globalThis.__swGame?.world).catch(() => false);
    if (has) { await page.screenshot({ path: `${OUT}/shot-${key}-${i + 1}.png` }).catch(() => {}); i++; }
    else if (Date.now() - t0 > 150000) break;
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 120000 });
}

await shots('anniversary', 'celebrationmk10', [30000, 45000, 60000]);
await shots('zenith', 'get fixed boi', [30000, 45000, 60000]);
console.log('SHOTS_DONE');
await browser.close();
