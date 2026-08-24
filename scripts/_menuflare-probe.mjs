// 一次性:菜单侧镜头光斑链取证——vTime=48000(日落,sun x≈1226 屏内)/6000(日出 x≈54)
// 菜单时钟 26×,设完 vTime 200ms 内截图
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 100 && !await p.evaluate(() => !!window.__swMenuBg).catch(() => false); i++) await sleep(1000);
for (let i = 0; i < 30; i++) {
  if (await p.evaluate(() => !document.querySelector('.layer.back')).catch(() => true)) break;
  await sleep(500);
}
for (const [tag, T] of [['dusk', 48000], ['dawn', 6000]]) {
  await p.evaluate((t) => {
    const mb = window.__swMenuBg;
    mb.dayTime = true;
    mb.vTime = t;
  }, T);
  await sleep(180);
  await p.screenshot({ path: `${OUT}/menu-flare-${tag}.png` });
  const st = await p.evaluate(() => {
    const s = window.__swMenuBg.sky;
    const v = s.horizonVisCache;
    return {
      sun: s.sunScreen ? { x: Math.round(s.sunScreen.x), y: Math.round(s.sunScreen.y) } : null,
      sunset: v ? +v.sunset.toFixed(3) : 0,
      sunrise: v ? +v.sunrise.toFixed(3) : 0,
      occ: +(s.sunVisibility ?? -1).toFixed(3),
      sampled: s.sunVisSampled
    };
  });
  console.log(`${tag}:`, JSON.stringify(st));
}
await b.close();
console.log('DONE');
