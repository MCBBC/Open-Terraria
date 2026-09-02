// vy 写入拦截器：defineProperty 抓每次 vy 赋值（带调用栈首帧），定位清零者
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = '/Users/vinlic/Downloads/map-害兽姐妹会.json';
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  await window.__swFlow.spawnVanillaEnemy(1, 3094.5 * 16, 244.5 * 16);
  const slime = g.enemies().find((e) => e.vanillaId === 1);
  slime.w = slime.def.width = 26; slime.h = slime.def.height = 20;

  const proto = Object.getPrototypeOf(slime);
  let realVy = slime.vy;
  const writes = [];
  const mkIntercept = (prop) => {
    let val = slime[prop];
    Object.defineProperty(slime, prop, {
      get() { return val; },
      set(v) {
        if (prop !== 'vy' || v !== val) {
          const stack = (new Error().stack || '').split('\n').slice(2, 4).map((s) => s.trim().replace(/^at /, '').replace(/\/[^/]+\.ts.*$/, '').slice(0, 70));
          if (writes.length < 300) writes.push({ t: g.tickCount, prop, v: typeof v === 'number' ? +v.toFixed(3) : v, prev: typeof val === 'number' ? +val.toFixed(3) : val, stack });
        }
        val = v;
      },
      configurable: true,
    });
  };
  mkIntercept('vy'); mkIntercept('dead'); mkIntercept('hp');
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  const state = { x: +slime.x.toFixed(2), y: +slime.y.toFixed(2), vy: realVy, wet: slime.wet, ai2: slime.ai2, collideY: slime.collideY };
  delete slime.vy; // 还原原型访问器（若有）——否则留直量
  return { writes: writes.slice(0, 60), state };
}, json);
let prevT = null;
for (const w of out.writes) {
  if (w.t !== prevT) { console.log('--- tick ' + w.t + ' ---'); prevT = w.t; }
  console.log(JSON.stringify(w));
}
console.log('state:', JSON.stringify(out.state));
await browser.close();
